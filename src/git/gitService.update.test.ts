import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { before, describe, it } from "node:test";
import { GitService } from "./gitService.ts";
import {
  interpretRebaseConfig,
  parseSaveChangesPolicy,
  parseUpdateMethod,
  readGitSettings,
  resolveUpdateMethod,
} from "./gitSettings.ts";
import {
  commitFile,
  createRemotePair,
  git,
  isolateGitEnvironment,
  makeTempDir,
  subjects,
} from "./testRepo.ts";

describe("update settings parsing", () => {
  it("falls back to the defaults for anything unknown", () => {
    assert.equal(parseUpdateMethod("nonsense"), "branchDefault");
    assert.equal(parseUpdateMethod(undefined), "branchDefault");
    assert.equal(parseSaveChangesPolicy(42), "stash");
    assert.equal(parseUpdateMethod("rebase"), "rebase");
    assert.equal(parseSaveChangesPolicy("shelve"), "shelve");
  });

  it("reads both settings through the adapter", () => {
    const values: Record<string, unknown> = {
      "update.method": "merge",
      "update.saveChangesPolicy": "shelve",
    };
    assert.deepEqual(
      readGitSettings((k) => values[k]),
      {
        updateMethod: "merge",
        saveChangesPolicy: "shelve",
      },
    );
  });

  it("treats every rebase flavour as a rebase and unset as a merge", () => {
    for (const v of ["true", "merges", "interactive", "i", "TRUE"]) {
      assert.equal(interpretRebaseConfig(v), "rebase", v);
    }
    assert.equal(interpretRebaseConfig("false"), "merge");
    assert.equal(interpretRebaseConfig(undefined), "merge");
    assert.equal(interpretRebaseConfig("  "), "merge");
  });

  it("lets the branch config override pull.rebase, and a setting override both", () => {
    assert.equal(
      resolveUpdateMethod("branchDefault", "false", "true"),
      "merge",
    );
    assert.equal(
      resolveUpdateMethod("branchDefault", undefined, "true"),
      "rebase",
    );
    assert.equal(
      resolveUpdateMethod("branchDefault", undefined, undefined),
      "merge",
    );
    assert.equal(resolveUpdateMethod("merge", "true", "true"), "merge");
    assert.equal(resolveUpdateMethod("rebase", "false", "false"), "rebase");
  });
});

