import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { before, describe, it } from "node:test";
import { readCommitSettings } from "./commitSettings.ts";
import { GitService } from "./gitService.ts";
import {
  commitFile,
  createRepo,
  git,
  isolateGitEnvironment,
  makeTempDir,
} from "./testRepo.ts";

const posix = process.platform !== "win32";
const allChecks = readCommitSettings(() => undefined);
const IDENTITY_ENV = [
  "GIT_AUTHOR_NAME",
  "GIT_AUTHOR_EMAIL",
  "GIT_COMMITTER_NAME",
  "GIT_COMMITTER_EMAIL",
  "EMAIL",
];

async function newRepo(): Promise<{ dir: string; service: GitService }> {
  const dir = await makeTempDir("jgc-commit-");
  await createRepo(dir);
  return { dir, service: new GitService(dir) };
}

async function stage(dir: string, file: string, content: string | Buffer) {
  await fs.writeFile(path.join(dir, file), content);
  await git(dir, "add", "--", file);
}

const head = (dir: string, format: string) =>
  git(dir, "log", "-1", `--format=${format}`);

describe("GitService.commit options", () => {
  before(isolateGitEnvironment);

  it("adds a Signed-off-by trailer only when asked", async () => {
    const { dir, service } = await newRepo();
    await stage(dir, "a.txt", "a\n");
    await service.commit("plain");
    assert.doesNotMatch(await head(dir, "%B"), /Signed-off-by/);

    await stage(dir, "b.txt", "b\n");
    await service.commit("signed", false, { signOff: true });
    assert.match(
      await head(dir, "%B"),
      /signed\n\nSigned-off-by: Test Committer <committer@example\.com>/,
    );
  });

  it("does not stack trailers when a signed commit is amended", async () => {
    const { dir, service } = await newRepo();
    await stage(dir, "a.txt", "a\n");
    await service.commit("first", false, { signOff: true });
    await service.commit("second", true, { signOff: true });
    const body = await head(dir, "%B");
    assert.match(body, /^second\n/);
    assert.equal(body.match(/Signed-off-by/g)?.length, 1);
  });

  it(
    "runs hooks by default and skips them with --no-verify",
    { skip: !posix },
    async () => {
      const { dir, service } = await newRepo();
      const hook = path.join(dir, ".git", "hooks", "pre-commit");
      await fs.mkdir(path.dirname(hook), { recursive: true });
      await fs.writeFile(hook, "#!/bin/sh\necho blocked >&2\nexit 1\n", {
        mode: 0o755,
      });

      await stage(dir, "a.txt", "a\n");
      await assert.rejects(service.commit("hooked"), /blocked/);
      await service.commit("skipped", false, { noVerify: true });
      assert.equal((await head(dir, "%s")).trim(), "skipped");
    },
  );
});

