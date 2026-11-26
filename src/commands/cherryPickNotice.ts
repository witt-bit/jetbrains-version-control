import * as vscode from "vscode";
import {
  type CherryPickOptions,
  type CherryPickOutcome,
  describeCherryPickOutcome,
  parseCherryPickOptions,
} from "../git/cherryPick";

export type PausedCherryPickChoice = "skip" | "continue";

const SKIP = "Skip";
const CREATE_EMPTY = "Create Empty Commit";

/** Reads `jgc.cherryPick.*` fresh on every call so changes apply without a reload. */
export function readCherryPickOptions(): CherryPickOptions {
  const config = vscode.workspace.getConfiguration("jgc.cherryPick");
  return parseCherryPickOptions((key) => config.get(key));
}

/**
 * Tell the user how an empty cherry-pick was settled, naming the strategy.
 * Under `ask` the pick is still in progress, so the notice carries the two
 * ways out; dismissing it leaves the pick paused, as plain git does.
 * Never blocks the caller.
 */
export function announceCherryPick(
  outcome: CherryPickOutcome,
  shortHash: string,
  resolvePaused: (choice: PausedCherryPickChoice) => Promise<void>,
): void {
  const message = describeCherryPickOutcome(outcome, shortHash);
  if (!message) return;

  if (outcome !== "pausedEmpty") {
    void vscode.window.showInformationMessage(message);
    return;
  }

  void vscode.window
    .showWarningMessage(message, SKIP, CREATE_EMPTY)
    .then(async (picked) => {
      if (picked === undefined) return;
      try {
        await resolvePaused(picked === SKIP ? "skip" : "continue");
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Cherry-pick failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
}
