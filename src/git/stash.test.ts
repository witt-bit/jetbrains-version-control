import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { before, describe, it } from "node:test";
import { GitService } from "./gitService.ts";
import {
  assertBranchName,
  assertStashRef,
  buildStashPushArgs,
  buildUnstashArgs,
} from "./stash.ts";
import {
  commitFile,
  createRepo,
  git,
  isolateGitEnvironment,
  makeTempDir,
} from "./testRepo.ts";

describe("stash argument building", () => {
  it("passes only the options that are set", () => {
    assert.deepEqual(buildStashPushArgs({}), ["stash", "push"]);
    assert.deepEqual(
      buildStashPushArgs({
        message: "  wip  ",
        keepIndex: true,
        includeUntracked: true,
      }),
      ["stash", "push", "-m", "wip", "--keep-index", "--include-untracked"],
    );
    assert.deepEqual(buildStashPushArgs({ message: "   " }), ["stash", "push"]);
  });

  it("builds pop and apply, with and without --index", () => {
    assert.deepEqual(buildUnstashArgs("stash@{2}"), [
      "stash",
      "pop",
      "stash@{2}",
    ]);
    assert.deepEqual(
      buildUnstashArgs("stash@{0}", { pop: false, reinstateIndex: true }),
      ["stash", "apply", "--index", "stash@{0}"],
    );
  });

  it("only accepts stash entries and plausible branch names", () => {
    assert.doesNotThrow(() => assertStashRef("stash@{12}"));
    for (const bad of ["HEAD", "stash@{x}", "--all", "stash@{0} --all", 3]) {
      assert.throws(() => assertStashRef(bad), /Not a stash entry/);
    }
    assert.doesNotThrow(() => assertBranchName("feature/x"));
    assert.throws(() => assertBranchName("  "), /Enter a branch name/);
    assert.throws(() => assertBranchName("--force"), /not a valid branch name/);
  });
});

