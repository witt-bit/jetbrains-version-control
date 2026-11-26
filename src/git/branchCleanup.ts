/**
 * Merged-branch cleanup helpers, kept free of `vscode` so they can be
 * unit-tested.
 */

import { isProtectedBranch } from "./protectedBranches.ts";

/**
 * The single gate every branch deletion in the cleanup flow passes through.
 * It returns the subset of `branches` that may be deleted: a bulk cleanup
 * never removes a protected branch (single-branch deletes ask for explicit
 * confirmation instead).
 */
export function filterDeletable(
  branches: string[],
  protectedPatterns: readonly string[] = [],
): string[] {
  return branches.filter((name) => !isProtectedBranch(name, protectedPatterns));
}

const LOCAL_REF_PREFIX = "refs/heads/";

/** Local branch names from `git branch --format=%(refname)` output. */
export function parseLocalBranchRefs(output: string): string[] {
  const names: string[] = [];
  for (const line of output.split("\n")) {
    const ref = line.trim();
    // Anything else is the "(HEAD detached at …)" pseudo entry.
    if (ref.startsWith(LOCAL_REF_PREFIX)) {
      names.push(ref.substring(LOCAL_REF_PREFIX.length));
    }
  }
  return names;
}

/**
 * Merged branches that are safe to offer for deletion: never the branch the
 * merge is measured against, the current branch, or one checked out in any
 * worktree (git refuses to delete those anyway).
 */
export function selectCleanupCandidates(
  merged: string[],
  options: {
    base: string;
    currentBranch: string | null;
    worktreeBranches: string[];
  },
): string[] {
  const keep = new Set(options.worktreeBranches);
  if (options.currentBranch) keep.add(options.currentBranch);
  const base = options.base.startsWith(LOCAL_REF_PREFIX)
    ? options.base.substring(LOCAL_REF_PREFIX.length)
    : options.base;
  return merged.filter((name) => name !== base && !keep.has(name));
}
