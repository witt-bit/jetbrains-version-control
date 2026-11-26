import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { before, describe, it } from "node:test";
import { GitService } from "./gitService.ts";
import {
  describeSubmoduleState,
  parseGitmodulesConfig,
  parseSubmoduleStatus,
} from "./submodules.ts";
import {
  commitFile,
  createRepo,
  git,
  isolateGitEnvironment,
  makeTempDir,
} from "./testRepo.ts";

before(() => {
  isolateGitEnvironment();
  // Local-path submodules are blocked by default since git 2.38.1.
  process.env.GIT_CONFIG_COUNT = "1";
  process.env.GIT_CONFIG_KEY_0 = "protocol.file.allow";
  process.env.GIT_CONFIG_VALUE_0 = "always";
});

const H1 = "a".repeat(40);
const H2 = "b".repeat(40);
const ZERO = "0".repeat(40);

describe("parseSubmoduleStatus", () => {
  it("reads the four states", () => {
    const out = [
      ` ${H1} libs/ok (heads/main)`,
      `-${H2} libs/missing`,
      `+${H1} libs/moved (v1.2-3-gabc1234)`,
      `U${ZERO} libs/conflicted`,
    ].join("\n");
    assert.deepEqual(parseSubmoduleStatus(out), [
      {
        path: "libs/ok",
        hash: H1,
        state: "initialized",
        describe: "heads/main",
      },
      { path: "libs/missing", hash: H2, state: "uninitialized" },
      {
        path: "libs/moved",
        hash: H1,
        state: "modified",
        describe: "v1.2-3-gabc1234",
      },
      { path: "libs/conflicted", hash: ZERO, state: "conflict" },
    ]);
  });

  it("keeps spaces and parentheses in paths", () => {
    const out = [
      `-${H1} my libs/dep (copy)`,
      ` ${H2} my libs/other (heads/main)`,
      ` ${H2} plain`,
    ].join("\n");
    assert.deepEqual(
      parseSubmoduleStatus(out).map((e) => e.path),
      ["my libs/dep (copy)", "my libs/other", "plain"],
    );
  });

  it("accepts sha256 hashes and CRLF, and skips noise", () => {
    const long = "c".repeat(64);
    const out = `\n garbage\r\n ${long} deep/path (heads/x)\r\n`;
    assert.deepEqual(parseSubmoduleStatus(out), [
      {
        path: "deep/path",
        hash: long,
        state: "initialized",
        describe: "heads/x",
      },
    ]);
    assert.deepEqual(parseSubmoduleStatus(""), []);
  });

  it("labels every state", () => {
    for (const state of [
      "initialized",
      "uninitialized",
      "modified",
      "conflict",
    ] as const) {
      assert.ok(describeSubmoduleState(state).length > 0);
    }
  });
});

describe("parseGitmodulesConfig", () => {
  it("groups variables by name, even when the name has dots", () => {
    const out = [
      "submodule.libs/dep.path\nlibs/dep",
      "submodule.libs/dep.url\nhttps://example.com/dep.git",
      "submodule.my.dotted.name.path\nvendor/x",
      "submodule.my.dotted.name.url\n../x.git",
      "submodule.my.dotted.name.branch\nmain",
      "",
    ].join("\0");
    assert.deepEqual(parseGitmodulesConfig(out), [
      {
        name: "libs/dep",
        path: "libs/dep",
        url: "https://example.com/dep.git",
      },
      { name: "my.dotted.name", path: "vendor/x", url: "../x.git" },
    ]);
  });

  it("returns nothing for empty output", () => {
    assert.deepEqual(parseGitmodulesConfig(""), []);
  });
});

/** A superproject with one submodule, both with a local origin-less history. */
async function createSuperproject(
  root: string,
  submodulePath = "libs/dep",
): Promise<{ sub: string; superWork: string }> {
  const sub = path.join(root, "dep-source");
  const superWork = path.join(root, "super");
  await createRepo(sub);
  await commitFile(sub, "dep.txt", "dep\n", "Add dep.txt");
  await createRepo(superWork);
  await git(superWork, "submodule", "add", "-q", sub, submodulePath);
  await git(superWork, "commit", "-q", "-m", "Add submodule");
  return { sub, superWork };
}

