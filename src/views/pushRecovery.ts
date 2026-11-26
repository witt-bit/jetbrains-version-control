import * as vscode from "vscode";
import type { GitService } from "../git/gitService";
import { readGitSettings } from "../git/gitSettings";
import { isProtectedBranch } from "../git/protectedBranches";
import {
  type PushFlowHooks,
  type PushFlowResult,
  type PushFlowSettings,
  type PushRequest,
  pushWithRecovery,
  type RejectedDecision,
  type RejectedPrompt,
} from "../git/pushFlow";
import { readPushSettings } from "../git/pushSettings";

/** Reads `jgc.*` fresh on every call so setting changes apply without a reload. */
export function currentPushFlowSettings(): PushFlowSettings {
  const config = vscode.workspace.getConfiguration("jgc");
  const read = (key: string) => config.get(key);
  return {
    ...readPushSettings(read),
    saveChangesPolicy: readGitSettings(read).saveChangesPolicy,
  };
}

export function currentProtectedBranches(): string[] {
  return currentPushFlowSettings().protectedBranches;
}

/** Force with lease still overwrites what the user has already fetched, so it gets its own confirmation. */
async function confirmForceWithLease(target: string): Promise<boolean> {
  const label = "Force Push with Lease";
  const picked = await vscode.window.showWarningMessage(
    `Force push to ${target}?`,
    {
      modal: true,
      detail:
        "The remote commits you have not integrated will be overwritten. The push is still refused if the remote changed since your last fetch.",
    },
    label,
  );
  return picked === label;
}

type PromptItem = vscode.QuickPickItem & { decision?: RejectedDecision };

async function promptRejectedPush(
  prompt: RejectedPrompt,
): Promise<RejectedDecision> {
  const { request, canIntegrate } = prompt;
  const target = `${request.remote}/${request.targetBranch}`;
  const forceAllowed = !isProtectedBranch(
    request.targetBranch,
    currentProtectedBranches(),
  );
  const items: PromptItem[] = [];
  if (canIntegrate) {
    items.push(
      {
        label: "Merge",
        description: `Merge ${target} into ${request.branchName}, then push again`,
        decision: { action: "merge" },
      },
      {
        label: "Rebase",
        description: `Rebase ${request.branchName} onto ${target}, then push again`,
        decision: { action: "rebase" },
      },
    );
  }
  if (forceAllowed) {
    items.push({
      label: "Force push with lease",
      description: "Overwrite the remote branch",
      detail: "Refused if the remote changed since your last fetch.",
      decision: { action: "forceWithLease" },
    });
  }
  if (canIntegrate) {
    items.push(
      { label: "", kind: vscode.QuickPickItemKind.Separator },
      {
        label: "Always merge",
        description: "Merge automatically after a rejected push",
        decision: { action: "merge", remember: true },
      },
      {
        label: "Always rebase",
        description: "Rebase automatically after a rejected push",
        decision: { action: "rebase", remember: true },
      },
    );
  }
  items.push(
    { label: "", kind: vscode.QuickPickItemKind.Separator },
    { label: "Cancel", decision: { action: "cancel" } },
  );

  const picked = await vscode.window.showQuickPick(items, {
    title: `Push rejected: ${target} has commits you do not have`,
    placeHolder: canIntegrate
      ? "Integrate the remote changes first, or overwrite the remote branch"
      : request.refspecSource
        ? "Merging or rebasing cannot fix a push of selected commits"
        : `"${request.branchName}" is not the checked-out branch, so the remote changes cannot be merged or rebased here`,
    ignoreFocusOut: true,
  });
  const decision = picked?.decision ?? { action: "cancel" as const };
  if (decision.action === "forceWithLease") {
    return (await confirmForceWithLease(target))
      ? decision
      : { action: "cancel" };
  }
  return decision;
}

/** Persist "always merge" / "always rebase"; the push carries on if the write fails. */
export async function rememberRejectedAction(
  action: "merge" | "rebase",
): Promise<void> {
  try {
    await vscode.workspace
      .getConfiguration("jgc")
      .update("push.rejectedAction", action, vscode.ConfigurationTarget.Global);
    vscode.window.setStatusBarMessage(
      `A rejected push will now ${action} automatically (setting jgc.push.rejectedAction).`,
      6000,
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    void vscode.window.showWarningMessage(
      `Could not remember the ${action} choice: ${detail}`,
    );
  }
}

const hostHooks: PushFlowHooks = {
  chooseRejectedAction: promptRejectedPush,
  rememberRejectedAction,
};

function announce(request: PushRequest, result: PushFlowResult): void {
  if (result.status !== "pushed") return;
  const target = `${request.remote}/${request.targetBranch}`;
  if (result.integrated) {
    const verb = result.integrated === "merge" ? "Merged" : "Rebased";
    void vscode.window.showInformationMessage(
      `${verb} and pushed to ${target}`,
    );
  } else if (result.forced) {
    void vscode.window.showInformationMessage(
      `Force pushed (with lease) to ${target}`,
    );
  } else if (result.setUpstream) {
    vscode.window.setStatusBarMessage(
      `Pushed ${request.branchName} and set upstream to ${target}`,
      5000,
    );
  }
}

/** Push from a host-side entry point: a rejected push is resolved with a quick pick. */
export async function pushWithPrompts(
  git: GitService,
  request: PushRequest,
): Promise<PushFlowResult> {
  const result = await pushWithRecovery(
    git,
    request,
    currentPushFlowSettings(),
    { hooks: hostHooks },
  );
  announce(request, result);
  return result;
}

/** Ask before deleting a protected branch. Resolves to true when the user confirms. */
export async function confirmProtectedBranchDelete(
  branchName: string,
  remote: boolean,
): Promise<boolean> {
  const label = "Delete";
  const picked = await vscode.window.showWarningMessage(
    remote
      ? `"${branchName}" is a protected remote branch. Delete it anyway?`
      : `"${branchName}" is a protected branch. Delete it anyway?`,
    {
      modal: true,
      detail:
        'Protected branches are listed in the "jgc.protectedBranches" setting.',
    },
    label,
  );
  return picked === label;
}
