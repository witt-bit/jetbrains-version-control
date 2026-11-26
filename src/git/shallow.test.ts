import assert from "node:assert/strict";
import * as path from "node:path";
import { before, describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { GitService } from "./gitService.ts";
import {
  commitFile,
  createBareRepo,
  createRepo,
  git,
  isolateGitEnvironment,
  makeTempDir,
} from "./testRepo.ts";

before(() => {
  isolateGitEnvironment();
});

/** A bare origin with 5 commits and a depth-1 file:// clone of it. */
async function createShallowClone(root: string): Promise<{
  origin: string;
  shallow: string;
}> {
  const work = path.join(root, "work");
  const origin = path.join(root, "origin.git");
  await createRepo(work);
  for (let i = 2; i <= 5; i++) {
    await commitFile(work, `f${i}.txt`, `${i}\n`, `Commit ${i}`);
  }
  await createBareRepo(origin);
  await git(work, "push", "-q", origin, "main");
  const shallow = path.join(root, "shallow");
  await git(
    root,
    "clone",
    "-q",
    "--depth",
    "1",
    pathToFileURL(origin).href,
    shallow,
  );
  return { origin, shallow };
}

const count = async (dir: string): Promise<number> =>
  Number((await git(dir, "rev-list", "--count", "HEAD")).trim());

describe("GitService shallow repositories", () => {
  it("tells a shallow clone from a full repository", async () => {
    const root = await makeTempDir();
    const { shallow } = await createShallowClone(root);
    const full = path.join(root, "full");
    await createRepo(full);

    assert.equal(await new GitService(shallow).isShallow(), true);
    assert.equal(await new GitService(full).isShallow(), false);
  });

  it("is simply not shallow outside a repository", async () => {
    const root = await makeTempDir();
    assert.equal(await new GitService(root).isShallow(), false);
  });

  it("unshallow fetches the complete history", async () => {
    const root = await makeTempDir();
    const { shallow } = await createShallowClone(root);
    const service = new GitService(shallow);
    assert.equal(await count(shallow), 1);

    await service.unshallow();

    assert.equal(await count(shallow), 5);
    assert.equal(await service.isShallow(), false);
  });

  it("deepen adds the requested number of commits", async () => {
    const root = await makeTempDir();
    const { shallow } = await createShallowClone(root);
    const service = new GitService(shallow);

    await service.deepen(2);

    assert.equal(await count(shallow), 3);
    assert.equal(await service.isShallow(), true);
    await service.deepen(10);
    assert.equal(await count(shallow), 5);
  });

  it("explains instead of failing obscurely on a full repository", async () => {
    const root = await makeTempDir();
    const full = path.join(root, "full");
    await createRepo(full);
    const service = new GitService(full);

    await assert.rejects(service.unshallow(), /not shallow/);
    await assert.rejects(service.deepen(5), /not shallow/);
  });

  it("rejects a useless deepen count", async () => {
    const root = await makeTempDir();
    const { shallow } = await createShallowClone(root);
    const service = new GitService(shallow);

    await assert.rejects(service.deepen(0), /whole number/);
    await assert.rejects(service.deepen(1.5), /whole number/);
    assert.equal(await count(shallow), 1);
  });
});
