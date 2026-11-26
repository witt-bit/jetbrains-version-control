import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import * as path from "node:path";
import { before, describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import {
  batchSshCommand,
  CloneCancelledError,
  CloneError,
  type CloneProgress,
  classifyCloneFailure,
  cloneNameProblem,
  cloneRepository,
  cloneTargetProblem,
  cloneUrlProblem,
  gitFailureMessage,
  parseCloneProgress,
  redactUrlCredentials,
  repoNameFromUrl,
  splitProgressChunk,
} from "./cloneRepo.ts";
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
  process.env.NO_PROXY = "127.0.0.1,localhost";
  process.env.no_proxy = "127.0.0.1,localhost";
});

/** A bare repository holding a few commits, as a clone source. */
async function createSource(root: string): Promise<string> {
  const work = path.join(root, "work");
  const bare = path.join(root, "source.git");
  await createRepo(work);
  for (let i = 1; i <= 5; i++) {
    await commitFile(work, `file${i}.txt`, `${i}\n`, `Add file ${i}`);
  }
  await createBareRepo(bare);
  await git(work, "remote", "add", "origin", bare);
  await git(work, "push", "-q", "origin", "main");
  return bare;
}

describe("repoNameFromUrl", () => {
  it("derives the folder name git would pick", () => {
    assert.equal(repoNameFromUrl("https://github.com/o/repo.git"), "repo");
    assert.equal(repoNameFromUrl("https://github.com/o/repo"), "repo");
    assert.equal(repoNameFromUrl("https://github.com/o/repo/"), "repo");
    assert.equal(repoNameFromUrl("git@github.com:o/my.repo.git"), "my.repo");
    assert.equal(repoNameFromUrl("ssh://git@host:2222/srv/x.git"), "x");
    assert.equal(repoNameFromUrl("C:\\work\\thing.git"), "thing");
    assert.equal(repoNameFromUrl("/srv/git/bare.git"), "bare");
    assert.equal(repoNameFromUrl("host:solo.git"), "solo");
    assert.equal(repoNameFromUrl("  "), "repository");
  });
});

describe("input validation", () => {
  it("rejects URLs git would read as options or that are empty", () => {
    assert.ok(cloneUrlProblem(""));
    assert.ok(cloneUrlProblem("   "));
    assert.ok(cloneUrlProblem("--upload-pack=evil"));
    assert.ok(cloneUrlProblem("https://x/y\n--z"));
    assert.equal(cloneUrlProblem("https://example.com/a.git"), undefined);
    assert.equal(cloneUrlProblem("git@example.com:a/b.git"), undefined);
    assert.equal(cloneUrlProblem("/srv/git/a.git"), undefined);
  });

  it("rejects folder names that escape the parent", () => {
    assert.ok(cloneNameProblem(""));
    assert.ok(cloneNameProblem(".."));
    assert.ok(cloneNameProblem("a/b"));
    assert.ok(cloneNameProblem("a\\b"));
    assert.equal(cloneNameProblem("my repo"), undefined);
  });

  it("flags a non-empty target but accepts missing and empty ones", async () => {
    const root = await makeTempDir();
    assert.equal(await cloneTargetProblem(path.join(root, "nope")), undefined);
    await fs.mkdir(path.join(root, "empty"));
    assert.equal(await cloneTargetProblem(path.join(root, "empty")), undefined);
    await fs.mkdir(path.join(root, "full"));
    await fs.writeFile(path.join(root, "full", "x"), "x");
    assert.match(
      (await cloneTargetProblem(path.join(root, "full"))) ?? "",
      /not empty/,
    );
    await fs.writeFile(path.join(root, "file"), "x");
    assert.match(
      (await cloneTargetProblem(path.join(root, "file"))) ?? "",
      /not a folder/,
    );
  });
});

describe("parseCloneProgress", () => {
  it("maps the receiving phase into the first part of the bar", () => {
    const p = parseCloneProgress(
      "Receiving objects:  50% (6/12), 1.2 MiB | 2.0 MiB/s",
    );
    assert.equal(p?.phase, "Receiving objects");
    assert.equal(p?.percent, 50);
    assert.equal(p?.detail, "(6/12), 1.2 MiB | 2.0 MiB/s");
    assert.equal(p?.overall, 35);
  });

  it("reaches 100 only when files are written", () => {
    assert.equal(
      parseCloneProgress("Receiving objects: 100% (12/12)")?.overall,
      70,
    );
    assert.equal(
      parseCloneProgress("Resolving deltas: 100% (3/3)")?.overall,
      85,
    );
    assert.equal(
      parseCloneProgress("Updating files: 100% (5/5)")?.overall,
      100,
    );
  });

  it("accepts remote lines and phases without a percentage", () => {
    assert.equal(
      parseCloneProgress("remote: Counting objects:  8% (1/12)")?.phase,
      "Counting objects",
    );
    assert.equal(
      parseCloneProgress("remote: Enumerating objects: 12, done.")?.phase,
      "Enumerating objects",
    );
  });

  it("ignores errors and plain messages", () => {
    assert.equal(
      parseCloneProgress("fatal: repository 'x' does not exist"),
      null,
    );
    assert.equal(parseCloneProgress("Cloning into 'x'..."), null);
    assert.equal(parseCloneProgress(""), null);
  });

  it("carries a line split across chunks", () => {
    const first = splitProgressChunk(
      "",
      "Receiving objects:  10% (1/10)\rReceiving obj",
    );
    assert.deepEqual(first.lines, ["Receiving objects:  10% (1/10)"]);
    assert.equal(first.rest, "Receiving obj");
    const second = splitProgressChunk(first.rest, "ects:  20% (2/10)\n");
    assert.deepEqual(second.lines, ["Receiving objects:  20% (2/10)"]);
    assert.equal(second.rest, "");
  });
});

