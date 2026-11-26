import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Make every git process in this test run ignore the developer's global and
 * system config (signing, hooks, default branch, rebase defaults…).
 */
export function isolateGitEnvironment(): void {
  process.env.GIT_CONFIG_GLOBAL = os.devNull;
  process.env.GIT_CONFIG_SYSTEM = os.devNull;
  process.env.GIT_AUTHOR_NAME = "Test Author";
  process.env.GIT_AUTHOR_EMAIL = "author@example.com";
  process.env.GIT_COMMITTER_NAME = "Test Committer";
  process.env.GIT_COMMITTER_EMAIL = "committer@example.com";
}

export async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return stdout;
}

export async function makeTempDir(prefix = "jgc-test-"): Promise<string> {
  return fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), prefix)));
}

/** A work-tree repository on branch `main` with one initial commit. */
export async function createRepo(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await git(dir, "init", "-q", "-b", "main");
  await commitFile(dir, "README.md", "hello\n", "Initial commit");
}

export async function createBareRepo(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await git(dir, "init", "-q", "--bare", "-b", "main");
}

/** Write `content` to `file`, stage it and commit. Returns the new hash. */
export async function commitFile(
  dir: string,
  file: string,
  content: string,
  message: string,
): Promise<string> {
  const full = path.join(dir, file);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
  await git(dir, "add", "--", file);
  await git(dir, "commit", "-q", "-m", message);
  return (await git(dir, "rev-parse", "HEAD")).trim();
}

/** `git log --format=%s` oldest-first, for asserting history shape. */
export async function subjects(dir: string, range = "HEAD"): Promise<string[]> {
  const out = await git(dir, "log", "--reverse", "--format=%s", range);
  return out.trim().split("\n").filter(Boolean);
}

/**
 * A bare "origin" plus two clones (`a` and `b`) that share `main`, so tests
 * can make one side diverge from the other.
 */
export async function createRemotePair(root: string): Promise<{
  origin: string;
  a: string;
  b: string;
}> {
  const origin = path.join(root, "origin.git");
  const a = path.join(root, "a");
  const b = path.join(root, "b");
  await createBareRepo(origin);
  await createRepo(a);
  await git(a, "remote", "add", "origin", origin);
  await git(a, "push", "-q", "-u", "origin", "main");
  await git(root, "clone", "-q", origin, b);
  return { origin, a, b };
}
