/**
 * Argument building and validation for the stash dialogs. Pure, so the exact
 * git invocations can be tested without a repository.
 */

export interface StashPushOptions {
  /** Empty or missing keeps git's own "WIP on <branch>: …" message. */
  message?: string;
  /** Leave staged changes in the index and working tree (`--keep-index`). */
  keepIndex?: boolean;
  /** Stash untracked files too (`-u`). */
  includeUntracked?: boolean;
}

export function buildStashPushArgs(options: StashPushOptions): string[] {
  const args = ["stash", "push"];
  const message = options.message?.trim();
  if (message) args.push("-m", message);
  if (options.keepIndex) args.push("--keep-index");
  if (options.includeUntracked) args.push("--include-untracked");
  return args;
}

export interface UnstashOptions {
  /** Drop the stash once applied (`pop`) instead of keeping it (`apply`). */
  pop?: boolean;
  /** Restore staged changes as staged (`--index`). */
  reinstateIndex?: boolean;
}

/** Throws unless `ref` is a `stash@{N}` entry; keeps user input out of option position. */
export function assertStashRef(ref: unknown): asserts ref is string {
  if (typeof ref !== "string" || !/^stash@\{\d+\}$/.test(ref)) {
    throw new Error(`Not a stash entry: ${String(ref)}`);
  }
}

/** Throws for an empty name or one git would read as an option. */
export function assertBranchName(name: unknown): asserts name is string {
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error("Enter a branch name.");
  }
  if (name.startsWith("-")) {
    throw new Error(`"${name}" is not a valid branch name.`);
  }
}

export function buildUnstashArgs(
  stashId: string,
  options: UnstashOptions = {},
): string[] {
  const args = ["stash", options.pop === false ? "apply" : "pop"];
  if (options.reinstateIndex) args.push("--index");
  args.push(stashId);
  return args;
}
