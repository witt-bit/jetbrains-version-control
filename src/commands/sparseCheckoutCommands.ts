import * as vscode from "vscode";
import type { GitService } from "../git/gitService";
import {
  parseSparseDirectoryInput,
  type SparseCheckoutStatus,
  sparseDirectoryInputProblem,
} from "../git/sparseCheckout";
import type { RepoCommandContext } from "./repoCommandContext";

const rootOf = (arg: unknown): string | undefined =>
  typeof arg === "string" ? arg : undefined;

type Action = "enable" | "set" | "add" | "disable";

interface ActionItem extends vscode.QuickPickItem {
  action?: Action;
}

export function registerSparseCheckoutCommands(
  ctx: RepoCommandContext,
): vscode.Disposable[] {
  async function readStatus(
    service: GitService,
  ): Promise<SparseCheckoutStatus | undefined> {
    try {
      return await service.getSparseCheckout();
    } catch (err) {
      ctx.reportFailure("Reading sparse checkout", err);
      return undefined;
    }
  }

  /** Run a working-tree-changing operation and refresh everything that shows it. */
  async function apply(title: string, what: string, task: () => Promise<void>) {
    try {
      await ctx.withProgress(title, task);
      ctx.onRepositoryChanged();
      return true;
    } catch (err) {
      ctx.reportFailure(what, err);
      return false;
    }
  }

  async function askDirectories(
    title: string,
    prompt: string,
    value: string,
    requireOne: boolean,
  ): Promise<string[] | undefined> {
    const text = await vscode.window.showInputBox({
      title,
      prompt,
      value,
      placeHolder: "docs, src/app",
      ignoreFocusOut: true,
      validateInput: (input) =>
        sparseDirectoryInputProblem(input) ??
        (requireOne && parseSparseDirectoryInput(input).length === 0
          ? "Enter at least one directory"
          : undefined),
    });
    return text === undefined ? undefined : parseSparseDirectoryInput(text);
  }

  /** Cone mode only understands directories; going there drops hand-written patterns. */
  async function confirmConeSwitch(
    status: SparseCheckoutStatus,
  ): Promise<boolean> {
    if (!status.enabled || status.cone) return true;
    const choice = await vscode.window.showWarningMessage(
      "This repository uses non-cone sparse-checkout patterns. Switching to cone mode replaces them with a directory list.",
      { modal: true },
      "Switch to Cone Mode",
    );
    return choice === "Switch to Cone Mode";
  }

  const PROMPT =
    "Directories to check out, comma-separated, relative to the repository root";

  async function enable(rootArg?: unknown) {
    const service = await ctx.chooseRepository(rootOf(rootArg));
    if (!service) return;
    const status = await readStatus(service);
    if (!status) return;
    if (status.enabled && status.cone) {
      void vscode.window.showInformationMessage(
        "JGC: Sparse checkout is already enabled. Use “Set Directories” to change them.",
      );
      return;
    }
    if (!(await confirmConeSwitch(status))) return;
    const dirs = await askDirectories(
      "Enable Sparse Checkout",
      `${PROMPT}. Root-level files are always kept; leave empty to keep only those.`,
      "",
      false,
    );
    if (!dirs) return;
    await apply("Enabling sparse checkout…", "Enabling sparse checkout", () =>
      service.setSparseCheckout(dirs),
    );
  }

  async function set(rootArg?: unknown) {
    const service = await ctx.chooseRepository(rootOf(rootArg));
    if (!service) return;
    const status = await readStatus(service);
    if (!status) return;
    if (!(await confirmConeSwitch(status))) return;
    const dirs = await askDirectories(
      "Set Sparse Checkout Directories",
      PROMPT,
      status.enabled && status.cone ? status.entries.join(", ") : "",
      false,
    );
    if (!dirs) return;
    await apply(
      "Updating sparse checkout…",
      "Setting sparse checkout directories",
      () => service.setSparseCheckout(dirs),
    );
  }

  async function add(rootArg?: unknown) {
    const service = await ctx.chooseRepository(rootOf(rootArg));
    if (!service) return;
    const status = await readStatus(service);
    if (!status) return;
    if (!status.enabled) {
      void vscode.window.showInformationMessage(
        "JGC: Sparse checkout is not enabled. Use “Enable Sparse Checkout” first.",
      );
      return;
    }
    const dirs = await askDirectories(
      "Add Sparse Checkout Directories",
      "Directories to add, comma-separated, relative to the repository root",
      "",
      true,
    );
    if (!dirs) return;
    await apply(
      "Updating sparse checkout…",
      "Adding sparse checkout directories",
      () => service.addSparseCheckout(dirs),
    );
  }

  async function disable(rootArg?: unknown) {
    const service = await ctx.chooseRepository(rootOf(rootArg));
    if (!service) return;
    const status = await readStatus(service);
    if (!status) return;
    if (!status.enabled) {
      void vscode.window.showInformationMessage(
        "JGC: Sparse checkout is not enabled in this repository.",
      );
      return;
    }
    if (
      await apply(
        "Restoring the full working tree…",
        "Disabling sparse checkout",
        () => service.disableSparseCheckout(),
      )
    ) {
      void vscode.window.showInformationMessage(
        "JGC: Sparse checkout disabled; every file is checked out again.",
      );
    }
  }

  const runners: Record<Action, (rootArg?: unknown) => Promise<void>> = {
    enable,
    set,
    add,
    disable,
  };

  async function showStatus(rootArg?: unknown) {
    const service = await ctx.chooseRepository(rootOf(rootArg));
    if (!service) return;
    const status = await readStatus(service);
    if (!status) return;

    const items: ActionItem[] = status.enabled
      ? [
          {
            label: "Checked out",
            kind: vscode.QuickPickItemKind.Separator,
          },
          {
            label:
              status.entries.length > 0
                ? status.entries.join(", ")
                : "Root-level files only",
            description: status.cone ? "cone mode" : "non-cone patterns",
          },
          { label: "Actions", kind: vscode.QuickPickItemKind.Separator },
          { label: "$(edit) Set Directories…", action: "set" },
          { label: "$(add) Add Directories…", action: "add" },
          {
            label: "$(discard) Disable",
            detail: "Restore the full working tree",
            action: "disable",
          },
        ]
      : [
          {
            label: "$(check) Enable Sparse Checkout…",
            detail: "Check out only the directories you choose (cone mode)",
            action: "enable",
          },
        ];

    const picked = await vscode.window.showQuickPick(items, {
      title: status.enabled
        ? "Sparse checkout: enabled"
        : "Sparse checkout: disabled",
      placeHolder: "Choose an action",
    });
    if (picked?.action) await runners[picked.action](service.root);
  }

  return [
    vscode.commands.registerCommand(
      "git-brains.sparseCheckout.status",
      showStatus,
    ),
    vscode.commands.registerCommand("git-brains.sparseCheckout.enable", enable),
    vscode.commands.registerCommand("git-brains.sparseCheckout.set", set),
    vscode.commands.registerCommand("git-brains.sparseCheckout.add", add),
    vscode.commands.registerCommand(
      "git-brains.sparseCheckout.disable",
      disable,
    ),
  ];
}