describe("GitService submodules", () => {
  it("lists a freshly added submodule with its .gitmodules data", async () => {
    const root = await makeTempDir();
    const { sub, superWork } = await createSuperproject(root);

    const list = await new GitService(superWork).listSubmodules();

    assert.equal(list.length, 1);
    const [dep] = list;
    assert.equal(dep?.path, "libs/dep");
    assert.equal(dep?.state, "initialized");
    assert.equal(dep?.name, "libs/dep");
    assert.equal(dep?.url, sub);
    assert.equal(dep?.absolutePath, path.join(superWork, "libs", "dep"));
    assert.equal(
      dep?.hash,
      (
        await git(path.join(superWork, "libs", "dep"), "rev-parse", "HEAD")
      ).trim(),
    );
  });

  it("works from a repository subfolder and with no submodules", async () => {
    const root = await makeTempDir();
    const { superWork } = await createSuperproject(root);
    await fs.mkdir(path.join(superWork, "docs"));
    assert.equal(
      (await new GitService(path.join(superWork, "docs")).listSubmodules())
        .length,
      1,
    );

    const plain = path.join(root, "plain");
    await createRepo(plain);
    assert.deepEqual(await new GitService(plain).listSubmodules(), []);
  });

  it("shows a clone's submodules as uninitialized until updated", async () => {
    const root = await makeTempDir();
    const { superWork } = await createSuperproject(root);
    const copy = path.join(root, "copy");
    await git(root, "clone", "-q", superWork, copy);
    const service = new GitService(copy);

    const before = await service.listSubmodules();
    assert.equal(before[0]?.state, "uninitialized");
    await assert.rejects(fs.stat(path.join(copy, "libs", "dep", "dep.txt")));

    await service.updateSubmodules();

    const after = await service.listSubmodules();
    assert.equal(after[0]?.state, "initialized");
    assert.equal(
      await fs.readFile(path.join(copy, "libs", "dep", "dep.txt"), "utf8"),
      "dep\n",
    );
  });

  it("updates only the submodules it is asked to", async () => {
    const root = await makeTempDir();
    const { sub, superWork } = await createSuperproject(root);
    await git(superWork, "submodule", "add", "-q", sub, "libs/other");
    await git(superWork, "commit", "-q", "-m", "Add second submodule");
    const copy = path.join(root, "copy");
    await git(root, "clone", "-q", superWork, copy);
    const service = new GitService(copy);

    await service.updateSubmodules(["libs/other"]);

    const states = Object.fromEntries(
      (await service.listSubmodules()).map((s) => [s.path, s.state]),
    );
    assert.deepEqual(states, {
      "libs/dep": "uninitialized",
      "libs/other": "initialized",
    });
  });

  it("flags a submodule at another commit as modified, and update restores it", async () => {
    const root = await makeTempDir();
    const { superWork } = await createSuperproject(root);
    const service = new GitService(superWork);
    const checkout = path.join(superWork, "libs", "dep");
    await commitFile(
      checkout,
      "extra.txt",
      "x\n",
      "Local work in the submodule",
    );

    assert.equal((await service.listSubmodules())[0]?.state, "modified");

    await service.updateSubmodules();

    assert.equal((await service.listSubmodules())[0]?.state, "initialized");
  });

  it("handles paths with spaces and non-ASCII characters", async () => {
    const root = await makeTempDir();
    const { superWork } = await createSuperproject(root, "my libs/dép");

    const [dep] = await new GitService(superWork).listSubmodules();

    assert.equal(dep?.path, "my libs/dép");
    assert.equal(dep?.state, "initialized");
    assert.equal(dep?.name, "my libs/dép");
  });

  it("recurses into nested submodules", async () => {
    const root = await makeTempDir();
    const inner = path.join(root, "inner");
    await createRepo(inner);
    const mid = path.join(root, "mid");
    await createRepo(mid);
    await git(mid, "submodule", "add", "-q", inner, "deps/inner");
    await git(mid, "commit", "-q", "-m", "Add inner");
    const top = path.join(root, "top");
    await createRepo(top);
    await git(top, "submodule", "add", "-q", mid, "libs/mid");
    await git(top, "commit", "-q", "-m", "Add mid");
    const copy = path.join(root, "copy");
    await git(root, "clone", "-q", top, copy);
    const service = new GitService(copy);

    await service.updateSubmodules();

    const paths = (await service.listSubmodules()).map((s) => [
      s.path,
      s.state,
    ]);
    assert.deepEqual(paths, [
      ["libs/mid", "initialized"],
      ["libs/mid/deps/inner", "initialized"],
    ]);
  });

  it("syncs a changed .gitmodules URL into the config and the submodule", async () => {
    const root = await makeTempDir();
    const { sub, superWork } = await createSuperproject(root);
    const moved = path.join(root, "dep-moved");
    await git(root, "clone", "-q", sub, moved);
    await git(
      superWork,
      "config",
      "-f",
      ".gitmodules",
      "submodule.libs/dep.url",
      moved,
    );
    const checkout = path.join(superWork, "libs", "dep");
    assert.equal(
      (await git(checkout, "remote", "get-url", "origin")).trim(),
      sub,
    );

    await new GitService(superWork).syncSubmodules();

    assert.equal(
      (
        await git(superWork, "config", "--get", "submodule.libs/dep.url")
      ).trim(),
      moved,
    );
    assert.equal(
      (await git(checkout, "remote", "get-url", "origin")).trim(),
      moved,
    );
  });

  it("reports a merge conflict on the recorded commit", async () => {
    const root = await makeTempDir();
    const { superWork } = await createSuperproject(root);
    const checkout = path.join(superWork, "libs", "dep");
    const base = (await git(checkout, "rev-parse", "HEAD")).trim();

    const sideCommit = await commitFile(checkout, "side.txt", "s\n", "Side");
    await git(superWork, "checkout", "-q", "-b", "side");
    await git(superWork, "add", "libs/dep");
    await git(superWork, "commit", "-q", "-m", "Move to side");
    await git(checkout, "checkout", "-q", base);
    await git(superWork, "checkout", "-q", "main");
    await git(checkout, "checkout", "-q", "-b", "other", base);
    const otherCommit = await commitFile(checkout, "other.txt", "o\n", "Other");
    await git(superWork, "add", "libs/dep");
    await git(superWork, "commit", "-q", "-m", "Move to other");
    assert.notEqual(sideCommit, otherCommit);
    await assert.rejects(git(superWork, "merge", "side"));

    const [dep] = await new GitService(superWork).listSubmodules();

    assert.equal(dep?.state, "conflict");
  });
});