describe("redactUrlCredentials", () => {
  it("hides tokens and passwords but keeps ssh users", () => {
    assert.equal(
      redactUrlCredentials(
        "fatal: unable to access 'https://me:tok3n@host/r.git/'",
      ),
      "fatal: unable to access 'https://***@host/r.git/'",
    );
    assert.equal(
      redactUrlCredentials("https://ghp_secret@host/r.git"),
      "https://***@host/r.git",
    );
    assert.equal(
      redactUrlCredentials("ssh://git:pw@host/r.git"),
      "ssh://git:***@host/r.git",
    );
    assert.equal(
      redactUrlCredentials("ssh://git@host/r.git"),
      "ssh://git@host/r.git",
    );
  });
});

describe("classifyCloneFailure", () => {
  it("recognises authentication failures", () => {
    for (const text of [
      "fatal: could not read Username for 'https://x': terminal prompts disabled",
      "remote: Invalid username or password.\nfatal: Authentication failed for 'https://x/'",
      "git@host: Permission denied (publickey).\nfatal: Could not read from remote repository.",
      "fatal: unable to access 'https://x/': The requested URL returned error: 403",
      "fatal: unable to get password from user",
    ]) {
      assert.equal(classifyCloneFailure(text).kind, "auth", text);
    }
  });

  it("separates the other failure kinds", () => {
    assert.equal(
      classifyCloneFailure("fatal: repository 'https://x/y.git/' not found")
        .kind,
      "notFound",
    );
    assert.equal(
      classifyCloneFailure(
        "fatal: repository '/nonexistent/zzz' does not exist",
      ).kind,
      "notFound",
    );
    assert.equal(
      classifyCloneFailure(
        "fatal: unable to access 'http://127.0.0.1:1/x.git/': Failed to connect to 127.0.0.1 port 1",
      ).kind,
      "network",
    );
    assert.equal(
      classifyCloneFailure("Host key verification failed.").kind,
      "hostKey",
    );
    assert.equal(
      classifyCloneFailure(
        "fatal: destination path 'c1' already exists and is not an empty directory.",
      ).kind,
      "targetExists",
    );
    assert.equal(classifyCloneFailure("fatal: something odd").kind, "other");
  });

  it("never echoes credentials in the message", () => {
    const { message } = classifyCloneFailure(
      "fatal: unable to access 'https://me:tok3n@host/r.git/': Could not resolve host: host",
    );
    assert.ok(!message.includes("tok3n"));
  });
});

describe("gitFailureMessage", () => {
  it("prefers git's own fatal line and masks credentials", () => {
    const err = Object.assign(new Error("Command failed: git fetch\nlong"), {
      stderr:
        "From https://me:tok3n@host/r\nfatal: unable to access 'https://me:tok3n@host/r.git/': 500\n",
    });
    assert.equal(
      gitFailureMessage(err),
      "fatal: unable to access 'https://***@host/r.git/': 500",
    );
  });

  it("falls back to the plain message", () => {
    assert.equal(gitFailureMessage(new Error("boom")), "boom");
    assert.equal(gitFailureMessage("text"), "text");
    assert.equal(
      gitFailureMessage(Object.assign(new Error("m"), { stderr: " " })),
      "m",
    );
  });
});

describe("batchSshCommand", () => {
  it("extends whatever ssh command the user already configured", () => {
    assert.equal(batchSshCommand({}, undefined), "ssh -o BatchMode=yes");
    assert.equal(
      batchSshCommand({}, "ssh -i ~/.ssh/work"),
      "ssh -i ~/.ssh/work -o BatchMode=yes",
    );
    assert.equal(
      batchSshCommand({ GIT_SSH_COMMAND: "plink -batch" }, "ssh"),
      "plink -batch -o BatchMode=yes",
    );
  });

  it("leaves a custom GIT_SSH program alone", () => {
    assert.equal(
      batchSshCommand({ GIT_SSH: "/opt/ssh-wrapper" }, undefined),
      undefined,
    );
  });
});

