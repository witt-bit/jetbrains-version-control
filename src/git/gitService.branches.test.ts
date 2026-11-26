import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { before, describe, it } from "node:test";
import { GitService } from "./gitService.ts";
import {
  commitFile,
  createRemotePair,
  createRepo,
  git,
  isolateGitEnvironment,
  makeTempDir,
} from "./testRepo.ts";

const names = async (dir: string, ...refs: string[]) =>
  (await git(dir, "for-each-ref", "--format=%(refname:short)", ...refs))
    .trim()
    .split("\n")
    .filter(Boolean);

describe("GitService merged branch cleanup", () => {
  let root: string;
  let repo: string;
  let service: GitService;

  before(() => isolateGitEnvironment());

  /**
   * main, plus `merged` (at main), `ahead` (one commit past main) and
   * `inwt` (at main, checked out in a second worktree).
   */
  const setup = async () => {
    root = await makeTempDir();
    repo = path.join(root, "repo");
    await createRepo(repo);
    await git(repo, "branch", "merged");
    await git(repo, "branch", "ahead");
    await git(repo, "branch", "inwt");
    await git(repo, "checkout", "-q", "ahead");
    await commitFile(repo, "ahead.txt", "x\n", "Only on ahead");
    await git(repo, "checkout", "-q", "main");
    await git(repo, "worktree", "add", "-q", path.join(root, "wt"), "inwt");
    service = new GitService(repo);
  };

  const teardown = async () => {
    await fs.rm(root, { recursive: true, force: true });
  };

  describe("findMergedBranches", () => {
    it("lists merged branches, not the current, unmerged or worktree ones", async () => {
      await setup();
      try {
        assert.deepEqual(await service.findMergedBranches(), ["merged"]);
      } finally {
        await teardown();
      }
    });

    it("measures against a chosen base and never offers that base", async () => {
      await setup();
      try {
        await git(repo, "checkout", "-q", "ahead");
        // Merged into main: main, merged, inwt. Current is `ahead`.
        assert.deepEqual(await service.findMergedBranches("main"), ["merged"]);
        // Merged into the checked-out `ahead`: everything that is behind it.
        assert.deepEqual(await service.findMergedBranches(), [
          "main",
          "merged",
        ]);
      } finally {
        await teardown();
      }
    });

    it("works against a remote-tracking base", async () => {
      root = await makeTempDir();
      try {
        const { a } = await createRemotePair(root);
        await git(a, "checkout", "-q", "-b", "feature");
        await commitFile(a, "f.txt", "x\n", "Feature work");
        await git(a, "checkout", "-q", "main");
        await git(
          a,
          "merge",
          "-q",
          "--no-ff",
          "-m",
          "Merge feature",
          "feature",
        );
        await git(a, "push", "-q", "origin", "main");
        await git(a, "checkout", "-q", "-b", "wip");
        await commitFile(a, "wip.txt", "x\n", "Unmerged work");

        const merged = await new GitService(a).findMergedBranches(
          "origin/main",
        );
        assert.ok(merged.includes("feature"));
        assert.ok(!merged.includes("wip"), "current and unmerged");
      } finally {
        await teardown();
      }
    });

    it("lists nothing in a repository with only the current branch", async () => {
      root = await makeTempDir();
      try {
        repo = path.join(root, "solo");
        await createRepo(repo);
        assert.deepEqual(await new GitService(repo).findMergedBranches(), []);
      } finally {
        await teardown();
      }
    });
  });

  describe("deleteMergedBranches", () => {
    it("deletes the branches", async () => {
      await setup();
      try {
        const result = await service.deleteMergedBranches(["merged"]);
        assert.deepEqual(result, {
          deleted: ["merged"],
          skipped: [],
          failed: [],
        });
        assert.ok(!(await names(repo, "refs/heads")).includes("merged"));
      } finally {
        await teardown();
      }
    });

    it("refuses a branch that is no longer fully merged and keeps it", async () => {
      await setup();
      try {
        // `ahead` has a commit main lacks: -D would silently lose it.
        const result = await service.deleteMergedBranches(["ahead", "merged"]);
        assert.deepEqual(result.deleted, ["merged"]);
        assert.equal(result.failed.length, 1);
        assert.equal(result.failed[0].branch, "ahead");
        assert.match(result.failed[0].error, /No longer fully merged/);
        assert.ok((await names(repo, "refs/heads")).includes("ahead"));
      } finally {
        await teardown();
      }
    });

    it("reports git's refusal for the checked-out branch and carries on", async () => {
      await setup();
      try {
        const result = await service.deleteMergedBranches(["main", "merged"]);
        assert.deepEqual(result.deleted, ["merged"]);
        assert.deepEqual(
          result.failed.map((f) => f.branch),
          ["main"],
        );
        assert.ok((await names(repo, "refs/heads")).includes("main"));
      } finally {
        await teardown();
      }
    });

    it("deletes branches whose names contain slashes", async () => {
      await setup();
      try {
        await git(repo, "branch", "feature/old");
        assert.ok((await service.findMergedBranches()).includes("feature/old"));
        const result = await service.deleteMergedBranches(["feature/old"]);
        assert.deepEqual(result.deleted, ["feature/old"]);
      } finally {
        await teardown();
      }
    });
  });
});

