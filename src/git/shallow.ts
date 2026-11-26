import type { GitRun } from "./submodules.ts";

/** `git rev-parse --is-shallow-repository` (git 2.15+; older ones echo the flag back). */
export async function isShallowRepository(run: GitRun): Promise<boolean> {
  try {
    return (
      (await run(["rev-parse", "--is-shallow-repository"])).trim() === "true"
    );
  } catch {
    return false;
  }
}

async function requireShallow(run: GitRun): Promise<void> {
  if (!(await isShallowRepository(run))) {
    throw new Error(
      "This repository is not shallow: it already has its full history",
    );
  }
}

/** Fetch the complete history of a shallow repository. */
export async function unshallowRepository(
  run: GitRun,
  remote?: string,
  env?: Record<string, string | undefined>,
): Promise<void> {
  await requireShallow(run);
  await run(["fetch", "--unshallow", ...(remote ? ["--", remote] : [])], env);
}

/** Fetch `commits` more commits of history beyond the current shallow boundary. */
export async function deepenRepository(
  run: GitRun,
  commits: number,
  env?: Record<string, string | undefined>,
): Promise<void> {
  if (!Number.isInteger(commits) || commits < 1) {
    throw new Error("Enter a whole number of commits, 1 or more");
  }
  await requireShallow(run);
  await run(["fetch", `--deepen=${commits}`], env);
}
