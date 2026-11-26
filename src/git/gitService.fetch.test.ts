import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { before, describe, it } from "node:test";
import { GitService } from "./gitService.ts";
import {
  commitFile,
  createBareRepo,
  createRemotePair,
  git,
  isolateGitEnvironment,
  makeTempDir,
} from "./testRepo.ts";

describe("GitService fetch options", () => {
  let root: string;
  let a: string;
  let b: string;
  let service: GitService;

  before(() => isolateGitEnvironment());

  // `a` publishes, `b` fetches; a fresh pair per test because each mutates refs.
  const setup = async () => {
    root = await makeTempDir();
    ({ a, b } = await createRemotePair(root));
    service = new GitService(b);
  };

  const teardown = async () => {
    await fs.rm(root, { recursive: true, force: true });
  };

  const lines = async (dir: string, ...args: string[]) =>
    (await git(dir, ...args)).trim().split("\n").filter(Boolean);

  /** `a` pushes a tag on a commit that is not on any branch. */
  const pushOrphanTag = async (name: string) => {
    await git(a, "checkout", "-q", "--detach");
    await commitFile(a, `${name}.txt`, "x\n", `Orphan ${name}`);
    await git(a, "tag", name);
    await git(a, "checkout", "-q", "main");
    await git(a, "push", "-q", "origin", `refs/tags/${name}`);
  };

  /** `a` pushes a new commit on main carrying tag `name`. */
  const pushTaggedCommit = async (name: string) => {
    await commitFile(a, `${name}.txt`, "x\n", `Tagged ${name}`);
    await git(a, "tag", name);
    await git(a, "push", "-q", "origin", "main", `refs/tags/${name}`);
  };

  describe("prune", () => {
    const publishTopicThenDeleteIt = async () => {
      await git(a, "push", "-q", "origin", "main:refs/heads/topic");
      await git(b, "fetch", "-q", "origin");
      assert.ok((await lines(b, "branch", "-r")).some((l) => /topic/.test(l)));
      await git(a, "push", "-q", "origin", ":refs/heads/topic");
    };

    it("keeps a branch deleted on the remote by default", async () => {
      await setup();
      try {
        await publishTopicThenDeleteIt();
        await service.fetch("origin");
        assert.ok(
          (await lines(b, "branch", "-r")).some((l) => /origin\/topic/.test(l)),
        );
      } finally {
        await teardown();
      }
    });

    it("removes it with prune", async () => {
      await setup();
      try {
        await publishTopicThenDeleteIt();
        await service.fetch("origin", { prune: true });
        assert.ok(
          !(await lines(b, "branch", "-r")).some((l) => /topic/.test(l)),
          "the stale remote-tracking branch is pruned",
        );
        assert.ok(
          (await lines(b, "branch", "-r")).some((l) => /origin\/main/.test(l)),
          "live branches stay",
        );
      } finally {
        await teardown();
      }
    });
  });

  describe("tags mode", () => {
    it("default fetches tags on fetched history, not on unreachable commits", async () => {
      await setup();
      try {
        await pushTaggedCommit("reachable");
        await pushOrphanTag("orphan");
        await service.fetch("origin", { tagsMode: "default" });
        assert.deepEqual(await lines(b, "tag", "-l"), ["reachable"]);
      } finally {
        await teardown();
      }
    });

    it("allTags also fetches tags on unreachable commits", async () => {
      await setup();
      try {
        await pushTaggedCommit("reachable");
        await pushOrphanTag("orphan");
        await service.fetch("origin", { tagsMode: "allTags" });
        assert.deepEqual(await lines(b, "tag", "-l"), ["orphan", "reachable"]);
      } finally {
        await teardown();
      }
    });

    it("noTags fetches the commits but no tags", async () => {
      await setup();
      try {
        await pushTaggedCommit("reachable");
        await service.fetch("origin", { tagsMode: "noTags" });
        assert.deepEqual(await lines(b, "tag", "-l"), []);
        assert.equal(
          (await git(b, "rev-parse", "origin/main")).trim(),
          (await git(a, "rev-parse", "main")).trim(),
          "the branch itself still advanced",
        );
      } finally {
        await teardown();
      }
    });

    it("pruneTags drops local tags the remote deleted; other modes keep them", async () => {
      await setup();
      try {
        await pushTaggedCommit("gone");
        await service.fetch("origin");
        assert.deepEqual(await lines(b, "tag", "-l"), ["gone"]);
        await git(a, "push", "-q", "origin", ":refs/tags/gone");

        await service.fetch("origin", { prune: true });
        assert.deepEqual(
          await lines(b, "tag", "-l"),
          ["gone"],
          "plain prune leaves tags alone",
        );

        await service.fetch("origin", { tagsMode: "pruneTags" });
        assert.deepEqual(await lines(b, "tag", "-l"), []);
      } finally {
        await teardown();
      }
    });
  });

  describe("fetchAllRemotes", () => {
    it("reports whether anything changed", async () => {
      await setup();
      try {
        assert.equal(await service.fetchAllRemotes(), false, "nothing new");

        await commitFile(a, "new.txt", "x\n", "New commit");
        await git(a, "push", "-q", "origin", "main");
        assert.equal(await service.fetchAllRemotes(), true);
        assert.equal(
          (await git(b, "rev-parse", "origin/main")).trim(),
          (await git(a, "rev-parse", "main")).trim(),
        );

        assert.equal(await service.fetchAllRemotes(), false, "already current");
      } finally {
        await teardown();
      }
    });

    it("fetches every remote, not just origin", async () => {
      await setup();
      try {
        const second = path.join(root, "second.git");
        await createBareRepo(second);
        await git(a, "push", "-q", second, "main:refs/heads/other");
        await git(b, "remote", "add", "second", second);

        assert.equal(await service.fetchAllRemotes(), true);
        assert.ok(
          (await lines(b, "branch", "-r")).some((l) => /second\/other/.test(l)),
        );
      } finally {
        await teardown();
      }
    });

    it("applies the fetch options", async () => {
      await setup();
      try {
        await git(a, "push", "-q", "origin", "main:refs/heads/topic");
        await service.fetchAllRemotes();
        await git(a, "push", "-q", "origin", ":refs/heads/topic");

        assert.equal(await service.fetchAllRemotes({ prune: true }), true);
        assert.ok(
          !(await lines(b, "branch", "-r")).some((l) => /topic/.test(l)),
        );
      } finally {
        await teardown();
      }
    });

    it("is a quiet no-op in a repository without remotes", async () => {
      root = await makeTempDir();
      try {
        const solo = path.join(root, "solo");
        await fs.mkdir(solo);
        await git(solo, "init", "-q", "-b", "main");
        await commitFile(solo, "a.txt", "x\n", "Initial");
        assert.equal(await new GitService(solo).fetchAllRemotes(), false);
      } finally {
        await teardown();
      }
    });
  });
});
