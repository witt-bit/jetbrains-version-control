/**
 * Protected branches (`jgc.protectedBranches`), the counterpart of Rider's
 * `GitSharedSettings` protected-branch patterns. Free of the `vscode` module
 * so the matching can be unit-tested and reused by any git operation.
 *
 * Patterns are whole-name, case-sensitive globs where `*` matches any run of
 * characters, `/` included (`release/*` covers `release/1.0/hotfix`).
 */

/** Used when the setting is absent or not an array of strings. */
export const DEFAULT_PROTECTED_BRANCHES: readonly string[] = ["main", "master"];

function patternToRegExp(pattern: string): RegExp {
  const source = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}$`);
}

/**
 * Whether `name` (a short branch name such as `main` or `release/1.0`, never
 * a remote-qualified `origin/main`) is covered by one of the patterns.
 * Blank patterns are ignored: an empty one must not match everything.
 */
export function isProtectedBranch(
  name: string,
  patterns: readonly string[],
): boolean {
  if (!name) return false;
  return patterns.some((raw) => {
    const pattern = raw.trim();
    return pattern !== "" && patternToRegExp(pattern).test(name);
  });
}

/** The setting's value, or the defaults when it is not an array. */
export function parseProtectedBranches(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_PROTECTED_BRANCHES];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

/** `origin/feature` -> `feature`; the remote is everything before the first `/`. */
export function remoteBranchShortName(remoteBranch: string): string {
  const slash = remoteBranch.indexOf("/");
  return slash === -1 ? remoteBranch : remoteBranch.slice(slash + 1);
}

export function forcePushRefusal(
  targetBranch: string,
  patterns: readonly string[],
): string | undefined {
  if (!isProtectedBranch(targetBranch, patterns)) return undefined;
  return `Force push to protected branch "${targetBranch}" is not allowed. Edit the "jgc.protectedBranches" setting to change which branches are protected.`;
}
