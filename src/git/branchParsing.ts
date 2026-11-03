import type { BranchInfo } from "./types";

/** Field separator used by `git branch --format` output (a real NUL byte). */
const FIELD_SEP = "\x00";

/**
 * Parse `git branch -r --format=<short%00HEAD%00upstream%00track%00hash%00fullref>`
 * output into remote BranchInfo entries.
 *
 * The last field is the FULL refname and is what makes HEAD-symref detection
 * reliable: `%(refname:short)` resolves `refs/remotes/origin/HEAD` to just
 * `origin`, so a naive `endsWith("/HEAD")` check on the short name let a bogus
 * branch named after the remote (e.g. "origin") through.
 */
export function parseRemoteBranchLines(output: string): BranchInfo[] {
  const result: BranchInfo[] = [];
  for (const line of output.trim().split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const fields = line.split(FIELD_SEP);
    const name = fields[0]?.trim() ?? "";
    const lastCommitHash = fields[4]?.trim() ?? "";
    const fullRef = fields[5]?.trim() ?? "";

    // Drop the per-remote HEAD symref (refs/remotes/<remote>/HEAD) and any
    // entry that is not "remote/branch" shaped.
    if (fullRef.endsWith("/HEAD") || !name.includes("/")) {
      continue;
    }

    result.push({
      name,
      isRemote: true,
      isCurrent: false,
      ahead: 0,
      behind: 0,
      lastCommitHash,
    });
  }
  return result;
}
