import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type RepositoryState = "repository" | "none";

/** Git is run from `cwd`; the environment is non-interactive and English. */
async function runGit(
  cwd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", args, {
    cwd,
    env: { ...process.env, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0" },
    maxBuffer: 10 * 1024 * 1024,
  });
}

/**
 * Whether `dir` is inside a git work tree. Rejects for everything that is not
 * a clear "no" (git missing, a folder that does not exist, "dubious
 * ownership"), so those are not mistaken for "not a repository".
 */
export async function detectRepository(dir: string): Promise<RepositoryState> {
  try {
    const { stdout } = await runGit(dir, [
      "rev-parse",
      "--is-inside-work-tree",
    ]);
    return stdout.trim() === "true" ? "repository" : "none";
  } catch (err) {
    const stderr = String((err as { stderr?: unknown }).stderr ?? "");
    if (/not a git repository/i.test(stderr)) return "none";
    throw err;
  }
}

/** `init.defaultBranch` when set (so a user's choice is respected), else `main`. */
export async function defaultInitialBranch(dir: string): Promise<string> {
  try {
    const { stdout } = await runGit(dir, [
      "config",
      "--get",
      "init.defaultBranch",
    ]);
    const configured = stdout.trim();
    if (configured && !branchNameProblem(configured)) return configured;
  } catch {
    // unset: exit code 1
  }
  return "main";
}

/**
 * A branch name git would refuse (`git check-ref-format --branch` rules), or
 * undefined when it is acceptable. Checked in-process so the input box can
 * validate on every keystroke.
 */
export function branchNameProblem(name: string): string | undefined {
  if (!name) return "Enter a branch name";
  if (name === "@") return "'@' is not a valid branch name";
  if (name.startsWith("-")) return "A branch name cannot start with '-'";
  if (name.startsWith("/") || name.endsWith("/")) {
    return "A branch name cannot start or end with '/'";
  }
  if (name.endsWith(".")) return "A branch name cannot end with '.'";
  if (name.includes("..")) return "A branch name cannot contain '..'";
  if (name.includes("//")) return "A branch name cannot contain '//'";
  if (name.includes("@{")) return "A branch name cannot contain '@{'";
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
  if (/[\u0000-\u0020\u007f~^:?*[\\]/.test(name)) {
    return "A branch name cannot contain spaces or any of ~ ^ : ? * [ \\";
  }
  for (const part of name.split("/")) {
    if (part.startsWith(".")) {
      return "A branch name component cannot start with '.'";
    }
    if (part.endsWith(".lock")) {
      return "A branch name component cannot end with '.lock'";
    }
  }
  return undefined;
}

export interface InitOptions {
  initialBranch: string;
}

/**
 * `git init -b <branch>` in `dir`. Refuses a folder that is already inside a
 * repository: that would nest a second `.git` in a subfolder, which is almost
 * never what "initialize" means.
 */
export async function initRepository(
  dir: string,
  options: InitOptions,
): Promise<void> {
  const branch = options.initialBranch.trim();
  const problem = branchNameProblem(branch);
  if (problem) throw new Error(problem);
  if ((await detectRepository(dir)) === "repository") {
    throw new Error("This folder is already inside a Git repository");
  }
  await runGit(dir, ["init", "-q", "-b", branch]);
}