describe("cloneRepository", () => {
  it("clones a local bare repository over file:// and reports progress", async () => {
    const root = await makeTempDir();
    const source = await createSource(root);
    const target = path.join(root, "out", "cloned");
    const seen: CloneProgress[] = [];

    const result = await cloneRepository({
      url: pathToFileURL(source).href,
      targetDir: target,
      onProgress: (p) => seen.push(p),
    });

    assert.equal(result.directory, target);
    assert.equal(
      (await git(target, "rev-list", "--count", "HEAD")).trim(),
      "6",
    );
    assert.equal(
      await fs.readFile(path.join(target, "file5.txt"), "utf8"),
      "5\n",
    );
    assert.ok(
      seen.some((p) => p.phase === "Receiving objects"),
      "expected receiving-objects progress",
    );
    const overall = seen.map((p) => p.overall).filter((n) => n > 0);
    assert.ok(overall.every((n) => n >= 0 && n <= 100));
  });

  it("clones from a plain path and into an existing empty folder", async () => {
    const root = await makeTempDir();
    const source = await createSource(root);
    const target = path.join(root, "empty-target");
    await fs.mkdir(target);

    await cloneRepository({ url: source, targetDir: target });

    assert.equal(
      (await git(target, "rev-parse", "--abbrev-ref", "HEAD")).trim(),
      "main",
    );
    assert.equal(
      (await git(target, "remote", "get-url", "origin")).trim(),
      source,
    );
  });

  it("refuses a non-empty target without touching it", async () => {
    const root = await makeTempDir();
    const source = await createSource(root);
    const target = path.join(root, "busy");
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, "keep.txt"), "mine");

    await assert.rejects(
      cloneRepository({ url: source, targetDir: target }),
      (err: unknown) =>
        err instanceof CloneError && err.kind === "targetExists",
    );
    assert.equal(
      await fs.readFile(path.join(target, "keep.txt"), "utf8"),
      "mine",
    );
  });

  it("explains a missing repository and leaves no folder behind", async () => {
    const root = await makeTempDir();
    const target = path.join(root, "never");

    await assert.rejects(
      cloneRepository({
        url: path.join(root, "nonexistent.git"),
        targetDir: target,
      }),
      (err: unknown) =>
        err instanceof CloneError &&
        err.kind === "notFound" &&
        /not found/i.test(err.message),
    );
    await assert.rejects(fs.stat(target));
  });

  it("rejects option-looking URLs before running git", async () => {
    const root = await makeTempDir();
    await assert.rejects(
      cloneRepository({
        url: "--upload-pack=touch pwned",
        targetDir: path.join(root, "x"),
      }),
      (err: unknown) => err instanceof CloneError,
    );
    await assert.rejects(fs.stat(path.join(root, "x")));
  });

  it("stops when the signal aborts and removes what it created", async () => {
    const root = await makeTempDir();
    const source = await createSource(root);
    const target = path.join(root, "aborted");
    const controller = new AbortController();

    const pending = cloneRepository({
      url: pathToFileURL(source).href,
      targetDir: target,
      signal: controller.signal,
    });
    controller.abort();

    await assert.rejects(
      pending,
      (err: unknown) => err instanceof CloneCancelledError,
    );
    await assert.rejects(fs.stat(target));
  });

  it("fails fast with an auth error instead of prompting", async () => {
    const root = await makeTempDir();
    const server = http.createServer((_req, res) => {
      res.writeHead(401, { "WWW-Authenticate": 'Basic realm="jgc"' });
      res.end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const { port } = server.address() as AddressInfo;
    try {
      await assert.rejects(
        cloneRepository({
          url: `http://127.0.0.1:${port}/private.git`,
          targetDir: path.join(root, "private"),
        }),
        (err: unknown) => err instanceof CloneError && err.kind === "auth",
      );
    } finally {
      server.close();
    }
  });

  it("clones submodules too when asked", async () => {
    const root = await makeTempDir();
    process.env.GIT_CONFIG_COUNT = "1";
    process.env.GIT_CONFIG_KEY_0 = "protocol.file.allow";
    process.env.GIT_CONFIG_VALUE_0 = "always";
    const sub = await createSource(path.join(root, "subsrc"));
    const superWork = path.join(root, "super");
    await createRepo(superWork);
    await git(superWork, "submodule", "add", "-q", sub, "libs/dep");
    await git(superWork, "commit", "-q", "-m", "Add dep");
    const superBare = path.join(root, "super.git");
    await git(root, "clone", "-q", "--bare", superWork, superBare);

    const plain = path.join(root, "plain");
    const deep = path.join(root, "deep");
    await cloneRepository({ url: superBare, targetDir: plain });
    await cloneRepository({
      url: superBare,
      targetDir: deep,
      recurseSubmodules: true,
    });

    await assert.rejects(fs.stat(path.join(plain, "libs", "dep", "file1.txt")));
    assert.equal(
      await fs.readFile(path.join(deep, "libs", "dep", "file1.txt"), "utf8"),
      "1\n",
    );
  });
});
