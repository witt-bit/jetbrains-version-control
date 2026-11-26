import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { GitService } from "./gitService.ts";
import type { RebaseCommit } from "./interactiveRebase.ts";
import type { RebaseEntry } from "./rebaseTodo.ts";
import {
  commitFile,
  createRepo,
  git,
  isolateGitEnvironment,
  makeTempDir,
  subjects,
} from "./testRepo.ts";

describe("GitService interactive rebase", () => {
  let root: string;
  let repo: string;
  let service: GitService;
  let base: string;

  before(() => isolateGitEnvironment());

  // main: Initial commit, then one commit per file f1..f4.
  beforeEach(async () => {
    root = await makeTempDir();
    repo = path.join(root, "repo");
    await createRepo(repo);
    service = new GitService(repo);
    base = (await git(repo, "rev-parse", "HEAD")).trim();
    for (const n of [1, 2, 3, 4]) {
      await commitFile(repo, `f${n}.txt`, `${n}\n`, `c${n}`);
    }
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  /** The dialog's starting list for `base..HEAD`, oldest first. */
  const rows = async (
    from: string = base,
    autosquash = false,
  ): Promise<RebaseCommit[]> =>
    (await service.getRebaseCommits({ base: from, autosquash })).commits;

  const entriesFrom = (
    list: RebaseCommit[],
    overrides: Record<string, Partial<RebaseEntry>> = {},
  ): RebaseEntry[] =>
    list.map((c) => ({
      action: c.action,
      hash: c.hash,
      subject: c.subject,
      ...overrides[c.subject],
    }));

  const body = async (rev: string) =>
    (await git(repo, "log", "-1", "--format=%B", rev)).trim();

  const exists = (file: string) =>
    fs
      .access(path.resolve(repo, file))
      .then(() => true)
      .catch(() => false);

  const scratchDir = () => path.join(repo, ".git", "jgc-rebase");

  /**
   * Two commits edit the same line; dropping the first makes the second
   * conflict. Returns the rebase base and the entries that provoke it.
   */
  const conflictScenario = async () => {
    await commitFile(repo, "shared.txt", "base\n", "shared base");
    const from = (await git(repo, "rev-parse", "HEAD")).trim();
    await commitFile(repo, "shared.txt", "one\n", "s1");
    await commitFile(repo, "shared.txt", "two\n", "s2");
    const entries = entriesFrom(await rows(from), { s1: { action: "drop" } });
    return { from, entries };
  };

  describe("getRebaseCommits", () => {
    it("lists the commits after the base, oldest first", async () => {
      const list = await rows();
      assert.deepEqual(
        list.map((c) => [c.subject, c.action]),
        [
          ["c1", "pick"],
          ["c2", "pick"],
          ["c3", "pick"],
          ["c4", "pick"],
        ],
      );
      assert.equal(list[0]?.hash.length, 40);
    });

    it("lists everything with root", async () => {
      const { commits } = await service.getRebaseCommits({ root: true });
      assert.equal(commits[0]?.subject, "Initial commit");
      assert.equal(commits.length, 5);
    });

    it("reports merges in the range", async () => {
      await git(repo, "checkout", "-q", "-b", "side", base);
      await commitFile(repo, "side.txt", "s\n", "side");
      await git(repo, "checkout", "-q", "main");
      await git(repo, "merge", "-q", "--no-ff", "-m", "merge side", "side");
      const result = await service.getRebaseCommits({ base });
      assert.equal(result.hasMerges, true);
      assert.ok(!result.commits.some((c) => c.subject === "merge side"));
    });

    it("suggests the autosquash arrangement", async () => {
      await commitFile(repo, "f5.txt", "5\n", "fixup! c2");
      const list = await rows(base, true);
      assert.deepEqual(
        list.map((c) => [c.subject, c.action]),
        [
          ["c1", "pick"],
          ["c2", "pick"],
          ["fixup! c2", "fixup"],
          ["c3", "pick"],
          ["c4", "pick"],
        ],
      );
    });

    it("refuses a base that is not a commit or looks like an option", async () => {
      await assert.rejects(
        service.getRebaseCommits({ base: "nope" }),
        /not a commit/,
      );
      await assert.rejects(
        service.getRebaseCommits({ base: "--exec=touch pwned" }),
        /not a valid base/,
      );
    });
  });

  describe("interactiveRebase", () => {
    it("reorders commits", async () => {
      const list = await rows();
      const [c1, c2, c3, c4] = entriesFrom(list);
      assert.ok(c1 && c2 && c3 && c4);
      const result = await service.interactiveRebase({
        base,
        entries: [c3, c1, c4, c2],
      });
      assert.deepEqual(result, { status: "completed" });
      assert.deepEqual(await subjects(repo), [
        "Initial commit",
        "c3",
        "c1",
        "c4",
        "c2",
      ]);
      assert.equal((await git(repo, "status", "--porcelain")).trim(), "");
      assert.equal(await exists(scratchDir()), false);
    });

    it("drops a commit", async () => {
      const entries = entriesFrom(await rows(), { c3: { action: "drop" } });
      await service.interactiveRebase({ base, entries });
      assert.deepEqual(await subjects(repo), [
        "Initial commit",
        "c1",
        "c2",
        "c4",
      ]);
      assert.equal(await exists("f3.txt"), false);
      assert.equal(await exists("f4.txt"), true);
    });

    it("squashes a commit and combines the messages", async () => {
      const entries = entriesFrom(await rows(), { c3: { action: "squash" } });
      await service.interactiveRebase({ base, entries });
      assert.deepEqual(await subjects(repo), [
        "Initial commit",
        "c1",
        "c2",
        "c4",
      ]);
      const message = await body("HEAD~1");
      assert.match(message, /c2/);
      assert.match(message, /c3/);
      assert.equal(await exists("f3.txt"), true);
    });

    it("fixes a commit up and keeps only the first message", async () => {
      const entries = entriesFrom(await rows(), { c3: { action: "fixup" } });
      await service.interactiveRebase({ base, entries });
      assert.equal(await body("HEAD~1"), "c2");
      assert.equal(await exists("f3.txt"), true);
    });

    it("rewords a commit with a multi-line message", async () => {
      const entries = entriesFrom(await rows(), {
        c2: { action: "reword", message: "Better subject\n\nWith a body.\n" },
      });
      await service.interactiveRebase({ base, entries });
      assert.deepEqual(await subjects(repo), [
        "Initial commit",
        "c1",
        "Better subject",
        "c3",
        "c4",
      ]);
      assert.equal(await body("HEAD~2"), "Better subject\n\nWith a body.");
      assert.equal(await exists("f2.txt"), true);
    });

    it("sets the final message of a squash group", async () => {
      const entries = entriesFrom(await rows(), {
        c2: { action: "reword", message: "Combined" },
        c3: { action: "squash" },
        c4: { action: "fixup" },
      });
      await service.interactiveRebase({ base, entries });
      assert.deepEqual(await subjects(repo), [
        "Initial commit",
        "c1",
        "Combined",
      ]);
      assert.equal(await exists("f4.txt"), true);
    });

    it("keeps a reword message that contains quotes and shell characters", async () => {
      const message = `It's "quoted" $(touch pwned) \`id\` & done`;
      const entries = entriesFrom(await rows(), {
        c1: { action: "reword", message },
      });
      await service.interactiveRebase({ base, entries });
      assert.equal(await body("HEAD~3"), message);
      assert.equal(await exists("pwned"), false);
    });

    it("lets git reword natively when no message is given", async () => {
      const entries = entriesFrom(await rows(), { c2: { action: "reword" } });
      const result = await service.interactiveRebase({ base, entries });
      assert.equal(result.status, "completed");
      assert.deepEqual(await subjects(repo), [
        "Initial commit",
        "c1",
        "c2",
        "c3",
        "c4",
      ]);
    });

    it("ignores configured editors, so it can never wait on one", async () => {
      await git(repo, "config", "core.editor", "false");
      await git(repo, "config", "sequence.editor", "false");
      await git(repo, "config", "rebase.autoSquash", "true");
      const entries = entriesFrom(await rows(), {
        c2: { action: "reword" },
        c3: { action: "squash" },
      });
      const result = await service.interactiveRebase({ base, entries });
      assert.equal(result.status, "completed");
      assert.deepEqual(await subjects(repo), [
        "Initial commit",
        "c1",
        "c2",
        "c4",
      ]);
    });

    it("rebases the root commit with --root", async () => {
      const { commits } = await service.getRebaseCommits({ root: true });
      const entries = entriesFrom(commits, {
        "Initial commit": { action: "reword", message: "Start" },
        c1: { action: "squash" },
      });
      await service.interactiveRebase({ root: true, entries });
      assert.deepEqual(await subjects(repo), ["Start", "c2", "c3", "c4"]);
    });

    it("transplants the commits with --onto", async () => {
      await git(repo, "checkout", "-q", "-b", "other", base);
      const onto = await commitFile(repo, "other.txt", "o\n", "other work");
      await git(repo, "checkout", "-q", "main");
      await service.interactiveRebase({
        base,
        onto,
        entries: entriesFrom(await rows()),
      });
      assert.deepEqual(await subjects(repo), [
        "Initial commit",
        "other work",
        "c1",
        "c2",
        "c3",
        "c4",
      ]);
    });

    it("lets git autosquash when no list is supplied", async () => {
      await commitFile(repo, "f5.txt", "5\n", "fixup! c2");
      const result = await service.interactiveRebase({
        base,
        autosquash: true,
      });
      assert.equal(result.status, "completed");
      assert.deepEqual(await subjects(repo), [
        "Initial commit",
        "c1",
        "c2",
        "c3",
        "c4",
      ]);
      assert.equal(await exists("f5.txt"), true);
    });

    it("keeps or drops commits that start empty", async () => {
      await git(repo, "commit", "-q", "--allow-empty", "-m", "empty one");
      await service.interactiveRebase({ base, keepEmpty: false });
      assert.ok(!(await subjects(repo)).includes("empty one"));

      await git(repo, "commit", "-q", "--allow-empty", "-m", "empty two");
      await service.interactiveRebase({ base, keepEmpty: true });
      assert.ok((await subjects(repo)).includes("empty two"));
    });

    it("moves branches that point into the range with --update-refs", async () => {
      await git(repo, "branch", "middle", "HEAD~2");
      const entries = entriesFrom(await rows(), { c1: { action: "drop" } });
      await service.interactiveRebase({ base, entries, updateRefs: true });
      assert.deepEqual(await subjects(repo, "middle"), [
        "Initial commit",
        "c2",
      ]);
    });

    it("leaves branches alone when update-refs is off", async () => {
      await git(repo, "config", "rebase.updateRefs", "true");
      await git(repo, "branch", "middle", "HEAD~2");
      const before = (await git(repo, "rev-parse", "middle")).trim();
      const entries = entriesFrom(await rows(), { c1: { action: "drop" } });
      await service.interactiveRebase({ base, entries, updateRefs: false });
      assert.equal((await git(repo, "rev-parse", "middle")).trim(), before);
    });

    it("recreates merges with --rebase-merges and no list", async () => {
      await git(repo, "checkout", "-q", "-b", "side", base);
      await commitFile(repo, "side.txt", "s\n", "side");
      await git(repo, "checkout", "-q", "main");
      await git(repo, "merge", "-q", "--no-ff", "-m", "merge side", "side");
      const result = await service.interactiveRebase({
        base,
        rebaseMerges: true,
      });
      assert.equal(result.status, "completed");
      const parents = (await git(repo, "rev-list", "--parents", "-1", "HEAD"))
        .trim()
        .split(" ");
      assert.equal(parents.length, 3, "HEAD is still a merge");
    });

    it("refuses an edited list over a merge instead of flattening it", async () => {
      await git(repo, "checkout", "-q", "-b", "side", base);
      await commitFile(repo, "side.txt", "s\n", "side");
      await git(repo, "checkout", "-q", "main");
      await git(repo, "merge", "-q", "--no-ff", "-m", "merge side", "side");
      const list = await rows();
      await assert.rejects(
        service.interactiveRebase({ base, entries: entriesFrom(list) }),
        /merge commit/,
      );
      await assert.rejects(
        service.interactiveRebase({
          base,
          rebaseMerges: true,
          entries: entriesFrom(list),
        }),
        /cannot be combined/,
      );
    });

    it("rejects a stale list instead of dropping a commit", async () => {
      const stale = entriesFrom(await rows());
      await commitFile(repo, "f5.txt", "5\n", "c5");
      await assert.rejects(
        service.interactiveRebase({ base, entries: stale }),
        /missing from the list/,
      );
      assert.deepEqual(await subjects(repo), [
        "Initial commit",
        "c1",
        "c2",
        "c3",
        "c4",
        "c5",
      ]);
    });

    it("rejects an unknown commit and an invalid list", async () => {
      const entries = entriesFrom(await rows());
      await assert.rejects(
        service.interactiveRebase({
          base,
          entries: [
            { action: "pick", hash: "a".repeat(40), subject: "x" },
            ...entries,
          ],
        }),
        /not part of the commits/,
      );
      const first = entries[0];
      assert.ok(first);
      await assert.rejects(
        service.interactiveRebase({
          base,
          entries: [{ ...first, action: "fixup" }, ...entries.slice(1)],
        }),
        /Cannot fixup the first commit/,
      );
    });

    it("refuses option-like and unknown revisions", async () => {
      await assert.rejects(
        service.interactiveRebase({ base: "--exec=touch pwned" }),
        /not a valid base/,
      );
      await assert.rejects(
        service.interactiveRebase({ base, onto: "-x" }),
        /not a valid/,
      );
      await assert.rejects(
        service.interactiveRebase({ base: "nope" }),
        /not a commit/,
      );
      await assert.rejects(service.interactiveRebase({}), /Choose the commit/);
      assert.equal(await exists("pwned"), false);
    });

    it("refuses to start over an unfinished operation", async () => {
      await git(repo, "checkout", "-q", "-b", "x", base);
      await commitFile(repo, "f1.txt", "other\n", "conflicting");
      await git(repo, "checkout", "-q", "main");
      await assert.rejects(git(repo, "merge", "x"));
      await assert.rejects(service.interactiveRebase({ base }), /in progress/);
      await git(repo, "merge", "--abort");
    });
  });

  describe("stops", () => {
    it("stops at an edit and finishes with continue", async () => {
      const entries = entriesFrom(await rows(), { c2: { action: "edit" } });
      const result = await service.interactiveRebase({ base, entries });
      assert.equal(result.status, "stopped");
      assert.equal((await service.getRebaseState()).isRebasing, true);
      assert.deepEqual(
        result.status === "stopped" ? result.conflicts : ["?"],
        [],
      );

      await fs.writeFile(path.join(repo, "extra.txt"), "x\n");
      await git(repo, "add", "extra.txt");
      await git(repo, "commit", "-q", "--amend", "--no-edit");
      await service.rebaseAction("continue");

      assert.equal((await service.getRebaseState()).isRebasing, false);
      assert.deepEqual(await subjects(repo), [
        "Initial commit",
        "c1",
        "c2",
        "c3",
        "c4",
      ]);
      assert.equal(await exists("extra.txt"), true);
    });

    describe("conflicts", () => {
      const swap = conflictScenario;

      it("leaves the rebase in progress for continue", async () => {
        const { from, entries } = await swap();
        const result = await service.interactiveRebase({ base: from, entries });
        assert.equal(result.status, "stopped");
        assert.ok(
          result.status === "stopped" && /conflict/.test(result.message),
        );
        assert.deepEqual(result.status === "stopped" ? result.conflicts : [], [
          "shared.txt",
        ]);
        assert.equal((await service.getRebaseState()).isRebasing, true);
        assert.equal(await service.isRebaseInProgress(), true);
        assert.equal(
          await exists(scratchDir()),
          true,
          "scripts survive the stop",
        );

        await fs.writeFile(path.join(repo, "shared.txt"), "merged\n");
        await service.rebaseAction("continue");
        assert.equal((await service.getRebaseState()).isRebasing, false);
        assert.equal(await service.isRebaseInProgress(), false);
        assert.equal(
          await exists(scratchDir()),
          false,
          "scripts are cleaned up",
        );
      });

      it("applies a reword that was queued behind the conflict", async () => {
        const { from, entries } = await swap();
        const [first, second] = entries;
        assert.ok(first && second);
        const result = await service.interactiveRebase({
          base: from,
          entries: [
            first,
            { ...second, action: "reword", message: "Resolved nicely" },
          ],
        });
        assert.equal(result.status, "stopped");
        await fs.writeFile(path.join(repo, "shared.txt"), "merged\n");
        await service.rebaseAction("continue");
        assert.equal(await body("HEAD"), "Resolved nicely");
        assert.equal(
          await fs.readFile(path.join(repo, "shared.txt"), "utf-8"),
          "merged\n",
        );
      });

      it("can be aborted", async () => {
        const { from, entries } = await swap();
        const head = (await git(repo, "rev-parse", "HEAD")).trim();
        await service.interactiveRebase({ base: from, entries });
        await service.rebaseAction("abort");
        assert.equal((await git(repo, "rev-parse", "HEAD")).trim(), head);
        assert.equal((await service.getRebaseState()).isRebasing, false);
        assert.equal(await exists(scratchDir()), false);
      });

      it("can skip the conflicting commit", async () => {
        const { from, entries } = await swap();
        await service.interactiveRebase({ base: from, entries });
        await service.rebaseAction("skip");
        assert.equal((await service.getRebaseState()).isRebasing, false);
        assert.ok(!(await subjects(repo)).includes("s2"));
      });
    });
  });

  describe("dirty working tree", () => {
    const dirty = () => fs.writeFile(path.join(repo, "f1.txt"), "dirty\n");

    it("autostashes and restores with the stash policy", async () => {
      await dirty();
      const entries = entriesFrom(await rows(), { c3: { action: "drop" } });
      await service.interactiveRebase({ base, entries, policy: "stash" });
      assert.deepEqual(await subjects(repo), [
        "Initial commit",
        "c1",
        "c2",
        "c4",
      ]);
      assert.equal(
        await fs.readFile(path.join(repo, "f1.txt"), "utf-8"),
        "dirty\n",
      );
      assert.equal((await git(repo, "stash", "list")).trim(), "");
    });

    it("shelves and restores with the shelve policy", async () => {
      await dirty();
      const entries = entriesFrom(await rows(), { c3: { action: "drop" } });
      await service.interactiveRebase({ base, entries, policy: "shelve" });
      assert.deepEqual(await subjects(repo), [
        "Initial commit",
        "c1",
        "c2",
        "c4",
      ]);
      assert.equal(
        await fs.readFile(path.join(repo, "f1.txt"), "utf-8"),
        "dirty\n",
      );
      const shelves = await fs
        .readdir(path.join(repo, ".idea", "shelf"))
        .catch(() => []);
      assert.deepEqual(shelves, []);
    });

    it("keeps shelved changes safe when the rebase stops", async () => {
      await fs.writeFile(path.join(repo, "f1.txt"), "dirty\n");
      const { from, entries } = await conflictScenario();
      await fs.writeFile(path.join(repo, "f1.txt"), "dirty\n");
      const result = await service.interactiveRebase({
        base: from,
        entries,
        policy: "shelve",
      });
      assert.equal(result.status, "stopped");
      assert.ok(result.status === "stopped" && /shelf/.test(result.message));
      assert.equal(
        await fs.readFile(path.join(repo, "f1.txt"), "utf-8"),
        "1\n",
        "local edits wait on the shelf, not in the half-rebased tree",
      );
      const shelves = await fs.readdir(path.join(repo, ".idea", "shelf"));
      assert.ok(shelves.length > 0);
      await service.rebaseAction("abort");
    });
  });

  describe("rewordCommit", () => {
    it("amends HEAD without committing staged changes", async () => {
      await fs.writeFile(path.join(repo, "staged.txt"), "x\n");
      await git(repo, "add", "staged.txt");
      const result = await service.rewordCommit(
        (await git(repo, "rev-parse", "HEAD")).trim(),
        "Reworded head",
      );
      assert.deepEqual(result, { status: "completed" });
      assert.equal((await subjects(repo)).at(-1), "Reworded head");
      assert.equal(
        (await git(repo, "diff", "--cached", "--name-only")).trim(),
        "staged.txt",
        "the index is left alone",
      );
    });

    it("rewords an older commit and keeps the ones above it", async () => {
      const c2 = (await git(repo, "rev-parse", "HEAD~2")).trim();
      const result = await service.rewordCommit(c2, "Second, better\n\nWhy.");
      assert.deepEqual(result, { status: "completed" });
      assert.deepEqual(await subjects(repo), [
        "Initial commit",
        "c1",
        "Second, better",
        "c3",
        "c4",
      ]);
      assert.equal(await body("HEAD~2"), "Second, better\n\nWhy.");
    });

    it("rewords the root commit", async () => {
      await service.rewordCommit(base, "New root");
      assert.deepEqual(await subjects(repo), [
        "New root",
        "c1",
        "c2",
        "c3",
        "c4",
      ]);
    });

    it("rewords with a dirty tree", async () => {
      await fs.writeFile(path.join(repo, "f4.txt"), "dirty\n");
      const c2 = (await git(repo, "rev-parse", "HEAD~2")).trim();
      await service.rewordCommit(c2, "Reworded");
      assert.equal(
        await fs.readFile(path.join(repo, "f4.txt"), "utf-8"),
        "dirty\n",
      );
    });

    it("rejects an empty message and commits outside the branch", async () => {
      await assert.rejects(
        service.rewordCommit(base, "  \n"),
        /cannot be empty/,
      );
      await git(repo, "checkout", "-q", "-b", "side", base);
      const other = await commitFile(repo, "side.txt", "s\n", "side");
      await git(repo, "checkout", "-q", "main");
      await assert.rejects(
        service.rewordCommit(other, "x"),
        /not part of the current branch/,
      );
    });
  });

  describe("fixupCommit", () => {
    const stage = async (file: string, content: string) => {
      await fs.writeFile(path.join(repo, file), content);
      await git(repo, "add", file);
    };

    it("folds staged changes into an earlier commit", async () => {
      const c2 = (await git(repo, "rev-parse", "HEAD~2")).trim();
      await stage("f2.txt", "2 fixed\n");
      const result = await service.fixupCommit(c2, "fixup");
      assert.deepEqual(result, { status: "completed" });
      assert.deepEqual(await subjects(repo), [
        "Initial commit",
        "c1",
        "c2",
        "c3",
        "c4",
      ]);
      assert.equal(await body("HEAD~2"), "c2");
      assert.equal(await git(repo, "show", "HEAD~2:f2.txt"), "2 fixed\n");
      assert.equal((await git(repo, "status", "--porcelain")).trim(), "");
    });

    it("squashes staged changes and keeps both messages", async () => {
      const c2 = (await git(repo, "rev-parse", "HEAD~2")).trim();
      await stage("f2.txt", "2 more\n");
      await service.fixupCommit(c2, "squash");
      assert.deepEqual(await subjects(repo), [
        "Initial commit",
        "c1",
        "c2",
        "c3",
        "c4",
      ]);
      assert.equal(await git(repo, "show", "HEAD~2:f2.txt"), "2 more\n");
    });

    it("fixes up HEAD itself", async () => {
      const head = (await git(repo, "rev-parse", "HEAD")).trim();
      await stage("f4.txt", "4 fixed\n");
      await service.fixupCommit(head, "fixup");
      assert.deepEqual(await subjects(repo), [
        "Initial commit",
        "c1",
        "c2",
        "c3",
        "c4",
      ]);
      assert.equal(await git(repo, "show", "HEAD:f4.txt"), "4 fixed\n");
    });

    it("fixes up the root commit", async () => {
      await stage("README.md", "hello, fixed\n");
      await service.fixupCommit(base, "fixup");
      assert.deepEqual(await subjects(repo), [
        "Initial commit",
        "c1",
        "c2",
        "c3",
        "c4",
      ]);
      assert.equal(
        await git(repo, "show", "HEAD~4:README.md"),
        "hello, fixed\n",
      );
    });

    it("leaves other local edits in place", async () => {
      const c2 = (await git(repo, "rev-parse", "HEAD~2")).trim();
      await stage("f2.txt", "2 fixed\n");
      await fs.writeFile(path.join(repo, "f4.txt"), "unrelated\n");
      await service.fixupCommit(c2, "fixup");
      assert.equal(
        await fs.readFile(path.join(repo, "f4.txt"), "utf-8"),
        "unrelated\n",
      );
    });

    it("needs staged changes", async () => {
      await assert.rejects(
        service.fixupCommit(base, "fixup"),
        /Stage the changes/,
      );
      assert.deepEqual(await subjects(repo), [
        "Initial commit",
        "c1",
        "c2",
        "c3",
        "c4",
      ]);
    });

    it("stops on a conflict and leaves the fixup commit in the rebase", async () => {
      await commitFile(repo, "shared.txt", "one\n", "s1");
      await commitFile(repo, "shared.txt", "two\n", "s2");
      const s1 = (await git(repo, "rev-parse", "HEAD~1")).trim();
      await stage("shared.txt", "fixed\n");
      const result = await service.fixupCommit(s1, "fixup");
      assert.equal(result.status, "stopped");
      assert.equal((await service.getRebaseState()).isRebasing, true);
      await service.rebaseAction("abort");
      assert.equal(
        (await git(repo, "log", "-1", "--format=%s")).trim(),
        "fixup! s1",
      );
    });
  });
});
