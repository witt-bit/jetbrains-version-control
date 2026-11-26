import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { before, describe, it } from "node:test";
import { GitService } from "./gitService.ts";
import {
  normalizeSparseDirectories,
  parseSparseCheckoutList,
  parseSparseDirectoryInput,
  sparseDirectoryInputProblem,
} from "./sparseCheckout.ts";
import {
  commitFile,
  createRepo,
  git,
  isolateGitEnvironment,
  makeTempDir,
} from "./testRepo.ts";

before(() => {
  isolateGitEnvironment();
});

describe("parseSparseCheckoutList", () => {
  it("returns one entry per line and unquotes C-style names", () => {
    assert.deepEqual(parseSparseCheckoutList("docs\nsrc/app\n"), [
      "docs",
      "src/app",
    ]);
    assert.deepEqual(parseSparseCheckoutList('"q\\"x"\n"\\303\\251 dir"\n'), [
      'q"x',
      "é dir",
    ]);
    assert.deepEqual(parseSparseCheckoutList(""), []);
    assert.deepEqual(parseSparseCheckoutList("/*\n!/docs/\n"), [
      "/*",
      "!/docs/",
    ]);
  });
});

describe("directory input", () => {
  it("tidies separators, dots and duplicates", () => {
    assert.deepEqual(
      parseSparseDirectoryInput(
        "src/app/, ./docs ,\\win\\dir\n/lead//ing/, src/app",
      ),
      ["src/app", "docs", "win/dir", "lead/ing"],
    );
    assert.deepEqual(parseSparseDirectoryInput("  ,\n "), []);
    assert.deepEqual(normalizeSparseDirectories(["a b", "."]), ["a b"]);
  });

  it("rejects anything that leaves the repository", () => {
    assert.throws(() => parseSparseDirectoryInput("../secret"), /outside/);
    assert.throws(() => parseSparseDirectoryInput("a/../../b"), /outside/);
    assert.throws(() => parseSparseDirectoryInput("C:\\x"), /relative/);
    assert.ok(sparseDirectoryInputProblem("a, ../b"));
    assert.equal(sparseDirectoryInputProblem("a, b/c"), undefined);
  });
});

/** main with `docs/`, `src/app/`, `src/lib/` and a root file. */
async function createLayoutRepo(root: string): Promise<string> {
  const repo = path.join(root, "repo");
  await createRepo(repo);
  await commitFile(repo, "docs/guide.md", "g\n", "Add docs");
  await commitFile(repo, "src/app/main.ts", "a\n", "Add app");
  await commitFile(repo, "src/lib/util.ts", "l\n", "Add lib");
  return repo;
}

async function exists(file: string): Promise<boolean> {
  return fs.stat(file).then(
    () => true,
    () => false,
  );
}

describe("GitService sparse checkout", () => {
  it("reports a normal repository as not sparse", async () => {
    const repo = await createLayoutRepo(await makeTempDir());

    assert.deepEqual(await new GitService(repo).getSparseCheckout(), {
      enabled: false,
      cone: false,
      entries: [],
    });
  });

  it("enables cone mode with only the root files, then sets directories", async () => {
    const repo = await createLayoutRepo(await makeTempDir());
    const service = new GitService(repo);

    await service.enableSparseCheckout();

    assert.equal((await service.getSparseCheckout()).enabled, true);
    assert.equal((await service.getSparseCheckout()).cone, true);
    assert.equal(await exists(path.join(repo, "README.md")), true);
    assert.equal(await exists(path.join(repo, "docs")), false);

    await service.setSparseCheckout(["docs", "src/app/"]);

    const status = await service.getSparseCheckout();
    assert.deepEqual([...status.entries].sort(), ["docs", "src/app"]);
    assert.equal(await exists(path.join(repo, "docs", "guide.md")), true);
    assert.equal(await exists(path.join(repo, "src", "app", "main.ts")), true);
    assert.equal(await exists(path.join(repo, "src", "lib")), false);
  });

  it("enabling twice keeps the chosen directories", async () => {
    const repo = await createLayoutRepo(await makeTempDir());
    const service = new GitService(repo);
    await service.enableSparseCheckout(["docs"]);

    await service.enableSparseCheckout();

    assert.deepEqual((await service.getSparseCheckout()).entries, ["docs"]);
  });

  it("adds directories to the current set", async () => {
    const repo = await createLayoutRepo(await makeTempDir());
    const service = new GitService(repo);
    await service.setSparseCheckout(["docs"]);

    await service.addSparseCheckout(["src/lib"]);

    assert.deepEqual([...(await service.getSparseCheckout()).entries].sort(), [
      "docs",
      "src/lib",
    ]);
    assert.equal(await exists(path.join(repo, "src", "lib", "util.ts")), true);
    assert.equal(await exists(path.join(repo, "src", "app")), false);
  });

  it("will not add to a repository that is not sparse, or add nothing", async () => {
    const repo = await createLayoutRepo(await makeTempDir());
    const service = new GitService(repo);

    await assert.rejects(service.addSparseCheckout(["docs"]), /not enabled/);
    await service.setSparseCheckout(["docs"]);
    await assert.rejects(service.addSparseCheckout([]), /at least one/);
    await assert.rejects(service.addSparseCheckout(["../x"]), /outside/);
  });

  it("disable restores the whole working tree", async () => {
    const repo = await createLayoutRepo(await makeTempDir());
    const service = new GitService(repo);
    await service.setSparseCheckout(["docs"]);
    assert.equal(await exists(path.join(repo, "src")), false);

    await service.disableSparseCheckout();

    assert.equal((await service.getSparseCheckout()).enabled, false);
    assert.equal(await exists(path.join(repo, "src", "lib", "util.ts")), true);
    assert.equal((await git(repo, "status", "--porcelain")).trim(), "");
  });

  it("handles directory names with spaces and non-ASCII characters", async () => {
    const root = await makeTempDir();
    const repo = path.join(root, "repo");
    await createRepo(repo);
    await commitFile(repo, "my docs/é.md", "x\n", "Add odd dir");
    await commitFile(repo, "other/y.md", "y\n", "Add other");
    const service = new GitService(repo);

    await service.setSparseCheckout(["my docs"]);

    assert.deepEqual((await service.getSparseCheckout()).entries, ["my docs"]);
    assert.equal(await exists(path.join(repo, "other")), false);
    assert.equal(await exists(path.join(repo, "my docs", "é.md")), true);
  });
});