describe("GitService stash operations", () => {
  let root: string;
  let service: GitService;

  before(() => isolateGitEnvironment());

  const setup = async () => {
    root = await makeTempDir();
    await createRepo(root);
    await commitFile(root, "a.txt", "a1\n", "Add a");
    await commitFile(root, "b.txt", "b1\n", "Add b");
    service = new GitService(root);
  };

  const teardown = () => fs.rm(root, { recursive: true, force: true });

  const write = (file: string, content: string) =>
    fs.writeFile(path.join(root, file), content);
  const read = (file: string) => fs.readFile(path.join(root, file), "utf-8");
  const status = async () =>
    (await git(root, "status", "--porcelain")).split("\n").filter(Boolean);
  const stashSubjects = async () =>
    (await git(root, "stash", "list", "--format=%s"))
      .trim()
      .split("\n")
      .filter(Boolean);

  it("stashChanges saves tracked changes with the given message and reports it", async () => {
    await setup();
    try {
      await write("a.txt", "a2\n");
      assert.equal(await service.stashChanges({ message: "my work" }), true);
      assert.equal(await read("a.txt"), "a1\n");
      assert.deepEqual(await stashSubjects(), ["On main: my work"]);
    } finally {
      await teardown();
    }
  });

  it("stashChanges leaves untracked files unless asked to include them", async () => {
    await setup();
    try {
      await write("a.txt", "a2\n");
      await write("new.txt", "untracked\n");
      await service.stashChanges({});
      assert.equal(await read("new.txt"), "untracked\n");

      await write("a.txt", "a3\n");
      await service.stashChanges({ includeUntracked: true });
      await assert.rejects(fs.access(path.join(root, "new.txt")));
      assert.equal((await stashSubjects()).length, 2);
      assert.match(
        await git(root, "show", "--name-only", "--format=", "stash@{0}^3"),
        /new\.txt/,
        "untracked files live in the stash's third parent",
      );
    } finally {
      await teardown();
    }
  });

  it("stashChanges --keep-index stashes everything but keeps staged changes in place", async () => {
    await setup();
    try {
      await write("a.txt", "a2\n");
      await git(root, "add", "a.txt");
      await write("b.txt", "b2\n");
      await service.stashChanges({ keepIndex: true });
      assert.deepEqual(await status(), ["M  a.txt"]);
      assert.equal(await read("a.txt"), "a2\n");
      assert.equal(await read("b.txt"), "b1\n", "unstaged change was stashed");
      assert.equal(
        await git(root, "show", "stash@{0}:b.txt"),
        "b2\n",
        "the stash holds the unstaged change as well",
      );
    } finally {
      await teardown();
    }
  });

  it("stashChanges returns false and adds nothing when there is nothing to stash", async () => {
    await setup();
    try {
      assert.equal(await service.stashChanges({}), false);
      assert.deepEqual(await stashSubjects(), []);

      // A stale top-of-stash must not be mistaken for a new entry.
      await write("a.txt", "a2\n");
      assert.equal(await service.stashChanges({ message: "first" }), true);
      assert.equal(await service.stashChanges({}), false);
      assert.deepEqual(await stashSubjects(), ["On main: first"]);
    } finally {
      await teardown();
    }
  });

  it("unshelveChanges reinstates the index only when asked", async () => {
    await setup();
    try {
      await write("a.txt", "a2\n");
      await git(root, "add", "a.txt");
      await service.stashChanges({});

      await service.unshelveChanges("stash@{0}", false, true);
      assert.deepEqual(await status(), ["M  a.txt"], "apply --index stages it");
      assert.equal((await stashSubjects()).length, 1, "apply keeps the stash");

      await git(root, "reset", "-q", "--hard");
      await service.unshelveChanges("stash@{0}", true, false);
      assert.deepEqual(
        await status(),
        [" M a.txt"],
        "plain pop leaves it unstaged",
      );
      assert.deepEqual(await stashSubjects(), [], "pop drops the stash");
    } finally {
      await teardown();
    }
  });

  it("unstashAsBranch puts the changes on a new branch at the stash's base commit", async () => {
    await setup();
    try {
      const base = (await git(root, "rev-parse", "HEAD")).trim();
      await write("a.txt", "a2\n");
      await service.stashChanges({ message: "wip" });
      await commitFile(root, "c.txt", "c1\n", "Move main on");

      await service.unstashAsBranch("stash@{0}", "  topic  ");

      assert.equal(
        (await git(root, "rev-parse", "--abbrev-ref", "HEAD")).trim(),
        "topic",
      );
      assert.equal((await git(root, "rev-parse", "HEAD")).trim(), base);
      assert.equal(await read("a.txt"), "a2\n");
      assert.deepEqual(
        await stashSubjects(),
        [],
        "stash dropped after a clean apply",
      );
    } finally {
      await teardown();
    }
  });

  it("unstashAsBranch refuses an existing branch, bad input, and keeps the stash", async () => {
    await setup();
    try {
      await write("a.txt", "a2\n");
      await service.stashChanges({});
      await git(root, "branch", "taken");

      await assert.rejects(service.unstashAsBranch("stash@{0}", "taken"));
      await assert.rejects(service.unstashAsBranch("stash@{0}", "--force"));
      await assert.rejects(service.unstashAsBranch("HEAD", "topic"));
      await assert.rejects(service.unstashAsBranch("stash@{0}", "bad name"));

      assert.equal((await stashSubjects()).length, 1);
      assert.equal(
        (await git(root, "rev-parse", "--abbrev-ref", "HEAD")).trim(),
        "main",
      );
    } finally {
      await teardown();
    }
  });

  it("clearStashes drops every entry and reports how many there were", async () => {
    await setup();
    try {
      await write("a.txt", "a2\n");
      await service.stashChanges({});
      await write("b.txt", "b2\n");
      await service.stashChanges({});
      assert.equal(await service.stashCount(), 2);

      assert.equal(await service.clearStashes(), 2);
      assert.equal(await service.stashCount(), 0);
      assert.deepEqual(await stashSubjects(), []);
      assert.equal(await service.clearStashes(), 0, "nothing to clear is fine");
    } finally {
      await teardown();
    }
  });
});
