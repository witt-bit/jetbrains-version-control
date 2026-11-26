import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { GitService } from "./gitService.ts";
import {
  commitFile,
  createRepo,
  git,
  isolateGitEnvironment,
  makeTempDir,
} from "./testRepo.ts";

describe("GitService log filters and Go To", () => {
  let root: string;
  let repo: string;
  const h: Record<string, string> = {};

  before(async () => {
    isolateGitEnvironment();
    root = await makeTempDir();
    repo = path.join(root, "repo");
    await createRepo(repo);
    h.initial = (await git(repo, "rev-parse", "HEAD")).trim();
    h.login = await commitFile(repo, "src/login.ts", "1\n", "Fix Login bug");
    h.guide = await commitFile(
      repo,
      "docs/guide.md",
      "g\n",
      "Add feature (beta)\n\nMentions the OAuth flow.",
    );
    await git(repo, "checkout", "-q", "-b", "side");
    h.side = await commitFile(repo, "side.txt", "s\n", "Side work");
    await git(repo, "checkout", "-q", "main");
    h.logout = await commitFile(
      repo,
      "src/logout.ts",
      "1\n",
      "fix: logout regexp",
    );
    h.bulk1 = await commitFile(repo, "bulk.txt", "1\n", "Bulk 1");
    await fs.writeFile(path.join(repo, "bulk.txt"), "2\n");
    await git(repo, "add", "bulk.txt");
    await git(
      repo,
      "commit",
      "-q",
      "-m",
      "Bulk 2",
      "--author=Other Person <other@example.com>",
    );
    h.bulk2 = (await git(repo, "rev-parse", "HEAD")).trim();
    h.bulk3 = await commitFile(repo, "bulk.txt", "3\n", "Bulk 3");
    h.tweak = await commitFile(repo, "src/login.ts", "2\n", "Tweak login");
    await git(repo, "merge", "-q", "--no-ff", "side", "-m", "Merge side");
    h.merge = (await git(repo, "rev-parse", "HEAD")).trim();
    await git(repo, "tag", "v1", h.login);
    await git(repo, "tag", "-a", "v2", "-m", "release", h.logout);
  });

  after(() => fs.rm(root, { recursive: true, force: true }));

  const service = () => new GitService(repo);
  const subjectsOf = async (options: Parameters<GitService["getLog"]>[0]) =>
    (await service().getLog(options)).map((c) => c.subject);

  describe("text filter", () => {
    it("is a case-insensitive literal match by default", async () => {
      assert.deepEqual(await subjectsOf({ search: "fix login" }), [
        "Fix Login bug",
      ]);
      assert.deepEqual(await subjectsOf({ search: "(beta)" }), [
        "Add feature (beta)",
      ]);
      assert.deepEqual(await subjectsOf({ search: "fix.*bug" }), []);
    });

    it("searches the message body too", async () => {
      assert.deepEqual(await subjectsOf({ search: "oauth flow" }), [
        "Add feature (beta)",
      ]);
    });

    it("respects Match Case", async () => {
      assert.deepEqual((await subjectsOf({ search: "fix" })).sort(), [
        "Fix Login bug",
        "fix: logout regexp",
      ]);
      assert.deepEqual(await subjectsOf({ search: "fix", matchCase: true }), [
        "fix: logout regexp",
      ]);
    });

    it("treats the text as a regular expression when asked", async () => {
      assert.deepEqual(await subjectsOf({ search: "fix.*bug", regex: true }), [
        "Fix Login bug",
      ]);
      assert.deepEqual(
        await subjectsOf({ search: "^Bulk [12]$", regex: true }),
        ["Bulk 2", "Bulk 1"],
      );
      assert.deepEqual(
        await subjectsOf({ search: "^bulk", regex: true, matchCase: true }),
        [],
      );
    });

    it("reports an invalid regular expression readably", async () => {
      await assert.rejects(
        service().getLog({ search: "(", regex: true }),
        /Invalid regular expression/,
      );
    });

    it("ignores a blank text filter", async () => {
      assert.equal((await subjectsOf({ search: "  " })).length, 10);
    });

    it("composes with the author filter", async () => {
      assert.deepEqual(await subjectsOf({ search: "bulk", author: "Other" }), [
        "Bulk 2",
      ]);
    });
  });

  describe("path filter", () => {
    it("limits the log to a file or a folder", async () => {
      assert.deepEqual(await subjectsOf({ file: "src/login.ts" }), [
        "Tweak login",
        "Fix Login bug",
      ]);
      assert.deepEqual((await subjectsOf({ file: "src" })).sort(), [
        "Fix Login bug",
        "Tweak login",
        "fix: logout regexp",
      ]);
    });

    it("accepts the absolute path a file picker returns", async () => {
      assert.deepEqual(
        await subjectsOf({ file: path.join(repo, "src", "login.ts") }),
        ["Tweak login", "Fix Login bug"],
      );
    });

    it("refuses a path outside the repository", async () => {
      await assert.rejects(
        service().getLog({ file: path.join(root, "elsewhere.txt") }),
        /outside the repository/,
      );
    });

    it("rewrites parents to the nearest listed commit", async () => {
      const [tweak, fix] = await service().getLog({ file: "src/login.ts" });
      assert.deepEqual(tweak.parents, [fix.hash]);
      assert.deepEqual(fix.parents, []);
    });

    it("composes with the text filter", async () => {
      assert.deepEqual(await subjectsOf({ file: "src", search: "tweak" }), [
        "Tweak login",
      ]);
    });
  });

  describe("pagination", () => {
    it("keeps the filter across pages", async () => {
      const options = { search: "bulk" };
      const first = await service().getLog({ ...options, maxCount: 2 });
      const second = await service().getLog({
        ...options,
        maxCount: 2,
        skip: 2,
      });
      assert.deepEqual(
        [...first, ...second].map((c) => c.subject),
        ["Bulk 3", "Bulk 2", "Bulk 1"],
      );
    });
  });

  describe("graph under a filter", () => {
    const lineTo = (
      topology: Awaited<ReturnType<GitService["getGraphTopology"]>>,
      from: string,
    ) => topology.graphData.lanes[from].lines[0];

    it("keeps the lane open when the parent is on the next page", async () => {
      const topology = await service().getGraphTopology({
        search: "bulk",
        maxCount: 2,
      });
      assert.equal(lineTo(topology, h.bulk2).toCommit, h.bulk1);
      assert.equal(lineTo(topology, h.bulk2).hiddenParent, undefined);
      assert.deepEqual(topology.snapshot.activeLanes, [h.bulk1]);
    });

    it("keeps it open under a date range too", async () => {
      const topology = await service().getGraphTopology({
        search: "bulk",
        since: "1 hour ago",
        maxCount: 2,
      });
      assert.equal(lineTo(topology, h.bulk2).hiddenParent, undefined);
    });

    it("ends the lane when the filter removed the parent, even on a full page", async () => {
      const full = await service().getGraphTopology({
        search: "bulk",
        maxCount: 3,
      });
      assert.equal(lineTo(full, h.bulk1).hiddenParent, true);
      assert.deepEqual(full.snapshot.activeLanes, []);

      const partial = await service().getGraphTopology({
        search: "fix",
        maxCount: 1,
      });
      assert.equal(lineTo(partial, h.logout).hiddenParent, true);
      assert.deepEqual(partial.snapshot.activeLanes, []);
    });

    it("follows a path filter across pages", async () => {
      const topology = await service().getGraphTopology({
        file: "src/login.ts",
        maxCount: 1,
      });
      assert.equal(lineTo(topology, h.tweak).toCommit, h.login);
      assert.equal(lineTo(topology, h.tweak).hiddenParent, undefined);
      assert.deepEqual(topology.snapshot.activeLanes, [h.login]);
    });

    it("lays out the second page from the first page's snapshot", async () => {
      const options = { search: "bulk" };
      const first = await service().getGraphTopology({
        ...options,
        maxCount: 2,
      });
      const second = await service().getGraphTopology(
        { ...options, maxCount: 2, skip: 2 },
        first.snapshot,
      );
      assert.equal(second.graphData.lanes[h.bulk1].column, 0);
      assert.equal(
        second.graphData.lanes[h.bulk1].color,
        first.graphData.lanes[h.bulk2].color,
      );
    });
  });

  describe("resolveLogRef", () => {
    it("resolves full hashes, prefixes, branches and relative revisions", async () => {
      assert.equal(await service().resolveLogRef(h.login), h.login);
      assert.equal(await service().resolveLogRef(h.login.slice(0, 8)), h.login);
      assert.equal(await service().resolveLogRef(" main "), h.merge);
      assert.equal(await service().resolveLogRef("side"), h.side);
      assert.equal(await service().resolveLogRef("HEAD~1^1"), h.bulk3);
    });

    it("resolves tags, peeling annotated ones to the commit", async () => {
      assert.equal(await service().resolveLogRef("v1"), h.login);
      assert.equal(await service().resolveLogRef("v2"), h.logout);
    });

    it("rejects unknown refs and input that could be an option", async () => {
      for (const query of ["nope", "", "   ", "--all", "-h", "a\nb"]) {
        await assert.rejects(
          service().resolveLogRef(query),
          /is not a known commit hash, branch or tag/,
          JSON.stringify(query),
        );
      }
    });
  });

  describe("findCommitIndex", () => {
    it("matches the position in the unfiltered log", async () => {
      const log = await service().getLog({ maxCount: 100 });
      for (const [i, commit] of log.entries()) {
        assert.equal(
          await service().findCommitIndex({}, commit.hash),
          i,
          commit.subject,
        );
      }
    });

    it("counts positions within the filtered log", async () => {
      assert.equal(
        await service().findCommitIndex({ search: "bulk" }, h.bulk1),
        2,
      );
      assert.equal(
        await service().findCommitIndex({ file: "src" }, h.login),
        2,
      );
    });

    it("is null for a commit the filter removed", async () => {
      assert.equal(
        await service().findCommitIndex({ search: "bulk" }, h.login),
        null,
      );
      assert.equal(
        await service().findCommitIndex({ branch: "side" }, h.logout),
        null,
      );
    });

    it("reports an invalid regular expression", async () => {
      await assert.rejects(
        service().findCommitIndex({ search: "(", regex: true }, h.login),
        /Invalid regular expression/,
      );
    });
  });
});
