import * as vscode from "vscode";
import { filterDeletable } from "../git/branchCleanup.ts";
import { rankUpstreamCandidates } from "../git/branchUpstream.ts";
import type { GitService } from "../git/gitService";
import { currentProtectedBranches } from "../views/pushRecovery";

const MAX_LISTED_IN_CONFIRM = 15;

interface BasePick extends vscode.QuickPickItem {
  /** What `git branch --merged` is measured against. */
  ref: string;
  /** How the base reads in messages. */
  name: string;
}

async function pickBase(service: GitService): Promise<BasePick | undefined> {
  const [branches, current] = await Promise.all([
    service.getBranches(),
    service.getCurrentBranch(),
  ]);
  const items: BasePick[] = [
    {
      label: current ?? "HEAD",
      description: "current branch",
      ref: "HEAD",
      name: current ?? "HEAD",
    },
  ];
  for (const b of branches) {
    if (!b.isRemote && !b.isCurrent) {
      items.push({ label: b.name, ref: `refs/heads/${b.name}`, name: b.name });
    }
  }
  for (const b of branches) {
    if (b.isRemote) {
      items.push({
        label: b.name,
        description: "remote",
        ref: `refs/remotes/${b.name}`,
        name: b.name,
      });
    }
  }
  return vscode.window.showQuickPick(items, {
    title: "Clean Up Merged Branches",
    placeHolder: "Find local branches already merged into…",
    matchOnDescription: true,
  });
}

export interface CleanUpResult {
  success: boolean;
  deleted: string[];
}

/**
 * Find local branches fully merged into a base, let the user pick which to
 * delete, confirm, then delete. Nothing is pre-selected: deleting is the
 * opt-in, not the default.
 *
 * @param base A ref to measure against; asked for when omitted.
 * @param run Wraps the destructive step (the host shows its progress bar).
 */
export async function cleanUpMergedBranches(
  service: GitService,
  base: string | undefined,
  run: <T>(fn: () => Promise<T>) => Promise<T>,
): Promise<CleanUpResult> {
  const nothing: CleanUpResult = { success: false, deleted: [] };

  let ref = "HEAD";
  let baseName = "HEAD";
  if (base) {
    ref = base;
    baseName = base;
  } else {
    const picked = await pickBase(service);
    if (!picked) return nothing;
    ref = picked.ref;
    baseName = picked.name;
  }

  // The same gate the deletion uses, so a branch that cannot be deleted is
  // never offered.
  const protectedPatterns = currentProtectedBranches();
  const candidates = filterDeletable(
    await service.findMergedBranches(ref),
    protectedPatterns,
  );
  if (candidates.length === 0) {
    void vscode.window.showInformationMessage(
      `No local branches are fully merged into ${baseName}.`,
    );
    return { success: true, deleted: [] };
  }

  const picks = await vscode.window.showQuickPick(
    candidates.map((label) => ({ label })),
    {
      title: `Branches merged into ${baseName}`,
      placeHolder: "Select the branches to delete",
      canPickMany: true,
    },
  );
  if (!picks || picks.length === 0) return nothing;
  const chosen = picks.map((p) => p.label);

  const listed = chosen.slice(0, MAX_LISTED_IN_CONFIRM).join("\n");
  const more =
    chosen.length > MAX_LISTED_IN_CONFIRM
      ? `\n…and ${chosen.length - MAX_LISTED_IN_CONFIRM} more`
      : "";
  const confirm = await vscode.window.showWarningMessage(
    `Delete ${chosen.length} merged ${chosen.length === 1 ? "branch" : "branches"}?`,
    {
      modal: true,
      detail: `Fully merged into ${baseName}:\n\n${listed}${more}`,
    },
    "Delete",
  );
  if (confirm !== "Delete") return nothing;

  const result = await run(() =>
    service.deleteMergedBranches(chosen, ref, protectedPatterns),
  );
  const parts = [
    `Deleted ${result.deleted.length} ${result.deleted.length === 1 ? "branch" : "branches"}.`,
  ];
  if (result.skipped.length > 0) {
    parts.push(`${result.skipped.length} not allowed to be deleted.`);
  }
  if (result.failed.length > 0) {
    parts.push(
      `${result.failed.length} failed: ${result.failed
        .map((f) => `${f.branch} (${f.error.trim().split("\n")[0]})`)
        .join("; ")}`,
    );
  }
  const message = parts.join(" ");
  if (result.failed.length > 0 || result.skipped.length > 0) {
    void vscode.window.showWarningMessage(message);
  } else {
    void vscode.window.showInformationMessage(message);
  }
  return { success: true, deleted: result.deleted };
}

/** Ask for a remote branch and make it `branchName`'s upstream. */
export async function promptSetUpstream(
  service: GitService,
  branchName: string,
): Promise<boolean> {
  const [remotes, branches] = await Promise.all([
    service.getRemoteBranches(),
    service.getBranches(),
  ]);
  const current = branches.find(
    (b) => !b.isRemote && b.name === branchName,
  )?.upstream;
  const candidates = rankUpstreamCandidates(branchName, remotes, current);
  if (candidates.length === 0) {
    void vscode.window.showInformationMessage(
      "There are no remote branches to track. Fetch or add a remote first.",
    );
    return false;
  }
  const picked = await vscode.window.showQuickPick(candidates, {
    title: `Set Upstream for ${branchName}`,
    placeHolder: current
      ? `Currently tracking ${current}. Pick a remote branch`
      : "Pick the remote branch to track",
  });
  if (!picked) return false;
  await service.setUpstream(branchName, picked);
  return true;
}
