import type { GitExec } from "./cherryPick.ts";

/** Commits of a ref compared with HEAD by patch-equivalence (`git cherry`). */
export interface CherryMarks {
  /** On the ref only, with no patch-equivalent commit in HEAD. */
  notCherryPicked: string[];
  /**
   * Both halves of each equivalent pair: the commit on the ref and its
   * cherry-picked copy on HEAD.
   */
  cherryPicked: string[];
}

/** Parse `rev-list --left-right --cherry-mark` lines: `<hash`, `>hash`, `=hash`. */
export function parseCherryMarks(output: string): CherryMarks {
  const marks: CherryMarks = { notCherryPicked: [], cherryPicked: [] };
  for (const line of output.split("\n")) {
    const match = /^([<>=])([0-9a-f]{40,64})$/.exec(line.trim());
    if (!match) continue;
    if (match[1] === "=") marks.cherryPicked.push(match[2]);
    else if (match[1] === ">") marks.notCherryPicked.push(match[2]);
  }
  return marks;
}

/**
 * Which commits of `ref` (a branch, tag or commit) already have a
 * patch-equivalent commit in HEAD. Merge commits carry no patch and are left
 * out of both lists.
 */
export async function computeCherryMarks(
  exec: GitExec,
  ref: string,
): Promise<CherryMarks> {
  // A leading dash would be read as an option, not a revision.
  if (!ref || ref.startsWith("-")) {
    throw new Error(`Invalid revision: ${ref}`);
  }
  const output = await exec([
    "rev-list",
    "--left-right",
    "--cherry-mark",
    "--no-merges",
    `HEAD...${ref}`,
    "--",
  ]);
  return parseCherryMarks(output);
}
