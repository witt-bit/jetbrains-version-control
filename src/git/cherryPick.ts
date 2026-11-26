/** What to do with a cherry-pick that turns out empty (Rider: EmptyCherryPickResolutionStrategy). */
export type CherryPickEmptyStrategy = "ask" | "skip" | "createEmpty";

export interface CherryPickOptions {
  emptyStrategy: CherryPickEmptyStrategy;
  /** `-x`: append "(cherry picked from commit …)" to the message. */
  appendSourceHash: boolean;
}

/**
 * Plain `git cherry-pick <hash>`: git stops on an empty pick and leaves the
 * cherry-pick in progress, for the user to skip or commit.
 */
export const DEFAULT_CHERRY_PICK_OPTIONS: CherryPickOptions = {
  emptyStrategy: "ask",
  appendSourceHash: false,
};

export type CherryPickOutcome =
  /** A new commit carries the change. */
  | "picked"
  /** The change was already in HEAD and the pick was dropped. */
  | "droppedEmpty"
  /** The change was already in HEAD and an empty commit was recorded. */
  | "committedEmpty"
  /** The change was already in HEAD; the cherry-pick waits for the user. */
  | "pausedEmpty";

export function parseCherryPickEmptyStrategy(
  value: unknown,
): CherryPickEmptyStrategy {
  return value === "ask" || value === "skip" || value === "createEmpty"
    ? value
    : DEFAULT_CHERRY_PICK_OPTIONS.emptyStrategy;
}

/** Read the options through an adapter, so this stays free of `vscode`. */
export function parseCherryPickOptions(
  get: (key: "emptyStrategy" | "appendSourceHash") => unknown,
): CherryPickOptions {
  const append = get("appendSourceHash");
  return {
    emptyStrategy: parseCherryPickEmptyStrategy(get("emptyStrategy")),
    appendSourceHash:
      typeof append === "boolean"
        ? append
        : DEFAULT_CHERRY_PICK_OPTIONS.appendSourceHash,
  };
}

/** `cherry-pick --empty=` exists from git 2.45; `git --version` text in, answer out. */
export function gitSupportsCherryPickEmpty(versionOutput: string): boolean {
  const match = /(\d+)\.(\d+)/.exec(versionOutput);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 2 || (major === 2 && minor >= 45);
}

/**
 * The arguments for the first attempt. `--empty=drop|keep` settles the empty
 * case inside git. Older git has no `--empty`, so only `createEmpty` has a
 * flag (`--keep-redundant-commits`) and `skip` is resolved after the pick
 * stops, by `runCherryPick`.
 */
export function buildCherryPickArgs(
  hash: string,
  options: CherryPickOptions,
  emptyFlagSupported: boolean,
): string[] {
  const args = ["cherry-pick"];
  if (options.appendSourceHash) args.push("-x");
  if (options.emptyStrategy === "skip" && emptyFlagSupported) {
    args.push("--empty=drop");
  } else if (options.emptyStrategy === "createEmpty") {
    args.push(emptyFlagSupported ? "--empty=keep" : "--keep-redundant-commits");
  }
  args.push(hash);
  return args;
}

export type GitExec = (args: string[]) => Promise<string>;

async function succeeds(exec: GitExec, args: string[]): Promise<boolean> {
  try {
    await exec(args);
    return true;
  } catch {
    return false;
  }
}

async function revParse(
  exec: GitExec,
  rev: string,
): Promise<string | undefined> {
  try {
    return (await exec(["rev-parse", "--verify", "--quiet", rev])).trim();
  } catch {
    return undefined;
  }
}

/**
 * A pick that stopped because it has nothing to commit: in progress, with no
 * conflicts and an index equal to HEAD. A conflict (or a failed hook) leaves
 * unmerged paths or staged changes, and is not this.
 */
async function isEmptyCherryPickStop(exec: GitExec): Promise<boolean> {
  try {
    if ((await revParse(exec, "CHERRY_PICK_HEAD")) === undefined) return false;
    const unmerged = await exec(["diff", "--name-only", "--diff-filter=U"]);
    if (unmerged.trim() !== "") return false;
    return await succeeds(exec, ["diff", "--cached", "--quiet"]);
  } catch {
    return false;
  }
}

/**
 * Cherry-pick one commit and settle an empty result per the strategy. Any
 * other failure (a conflict, a dirty tree) is rethrown with the pick left in
 * progress, exactly as a plain `git cherry-pick` leaves it.
 */
export async function runCherryPick(
  exec: GitExec,
  hash: string,
  options: CherryPickOptions,
  emptyFlagSupported: boolean,
): Promise<CherryPickOutcome> {
  const headBefore = await revParse(exec, "HEAD");
  try {
    await exec(buildCherryPickArgs(hash, options, emptyFlagSupported));
  } catch (err) {
    if (!(await isEmptyCherryPickStop(exec))) throw err;
    switch (options.emptyStrategy) {
      case "skip":
        await exec(["cherry-pick", "--skip"]);
        return "droppedEmpty";
      case "createEmpty":
        await exec(["commit", "--allow-empty", "--no-edit"]);
        return "committedEmpty";
      default:
        return "pausedEmpty";
    }
  }

  const headAfter = await revParse(exec, "HEAD");
  if (headBefore === undefined || headAfter === undefined) return "picked";
  if (headAfter === headBefore) return "droppedEmpty";
  const [treeBefore, treeAfter] = await Promise.all([
    revParse(exec, `${headBefore}^{tree}`),
    revParse(exec, "HEAD^{tree}"),
  ]);
  return treeBefore !== undefined && treeBefore === treeAfter
    ? "committedEmpty"
    : "picked";
}

/**
 * The message for an outcome, naming the setting that decided it. `picked`
 * needs none: the new commit appearing in the log is the feedback.
 */
export function describeCherryPickOutcome(
  outcome: CherryPickOutcome,
  shortHash: string,
): string | undefined {
  switch (outcome) {
    case "droppedEmpty":
      return `Cherry-pick of ${shortHash} skipped: its changes are already in the current branch, so nothing was committed (jgc.cherryPick.emptyStrategy: skip).`;
    case "committedEmpty":
      return `Cherry-pick of ${shortHash} created an empty commit: its changes were already in the current branch (jgc.cherryPick.emptyStrategy: createEmpty).`;
    case "pausedEmpty":
      return `Cherry-pick of ${shortHash} is empty: its changes are already in the current branch. Skip it or create an empty commit? Until you decide, the cherry-pick stays in progress (jgc.cherryPick.emptyStrategy: ask).`;
    default:
      return undefined;
  }
}