describe("GitService upstream", () => {
  let root: string;
  let a: string;
  let service: GitService;

  before(() => isolateGitEnvironment());

  const upstreamOf = async (branch: string) =>
    (await service.getBranches()).find((b) => !b.isRemote && b.name === branch)
      ?.upstream;

  const setup = async () => {
    root = await makeTempDir();
    ({ a } = await createRemotePair(root));
    await git(a, "push", "-q", "origin", "main:refs/heads/topic");
    await git(a, "fetch", "-q", "origin");
    await git(a, "branch", "feature");
    service = new GitService(a);
  };

  const teardown = async () => {
    await fs.rm(root, { recursive: true, force: true });
  };

  it("sets the upstream of a branch", async () => {
    await setup();
    try {
      assert.equal(await upstreamOf("feature"), undefined);
      await service.setUpstream("feature", "origin/topic");
      assert.equal(await upstreamOf("feature"), "origin/topic");
    } finally {
      await teardown();
    }
  });

  it("replaces an existing upstream", async () => {
    await setup();
    try {
      assert.equal(await upstreamOf("main"), "origin/main");
      await service.setUpstream("main", "origin/topic");
      assert.equal(await upstreamOf("main"), "origin/topic");
    } finally {
      await teardown();
    }
  });

  it("unsets the upstream", async () => {
    await setup();
    try {
      await service.unsetUpstream("main");
      assert.equal(await upstreamOf("main"), undefined);
    } finally {
      await teardown();
    }
  });

  it("rejects an upstream that does not exist", async () => {
    await setup();
    try {
      await assert.rejects(service.setUpstream("feature", "origin/nope"));
      assert.equal(await upstreamOf("feature"), undefined);
    } finally {
      await teardown();
    }
  });

  it("rejects unsetting a branch without an upstream", async () => {
    await setup();
    try {
      await assert.rejects(service.unsetUpstream("feature"));
    } finally {
      await teardown();
    }
  });
});

describe("GitService worktree lock", () => {
  let root: string;
  let repo: string;
  let wt: string;
  let service: GitService;

  before(() => isolateGitEnvironment());

  const setup = async () => {
    root = await makeTempDir();
    repo = path.join(root, "repo");
    wt = path.join(root, "wt");
    await createRepo(repo);
    await git(repo, "worktree", "add", "-q", "-b", "side", wt);
    service = new GitService(repo);
  };

  const teardown = async () => {
    await fs.rm(root, { recursive: true, force: true });
  };

  const side = async () => {
    const found = (await service.listWorktrees()).find((w) => w.path === wt);
    assert.ok(found, "worktree is listed");
    return found;
  };

  it("reports unlocked worktrees", async () => {
    await setup();
    try {
      const all = await service.listWorktrees();
      assert.equal(all.length, 2);
      assert.ok(all.every((w) => !w.locked && w.lockReason === undefined));
    } finally {
      await teardown();
    }
  });

  it("locks with a reason and unlocks", async () => {
    await setup();
    try {
      await service.lockWorktree(wt, "on the USB drive");
      assert.deepEqual(
        { locked: (await side()).locked, reason: (await side()).lockReason },
        { locked: true, reason: "on the USB drive" },
      );
      assert.equal((await service.listWorktrees())[0].locked, false);

      await service.unlockWorktree(wt);
      assert.deepEqual(
        { locked: (await side()).locked, reason: (await side()).lockReason },
        { locked: false, reason: undefined },
      );
    } finally {
      await teardown();
    }
  });

  it("locks without a reason, treating a blank one as none", async () => {
    await setup();
    try {
      await service.lockWorktree(wt);
      assert.equal((await side()).locked, true);
      assert.equal((await side()).lockReason, undefined);

      await service.unlockWorktree(wt);
      await service.lockWorktree(wt, "   ");
      assert.equal((await side()).locked, true);
      assert.equal((await side()).lockReason, undefined);
    } finally {
      await teardown();
    }
  });

  it("round-trips a reason with quotes and non-ASCII text", async () => {
    await setup();
    try {
      const reason = 'keep "this" — 数据盘';
      await service.lockWorktree(wt, reason);
      assert.equal((await side()).lockReason, reason);
    } finally {
      await teardown();
    }
  });

  it("makes git refuse to remove a locked worktree until it is unlocked", async () => {
    await setup();
    try {
      await service.lockWorktree(wt, "busy");
      await assert.rejects(service.removeWorktree(wt));
      assert.equal((await service.listWorktrees()).length, 2);

      await service.unlockWorktree(wt);
      await service.removeWorktree(wt);
      assert.equal((await service.listWorktrees()).length, 1);
    } finally {
      await teardown();
    }
  });

  it("rejects locking twice and unlocking an unlocked worktree", async () => {
    await setup();
    try {
      await assert.rejects(service.unlockWorktree(wt));
      await service.lockWorktree(wt);
      await assert.rejects(service.lockWorktree(wt));
    } finally {
      await teardown();
    }
  });
});
