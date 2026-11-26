import * as vscode from "vscode";
import { formatCommitWarnings } from "../git/commitChecks";
import {
  type CommitSettings,
  parseCommitOption,
  readCommitSettings,
} from "../git/commitSettings";
import type { GitService } from "../git/gitService";
import {
  describeKey,
  type GpgKey,
  isNonOpenPgpFormat,
  keyMatchesConfig,
  usableSigningKeys,
} from "../git/gpg";
import type { PendingSelection } from "../git/pendingCommit";

/** Reads `jgc.commit.*` fresh on every call so setting changes apply without a reload. */
export function currentCommitSettings(): CommitSettings {
  const config = vscode.workspace.getConfiguration("jgc");
  return readCommitSettings((key) => config.get(key));
}

/**
 * Run the enabled pre-commit checks and, when any warn, ask the user.
 * Resolves false when the user backs out. The dialog is modal and awaited
 * here, so the webview request that triggered the commit stays open until
 * the user answers.
 */
export async function confirmCommit(
  service: GitService,
  settings: CommitSettings,
  selection?: PendingSelection,
): Promise<boolean> {
  const warnings = await service.checkCommit(settings, selection);
  if (warnings.length === 0) return true;
  const commitAnyway = "Commit Anyway";
  const choice = await vscode.window.showWarningMessage(
    "Commit anyway?",
    { modal: true, detail: formatCommitWarnings(warnings) },
    commitAnyway,
  );
  return choice === commitAnyway;
}

/**
 * Write one commit option to the settings layer that already holds it
 * (folder, then workspace), else to the user settings.
 */
export async function setCommitOption(
  key: unknown,
  value: unknown,
): Promise<void> {
  const option = parseCommitOption(key, value);
  if (!option) {
    throw new Error(`Invalid commit option: ${String(key)}`);
  }
  const config = vscode.workspace.getConfiguration("jgc.commit");
  const inspected = config.inspect(option.key);
  const target =
    inspected?.workspaceFolderValue !== undefined
      ? vscode.ConfigurationTarget.WorkspaceFolder
      : inspected?.workspaceValue !== undefined
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;
  await config.update(option.key, option.value, target);
}

interface KeyItem extends vscode.QuickPickItem {
  keyId: string | null;
}

function keyItem(key: GpgKey, current: boolean): KeyItem {
  return {
    label: key.keyId,
    description: current ? "current" : undefined,
    detail: key.userIds.join(", ") || undefined,
    keyId: key.keyId,
  };
}

/**
 * Let the user pick a secret key (or "do not sign") and store the choice in
 * this repository's git config. Only key ids and user ids are shown.
 */
export async function chooseGpgKey(service: GitService): Promise<void> {
  const signing = await service.getSigningConfig();
  if (isNonOpenPgpFormat(signing.format)) {
    void vscode.window.showWarningMessage(
      `This repository signs with ${signing.format} (gpg.format). The key chooser only handles OpenPGP keys; set user.signingkey yourself or change gpg.format.`,
    );
    return;
  }

  const keys = usableSigningKeys(await service.listGpgKeys());
  if (keys.length === 0) {
    void vscode.window.showInformationMessage(
      "No usable GPG secret keys were found. Create one with `gpg --full-generate-key`, then try again.",
    );
    return;
  }

  const items: KeyItem[] = [
    {
      label: "Do not sign commits",
      description: signing.enabled ? undefined : "current",
      keyId: null,
    },
    ...keys.map((key) =>
      keyItem(
        key,
        signing.enabled &&
          !!signing.keyId &&
          keyMatchesConfig(key, signing.keyId),
      ),
    ),
  ];
  const picked = await vscode.window.showQuickPick(items, {
    title: "Sign commits with GPG key",
    placeHolder: "Choose the key used to sign commits in this repository",
    matchOnDetail: true,
  });
  if (!picked) return;

  await service.setSigningKey(picked.keyId);
  const chosen = keys.find((k) => k.keyId === picked.keyId);
  void vscode.window.showInformationMessage(
    chosen
      ? `Commits in this repository are now signed with ${describeKey(chosen)}.`
      : "Commit signing is turned off for this repository.",
  );
}

/** Run the chooser from a command or the webview, surfacing failures as notifications. */
export async function runChooseGpgKey(service: GitService): Promise<void> {
  try {
    await chooseGpgKey(service);
  } catch (err) {
    void vscode.window.showErrorMessage(
      `Choose GPG key failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
