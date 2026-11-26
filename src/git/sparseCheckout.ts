import { unquoteGitPath } from "./pathUtils.ts";
import type { GitRun } from "./submodules.ts";

export interface SparseCheckoutStatus {
  enabled: boolean;
  /** Cone mode: patterns are plain directories. */
  cone: boolean;
  /** Directories (cone mode) or raw patterns, as `git sparse-checkout list` prints them. */
  entries: string[];
}

/** `git sparse-checkout list` output: one entry per line, C-quoted when needed. */
export function parseSparseCheckoutList(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map(unquoteGitPath);
}

/**
 * Split user input (commas or new lines) into directories and tidy each one
 * into the repository-relative form `git sparse-checkout` expects. Throws on
 * anything that points outside the repository.
 */
export function parseSparseDirectoryInput(text: string): string[] {
  return normalizeSparseDirectories(text.split(/[\r\n,]+/));
}

export function normalizeSparseDirectories(raw: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    const cleaned = item
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/")
      .replace(/^(\.\/)+/, "")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
    if (!cleaned || cleaned === ".") continue;
    if (/^[A-Za-z]:/.test(cleaned)) {
      throw new Error(`"${item.trim()}" is not a repository-relative path`);
    }
    if (cleaned.split("/").some((segment) => segment === "..")) {
      throw new Error(`"${item.trim()}" points outside the repository`);
    }
    if (!seen.has(cleaned)) {
      seen.add(cleaned);
      result.push(cleaned);
    }
  }
  return result;
}

/** A problem with the typed directories, or undefined; for input-box validation. */
export function sparseDirectoryInputProblem(text: string): string | undefined {
  try {
    parseSparseDirectoryInput(text);
    return undefined;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

async function readBool(run: GitRun, key: string): Promise<boolean> {
  try {
    return (await run(["config", "--bool", "--get", key])).trim() === "true";
  } catch {
    // Exit code 1: the key is unset.
    return false;
  }
}

/** `list` fails with "this worktree is not sparse", so ask the config first. */
export async function sparseCheckoutStatus(
  run: GitRun,
): Promise<SparseCheckoutStatus> {
  const enabled = await readBool(run, "core.sparseCheckout");
  if (!enabled) return { enabled: false, cone: false, entries: [] };
  const cone = await readBool(run, "core.sparseCheckoutCone");
  const entries = parseSparseCheckoutList(
    await run(["sparse-checkout", "list"]),
  );
  return { enabled: true, cone, entries };
}

/**
 * Turn cone-mode sparse checkout on with `directories` (root-level files are
 * always kept). A no-op when cone mode is already on and nothing is asked.
 */
export async function enableSparseCheckout(
  run: GitRun,
  directories: string[] = [],
): Promise<void> {
  const dirs = normalizeSparseDirectories(directories);
  if (dirs.length === 0) {
    const status = await sparseCheckoutStatus(run);
    if (status.enabled && status.cone) return;
  }
  await setSparseCheckout(run, dirs);
}

/** Replace the checked-out directories (enables cone mode if needed). */
export async function setSparseCheckout(
  run: GitRun,
  directories: string[],
): Promise<void> {
  const dirs = normalizeSparseDirectories(directories);
  await run([
    "sparse-checkout",
    "set",
    "--cone",
    ...(dirs.length ? ["--", ...dirs] : []),
  ]);
}

/** Check out more directories on top of the current set. */
export async function addSparseCheckout(
  run: GitRun,
  directories: string[],
): Promise<void> {
  const dirs = normalizeSparseDirectories(directories);
  if (dirs.length === 0) throw new Error("Enter at least one directory");
  const status = await sparseCheckoutStatus(run);
  if (!status.enabled) {
    throw new Error("Sparse checkout is not enabled in this repository");
  }
  await run(["sparse-checkout", "add", "--", ...dirs]);
}

/** Turn sparse checkout off and restore the full working tree. */
export async function disableSparseCheckout(run: GitRun): Promise<void> {
  await run(["sparse-checkout", "disable"]);
}