describe("GitService update and saved changes", () => {
  let root: string;
  let a: string;
  let b: string;
  let service: GitService;

  before(() => isolateGitEnvironment());

  // A fresh pair for every test: each one mutates history.
  const setup = async () => {
    root = await makeTempDir();
    ({ a, b } = await createRemotePair(root));
    service = new GitService(a);
  };

  const teardown = async () => {
    await fs.rm(root, { recursive: true, force: true });
  };

  /** `b` pushes a commit that `a` has not seen. */
  const pushFromB = async (file = "remote.txt") => {
    await commitFile(b, file, "from b\n", "Remote commit");
    await git(b, "push", "-q", "origin", "main");
  };

  it("restores dirty tracked files after a successful operation", async () => {
    await setup();
    try {
      await fs.writeFile(path.join(a, "README.md"), "dirty\n");
      let sawClean = false;
      await service.withSavedChanges("stash", "Test", async () => {
        sawClean = (await git(a, "status", "--porcelain")).trim() === "";
      });
      assert.equal(sawClean, true, "operation must run on a clean tree");
      assert.equal(
        await fs.readFile(path.join(a, "README.md"), "utf-8"),
        "dirty\n",
      );
      assert.equal(
        (await git(a, "stash", "list")).trim(),
        "",
        "stash is popped",
      );
    } finally {
      await teardown();
    }
  });

  it("restores the changes and rethrows when the operation fails", async () => {
    await setup();
    try {
      await fs.writeFile(path.join(a, "README.md"), "dirty\n");
      await assert.rejects(
        service.withSavedChanges("stash", "Test", async () => {
          throw new Error("boom");
        }),
        /boom/,
      );
      assert.equal(
        await fs.readFile(path.join(a, "README.md"), "utf-8"),
        "dirty\n",
      );
      assert.equal((await git(a, "stash", "list")).trim(), "");
    } finally {
      await teardown();
    }
  });

  it("does not touch the stash when there is nothing to save", async () => {
    await setup();
    try {
      await fs.writeFile(path.join(a, "untracked.txt"), "x");
      await git(a, "stash", "push", "-q", "-u", "-m", "preexisting");
      const before = (await git(a, "stash", "list")).trim();
      let ran = false;
      await service.withSavedChanges("stash", "Test", async () => {
        ran = true;
      });
      assert.equal(ran, true);
      // A stale refs/stash must not be mistaken for ours and popped.
      assert.equal((await git(a, "stash", "list")).trim(), before);
    } finally {
      await teardown();
    }
  });

  it("keeps the saved changes when the operation leaves a merge unfinished", async () => {
    await setup();
    try {
      await commitFile(a, "conflict.txt", "base\n", "base");
      await git(a, "push", "-q", "origin", "main");
      await git(b, "pull", "-q");
      await commitFile(b, "conflict.txt", "theirs\n", "theirs");
      await git(b, "push", "-q", "origin", "main");
      await commitFile(a, "conflict.txt", "ours\n", "ours");
      await git(a, "fetch", "-q", "origin");
      await fs.writeFile(path.join(a, "README.md"), "dirty\n");

      await assert.rejects(
        service.withSavedChanges("stash", "Merge", async () => {
          await git(a, "merge", "origin/main");
        }),
        (err: Error) =>
          /saved in the stash/.test(err.message) &&
          /not restored/.test(err.message),
      );
      assert.match(await git(a, "stash", "list"), /changes saved by JGC/);
      assert.equal(await service.isOperationInProgress(), true);
    } finally {
      await teardown();
    }
  });

  it("update(merge) integrates a diverged remote with a merge commit", async () => {
    await setup();
    try {
      await pushFromB();
      await commitFile(a, "local.txt", "local\n", "Local commit");
      await service.update({ method: "merge", policy: "stash" });
      const parents = (await git(a, "rev-list", "--parents", "-n", "1", "HEAD"))
        .trim()
        .split(" ");
      assert.equal(parents.length, 3, "HEAD is a merge commit");
    } finally {
      await teardown();
    }
  });

  it("update(rebase) keeps history linear and keeps dirty files", async () => {
    await setup();
    try {
      await pushFromB();
      await commitFile(a, "local.txt", "local\n", "Local commit");
      await fs.writeFile(path.join(a, "README.md"), "dirty\n");
      await service.update({ method: "rebase", policy: "stash" });
      assert.deepEqual(await subjects(a), [
        "Initial commit",
        "Remote commit",
        "Local commit",
      ]);
      assert.equal(
        await fs.readFile(path.join(a, "README.md"), "utf-8"),
        "dirty\n",
      );
    } finally {
      await teardown();
    }
  });

  it("update with the shelve policy shelves, updates and restores", async () => {
    await setup();
    try {
      await pushFromB();
      await fs.writeFile(path.join(a, "README.md"), "dirty\n");
      await service.update({ method: "rebase", policy: "shelve" });
      assert.deepEqual(await subjects(a), ["Initial commit", "Remote commit"]);
      assert.equal(
        await fs.readFile(path.join(a, "README.md"), "utf-8"),
        "dirty\n",
      );
      const shelves = await fs
        .readdir(path.join(a, ".idea", "shelf"))
        .catch(() => []);
      assert.deepEqual(shelves, [], "the shelf is dropped once restored");
    } finally {
      await teardown();
    }
  });

  it("branchDefault follows pull.rebase", async () => {
    await setup();
    try {
      await pushFromB();
      await commitFile(a, "local.txt", "local\n", "Local commit");
      await git(a, "config", "pull.rebase", "true");
      await service.updateWithMethod("branchDefault", "stash");
      assert.deepEqual(await subjects(a), [
        "Initial commit",
        "Remote commit",
        "Local commit",
      ]);
    } finally {
      await teardown();
    }
  });

  it("branchDefault merges when nothing is configured", async () => {
    await setup();
    try {
      await pushFromB();
      await commitFile(a, "local.txt", "local\n", "Local commit");
      await service.updateWithMethod("branchDefault", "stash");
      const parents = (await git(a, "rev-list", "--parents", "-n", "1", "HEAD"))
        .trim()
        .split(" ");
      assert.equal(parents.length, 3);
    } finally {
      await teardown();
    }
  });
});
