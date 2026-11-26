/**
 * Smart checkout: recover when git refuses to switch because local changes
 * (or untracked files) are in the way.
 *
 * Free of the `vscode` module so the classification and the flow can be
 * tested against real repositories. The extension host supplies the prompts.
 */
import type { SaveChangesPolicy } from "./gitSettings.ts";
import { unquoteGitPath } from "./pathUtils.ts";

/** Files git named when it refused to switch. */
export interface CheckoutBlockers {
  /** Tracked files with local changes that the checkout would overwrite. */
  trackedFiles: string[];
  /** Untracked files the checkout would overwrite. */
  untrackedFiles: string[];
}

const TRACKED_HEADER = /would be overwritten by checkout:\s*$/;
const UNTRACKED_HEADER =
  /untracked working tree files? would be overwritten by checkout:\s*$/;
const TRACKED_FOOTER =
  /Please commit your changes or stash them before you switch branches/;

/**
 * Read git's "would be overwritten by checkout" report.
 *
 * Git prints a header line, the files indented by a tab, then advice. A
 * checkout can trip over both kinds at once and then prints both blocks.
 * Returns null for any other failure, so callers rethrow the original error.
 */
export function parseCheckoutBlockers(output: string): CheckoutBlockers | null {
  const tracked = new Set<string>();
  const untracked = new Set<string>();
  let sawBlocker = false;
  let current: Set<string> | null = null;

  for (const line of output.split(/\r?\n/)) {
    if (UNTRACKED_HEADER.test(line)) {
      sawBlocker = true;
      current = untracked;
    } else if (TRACKED_HEADER.test(line)) {
      sawBlocker = true;
      current = tracked;
    } else if (line.startsWith("\t") && current) {
      const file = unquoteGitPath(line.slice(1).trim());
      if (file) current.add(file);
    } else {
      current = null;
      if (TRACKED_FOOTER.test(line)) sawBlocker = true;
    }
  }

  if (!sawBlocker) return null;
  return { trackedFiles: [...tracked], untrackedFiles: [...untracked] };
}

/** Same as `parseCheckoutBlockers`, for the error `execFile` throws. */
export function classifyCheckoutFailure(err: unknown): CheckoutBlockers | null {
  const parts: string[] = [];
  if (err && typeof err === "object") {
    const { stderr, message } = err as { stderr?: unknown; message?: unknown };
    if (typeof stderr === "string") parts.push(stderr);
    if (typeof message === "string") parts.push(message);
  } else if (typeof err === "string") {
    parts.push(err);
  }
  return parseCheckoutBlockers(parts.join("\n"));
}

/** `a.txt`, `b.txt` and N more, for a dialog. */
export function summarizeFiles(files: string[], limit = 8): string {
  if (files.length <= limit) return files.join("\n");
  const rest = files.length - limit;
  return `${files.slice(0, limit).join("\n")}\n…and ${rest} more`;
}

export type SmartCheckoutChoice = "smart" | "force" | "cancel";

export interface SmartCheckoutPrompts {
  /** Tracked local changes block the checkout: smart, force or give up. */
  chooseResolution(
    blockers: CheckoutBlockers,
    target: string,
  ): Promise<SmartCheckoutChoice>;
  /** Last word before local changes are discarded. */
  confirmForce(blockers: CheckoutBlockers, target: string): Promise<boolean>;
  /** Untracked files block the checkout; there is no safe automatic way out. */
  reportUntracked(blockers: CheckoutBlockers, target: string): Promise<void>;
}

/** The slice of `GitService` the flow needs. */
export interface SmartCheckoutGit {
  withSavedChanges<T>(
    policy: SaveChangesPolicy,
    label: string,
    operation: () => Promise<T>,
  ): Promise<T>;
}

export interface CheckoutRequest {
  /** Shown in prompts and in the label of the saved changes. */
  target: string;
  /** The ordinary checkout (may include follow-up steps such as a rebase). */
  checkout(): Promise<void>;
  /** The same operation with local changes discarded (`checkout -f`). */
  forceCheckout(): Promise<void>;
}

export type SmartCheckoutOutcome =
  | { kind: "done"; mode: "plain" | "smart" | "force" }
  | { kind: "cancelled" }
  /** Untracked files are in the way. Nothing was changed. */
  | { kind: "blocked"; files: string[] }
  /** The checkout happened but the saved changes did not go back cleanly. */
  | { kind: "restoreFailed"; message: string };

/**
 * Run the checkout; if git refuses because of local changes, ask what to do.
 *
 * - Smart saves tracked changes, checks out, and restores them. A restore
 *   that conflicts leaves the changes saved (`withSavedChanges` says where).
 * - Force discards tracked changes, after a second confirmation.
 * - Untracked files in the way are never saved or overwritten: the checkout
 *   stays refused and the user is told which files to move.
 *
 * Failures that are not "local changes would be overwritten" are rethrown.
 */
export async function checkoutWithRecovery(
  git: SmartCheckoutGit,
  request: CheckoutRequest,
  policy: SaveChangesPolicy,
  prompts: SmartCheckoutPrompts,
): Promise<SmartCheckoutOutcome> {
  try {
    await request.checkout();
    return { kind: "done", mode: "plain" };
  } catch (err) {
    const blockers = classifyCheckoutFailure(err);
    if (!blockers) throw err;

    if (blockers.untrackedFiles.length > 0) {
      await prompts.reportUntracked(blockers, request.target);
      return { kind: "blocked", files: blockers.untrackedFiles };
    }

    const choice = await prompts.chooseResolution(blockers, request.target);
    if (choice === "cancel") return { kind: "cancelled" };

    if (choice === "force") {
      if (!(await prompts.confirmForce(blockers, request.target))) {
        return { kind: "cancelled" };
      }
      await request.forceCheckout();
      return { kind: "done", mode: "force" };
    }

    let switched = false;
    try {
      await git.withSavedChanges(
        policy,
        `Checkout ${request.target}`,
        async () => {
          await request.checkout();
          switched = true;
        },
      );
      return { kind: "done", mode: "smart" };
    } catch (smartErr) {
      if (!switched) throw smartErr;
      const message =
        smartErr instanceof Error ? smartErr.message : String(smartErr);
      return { kind: "restoreFailed", message };
    }
  }
}
