import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { before, describe, it } from "node:test";
import {
  branchNameProblem,
  defaultInitialBranch,
  detectRepository,
  initRepository,
} from "./initRepo.ts";
import {
  createRepo,
  git,
  isolateGitEnvironment,
  makeTempDir,
} from "./testRepo.ts";

before(async () => {
  isolateGitEnvironment();
  // A repository enclosing the temp directory must not turn "plain" into "repository".
  process.env.GIT_CEILING_DIRECTORIES = await fs.realpath(os.tmpdir());
});

describe("detectRepository", () => {
  it("tells a plain folder from a repository and its subfolders", async () => {
    const root = await makeTempDir();
    const plain = path.join(root, "plain");
    const repo = path.join(root, "repo");
    await fs.mkdir(plain);
    await createRepo(repo);
    await fs.mkdir(path.join(repo, "sub"));

    assert.equal(await detectRepository(plain), "none");
    assert.equal(await detectRepository(repo), "repository");
    assert.equal(await detectRepository(path.join(repo, "sub")), "repository");
  });

  it("rejects instead of answering 'none' when the folder is missing", async () => {
    const root = await makeTempDir();
    await assert.rejects(detectRepository(path.join(root, "missing")));
  });
});

describe("branchNameProblem", () => {
  it("accepts ordinary names", () => {
    for (const name of [
      "main",
      "trunk",
      "feature/login",
      "release-1.2",
      "a_b",
    ]) {
      assert.equal(branchNameProblem(name), undefined, name);
    }
  });

  it("rejects what git rejects", () => {
    for (const name of [
      "",
      "@",
      "-x",
      "/x",
      "x/",
      "a..b",
      "a//b",
      "a b",
      "a~1",
      "a^",
      "a:b",
      "a?",
      "a*",
      "a[",
      "a\\b",
      "a@{b",
      "x.",
      "x.lock",
      "a/.hidden",
      "a/b.lock/c",
      "tab\there",
    ]) {
      assert.ok(branchNameProblem(name), JSON.stringify(name));
    }
  });
});

describe("initRepository", () => {
  it("creates a repository whose HEAD is the chosen branch", async () => {
    const root = await makeTempDir();
    const dir = path.join(root, "fresh");
    await fs.mkdir(dir);

    await initRepository(dir, { initialBranch: "trunk" });

    assert.equal(await detectRepository(dir), "repository");
    assert.equal(
      (await git(dir, "symbolic-ref", "--short", "HEAD")).trim(),
      "trunk",
    );
  });

  it("refuses an invalid branch name without creating anything", async () => {
    const root = await makeTempDir();
    const dir = path.join(root, "fresh");
    await fs.mkdir(dir);

    await assert.rejects(initRepository(dir, { initialBranch: "bad name" }));
    assert.equal(await detectRepository(dir), "none");
  });

  it("refuses a folder that is already in a repository", async () => {
    const root = await makeTempDir();
    const repo = path.join(root, "repo");
    await createRepo(repo);
    const nested = path.join(repo, "nested");
    await fs.mkdir(nested);

    await assert.rejects(
      initRepository(repo, { initialBranch: "main" }),
      /already/,
    );
    await assert.rejects(
      initRepository(nested, { initialBranch: "main" }),
      /already/,
    );
    await assert.rejects(fs.stat(path.join(nested, ".git")));
  });
});

describe("defaultInitialBranch", () => {
  it("is main unless init.defaultBranch says otherwise", async () => {
    const root = await makeTempDir();
    assert.equal(await defaultInitialBranch(root), "main");

    process.env.GIT_CONFIG_COUNT = "1";
    process.env.GIT_CONFIG_KEY_0 = "init.defaultBranch";
    process.env.GIT_CONFIG_VALUE_0 = "develop";
    try {
      assert.equal(await defaultInitialBranch(root), "develop");
      process.env.GIT_CONFIG_VALUE_0 = "bad name";
      assert.equal(await defaultInitialBranch(root), "main");
    } finally {
      delete process.env.GIT_CONFIG_COUNT;
      delete process.env.GIT_CONFIG_KEY_0;
      delete process.env.GIT_CONFIG_VALUE_0;
    }
  });
});