describe("GitService.checkCommit", () => {
  before(isolateGitEnvironment);

  it("is quiet for an ordinary staged change", async () => {
    const { dir, service } = await newRepo();
    await stage(dir, "a.txt", "a\n");
    assert.deepEqual(await service.checkCommit(allChecks), []);
  });

  it("warns about a staged file over the size threshold", async () => {
    const { dir, service } = await newRepo();
    await stage(dir, "big.bin", Buffer.alloc(2048, 1));
    await stage(dir, "small.txt", "x\n");
    const settings = { ...allChecks, largeFileThresholdMB: 1 / 1024 };
    const warnings = await service.checkCommit(settings);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].kind, "largeFiles");
    assert.deepEqual(warnings[0].details, ["big.bin (2.0 KB)"]);

    assert.deepEqual(
      await service.checkCommit({ ...settings, warnLargeFiles: false }),
      [],
    );
  });

  it("warns about CRLF unless autocrlf normalizes it in the index", async () => {
    const { dir, service } = await newRepo();
    await stage(dir, "dos.txt", "one\r\ntwo\r\n");
    const warnings = await service.checkCommit(allChecks);
    assert.deepEqual(
      warnings.map((w) => w.kind),
      ["crlf"],
    );
    assert.deepEqual(warnings[0].details, ["dos.txt"]);
    assert.deepEqual(
      await service.checkCommit({ ...allChecks, warnCrlf: false }),
      [],
    );

    await git(dir, "config", "core.autocrlf", "true");
    await git(dir, "rm", "-q", "--cached", "dos.txt");
    await git(dir, "add", "dos.txt");
    assert.deepEqual(await service.checkCommit(allChecks), []);
  });

  it("checks what the commit would stage without touching the real index", async () => {
    const { dir, service } = await newRepo();
    await fs.writeFile(path.join(dir, "big.bin"), Buffer.alloc(2048, 1));
    await stage(dir, "dos.txt", "one\r\n");
    const settings = { ...allChecks, largeFileThresholdMB: 1 / 1024 };

    assert.deepEqual(
      (await service.checkCommit(settings)).map((w) => w.kind),
      ["crlf"],
    );
    const staged = async () =>
      (await git(dir, "diff", "--cached", "--name-only")).trim();
    const before = await staged();

    const checked = await service.checkCommit(settings, {
      stage: ["big.bin"],
      unstage: ["dos.txt"],
    });
    assert.deepEqual(
      checked.map((w) => w.kind),
      ["largeFiles"],
    );
    assert.equal(await staged(), before);
    const leftovers = (await fs.readdir(path.join(dir, ".git"))).filter((n) =>
      n.startsWith("jgc-check-index"),
    );
    assert.deepEqual(leftovers, []);
  });

  it("handles a repository with no commits yet", async () => {
    const dir = await makeTempDir("jgc-commit-");
    await git(dir, "init", "-q", "-b", "main");
    const service = new GitService(dir);
    await fs.writeFile(path.join(dir, "first.txt"), "one\r\n");
    const warnings = await service.checkCommit(allChecks, {
      stage: ["first.txt"],
    });
    assert.deepEqual(
      warnings.map((w) => w.kind),
      ["crlf"],
    );
  });

  it("warns on a detached HEAD", async () => {
    const { dir, service } = await newRepo();
    assert.equal(await service.isHeadDetached(), false);
    assert.deepEqual(await service.checkCommit(allChecks), []);

    await git(dir, "checkout", "-q", "--detach");
    assert.equal(await service.isHeadDetached(), true);
    assert.deepEqual(
      (await service.checkCommit(allChecks)).map((w) => w.kind),
      ["detachedHead"],
    );
    assert.deepEqual(
      await service.checkCommit({ ...allChecks, warnDetachedHead: false }),
      [],
    );
  });

  it("warns about a rebase in progress instead of a plain detached HEAD", async () => {
    const { dir, service } = await newRepo();
    await commitFile(dir, "f.txt", "base\n", "base");
    await git(dir, "checkout", "-q", "-b", "topic");
    await commitFile(dir, "f.txt", "topic\n", "topic change");
    await git(dir, "checkout", "-q", "main");
    await commitFile(dir, "f.txt", "main\n", "main change");
    await git(dir, "checkout", "-q", "topic");
    await assert.rejects(git(dir, "rebase", "main"));

    assert.equal(await service.isRebaseInProgress(), true);
    assert.deepEqual(
      (await service.checkCommit(allChecks)).map((w) => w.kind),
      ["rebaseInProgress"],
    );

    await git(dir, "rebase", "--abort");
    assert.equal(await service.isRebaseInProgress(), false);
  });

  it("warns when no author identity is configured anywhere", async () => {
    const { dir, service } = await newRepo();
    const saved = IDENTITY_ENV.map((k) => [k, process.env[k]] as const);
    for (const k of IDENTITY_ENV) delete process.env[k];
    try {
      assert.deepEqual(await service.getCommitIdentity(), {
        name: undefined,
        email: undefined,
      });
      assert.deepEqual(
        (await service.checkCommit(allChecks)).map((w) => w.kind),
        ["missingIdentity"],
      );

      await git(dir, "config", "user.name", "Local Name");
      const half = await service.checkCommit(allChecks);
      assert.match(half[0].message, /user\.email is not set/);

      await git(dir, "config", "user.email", "local@example.com");
      assert.deepEqual(await service.checkCommit(allChecks), []);
    } finally {
      for (const [k, v] of saved) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
