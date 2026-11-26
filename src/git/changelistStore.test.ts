import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { CHANGELIST_FILE_NAME, ChangelistStore } from "./changelistStore.ts";
import {
  createChangelist,
  createDefaultState,
  DEFAULT_CHANGELIST_ID,
  reconcile,
} from "./changelists.ts";
import { GitService } from "./gitService.ts";
import {
  createRepo,
  git,
  isolateGitEnvironment,
  makeTempDir,
} from "./testRepo.ts";

describe("ChangelistStore", () => {
  let dir: string;

  before(async () => {
    isolateGitEnvironment();
    dir = await makeTempDir();
  });

  after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("reads the default state when the file does not exist", async () => {
    const store = new ChangelistStore(path.join(dir, "missing.json"));
    assert.deepEqual(await store.read(), createDefaultState());
  });

  it("reads the default state from a corrupt file instead of throwing", async () => {
    const file = path.join(dir, "corrupt.json");
    await fs.writeFile(file, "{ not json");
    assert.deepEqual(
      await new ChangelistStore(file).read(),
      createDefaultState(),
    );
  });

  it("persists an update and reads it back", async () => {
    const store = new ChangelistStore(path.join(dir, "a", "lists.json"));
    const created = await store.update((state) =>
      createChangelist(state, "Feature", { id: "f", makeActive: true }),
    );
    assert.ok(created.ok);
    const state = await store.read();
    assert.equal(state.activeId, "f");
    assert.deepEqual(
      state.lists.map((list) => list.name),
      ["Changes", "Feature"],
    );
  });

  it("does not write when the change is a no-op or fails", async () => {
    const file = path.join(dir, "noop.json");
    const store = new ChangelistStore(file);
    await store.transform((state) => reconcile(state, [], 1));
    await assert.rejects(fs.stat(file));

    const rejected = await store.update((state) =>
      createChangelist(state, "   "),
    );
    assert.equal(rejected.ok, false);
    await assert.rejects(fs.stat(file));
  });

  it("serialises concurrent updates so none is lost", async () => {
    const store = new ChangelistStore(path.join(dir, "race.json"));
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        store.update((state) => createChangelist(state, `List ${index}`)),
      ),
    );
    assert.equal((await store.read()).lists.length, 21);
  });

  it("a failed update does not wedge the queue", async () => {
    const store = new ChangelistStore(path.join(dir, "wedge.json"));
    await assert.rejects(
      store.update(() => {
        throw new Error("boom");
      }),
    );
    const next = await store.update((state) => createChangelist(state, "Ok"));
    assert.ok(next.ok);
  });

  it("leaves no temp file behind", async () => {
    const folder = path.join(dir, "tmpcheck");
    const store = new ChangelistStore(path.join(folder, "lists.json"));
    await store.update((state) => createChangelist(state, "A"));
    assert.deepEqual(await fs.readdir(folder), ["lists.json"]);
  });
});

describe("GitService.changelists", () => {
  let dir: string;

  before(async () => {
    isolateGitEnvironment();
    dir = await makeTempDir();
    await createRepo(dir);
  });

  after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("keeps the file inside the git dir, so git status never sees it", async () => {
    const service = new GitService(dir);
    const store = await service.changelists();
    assert.equal(store.filePath, path.join(dir, ".git", CHANGELIST_FILE_NAME));

    await store.update((state) => createChangelist(state, "Feature"));
    assert.equal((await git(dir, "status", "--porcelain")).trim(), "");
  });

  it("returns one store per service", async () => {
    const service = new GitService(dir);
    assert.equal(await service.changelists(), await service.changelists());
  });

  it("gives a linked worktree its own file", async () => {
    const linked = path.join(dir, "..", `${path.basename(dir)}-wt`);
    await git(dir, "worktree", "add", "-q", "-b", "wt", linked);
    try {
      const main = await new GitService(dir).changelists();
      const other = await new GitService(
        await fs.realpath(linked),
      ).changelists();
      assert.notEqual(main.filePath, other.filePath);

      await main.update((state) =>
        createChangelist(state, "Only main", { id: "m" }),
      );
      assert.equal((await other.read()).lists.length, 1);
      assert.equal((await other.read()).lists[0].id, DEFAULT_CHANGELIST_ID);
    } finally {
      await git(dir, "worktree", "remove", "--force", linked);
    }
  });
});
