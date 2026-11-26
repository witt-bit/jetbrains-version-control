import * as vscode from "vscode";
import type { SaveChangesPolicy } from "../git/gitSettings";
import {
  type CheckoutRequest,
  checkoutWithRecovery,
  type SmartCheckoutGit,
  type SmartCheckoutPrompts,
  summarizeFiles,
} from "../git/smartCheckout";
import type { MessageRouter } from "../messages/messageRouter";

const SMART = "Smart Checkout";
const FORCE = "Force Checkout";
const DISCARD = "Discard Changes and Checkout";

const vscodePrompts: SmartCheckoutPrompts = {
  async chooseResolution(blockers, target) {
    const choice = await vscode.window.showWarningMessage(
      `Local changes would be overwritten by checking out "${target}".`,
      {
        modal: true,
        detail: `${summarizeFiles(blockers.trackedFiles)}\n\nSmart Checkout saves your local changes, checks out, and applies them again. Force Checkout discards them.`,
      },
      SMART,
      FORCE,
    );
    if (choice === SMART) return "smart";
    if (choice === FORCE) return "force";
    return "cancel";
  },

  async confirmForce(_blockers, target) {
    const choice = await vscode.window.showWarningMessage(
      `Discard all uncommitted changes to tracked files and check out "${target}"?`,
      {
        modal: true,
        detail:
          "Staged and unstaged changes to tracked files are lost and cannot be recovered. Untracked files are kept.",
      },
      DISCARD,
    );
    return choice === DISCARD;
  },

  async reportUntracked(blockers, target) {
    await vscode.window.showErrorMessage(
      `Cannot check out "${target}": untracked files would be overwritten.`,
      {
        modal: true,
        detail: `${summarizeFiles(blockers.untrackedFiles)}\n\nNothing was changed. Move, rename or delete these files, then try again.`,
      },
    );
  },
};

/**
 * Run a checkout with the Smart Checkout recovery dialog. Returns
 * `{ success: false }` when the user backed out or untracked files block it.
 */
export async function runSmartCheckout(
  git: SmartCheckoutGit,
  messageRouter: MessageRouter,
  request: CheckoutRequest,
  policy: SaveChangesPolicy,
): Promise<{ success: boolean }> {
  let changedNothing = false;
  try {
    const outcome = await checkoutWithRecovery(
      git,
      request,
      policy,
      vscodePrompts,
    );
    switch (outcome.kind) {
      case "cancelled":
      case "blocked":
        changedNothing = true;
        return { success: false };
      case "restoreFailed":
        void vscode.window.showWarningMessage(
          `Checked out "${request.target}", but your local changes could not be applied cleanly. ${outcome.message}`,
        );
        return { success: true };
      default:
        return { success: true };
    }
  } finally {
    if (!changedNothing) {
      messageRouter.broadcastEvent("gitStateChanged", { scope: "all" });
    }
  }
}
