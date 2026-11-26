import * as vscode from "vscode";
import type { GitService } from "../git/gitService";
import { describeSubmoduleState, type SubmoduleInfo } from "../git/submodules";
import { openFolder, type RepoCommandContext } from "./repoCommandContext";

const STATE_ICON: Record<SubmoduleInfo["state"], string> = {
  initialized: "$(check)",
  uninitialized: "$(circle-outline)",
  modified: "$(diff-modified)",
  conflict: "$(warning)",
};

interface SubmoduleItem extends vscode.QuickPickItem {
  submodule: SubmoduleInfo;
}

function toItem(submodule: SubmoduleInfo): SubmoduleItem {
  return {
    label: `${STATE_ICON[submodule.state]} ${submodule.path}`,
    description: [describeSubmoduleState(submodule.state), submodule.describe]
      .filter(Boolean)
      .join(" · "),
    detail: submodule.url,
    submodule,
  };
}

/** `rootArg` is only set by the bridge, to act on the repository the panel shows. */
const rootOf = (arg: unknown): string | undefined =>
  typeof arg === "string" ? arg : undefined;

export function registerSubmoduleCommands(
  ctx: RepoCommandContext,
): vscode.Disposable[] {
  async function load(
    service: GitService,
  ): Promise<SubmoduleInfo[] | undefined> {
    try {
      return await service.listSubmodules();
    } catch (err) {
      ctx.reportFailure("Listing submodules", err);
      return undefined;
    }
  }

  async function update(service: GitService, paths: string[] = []) {
    try {
      await ctx.withProgress(
        paths.length > 0
          ? `Updating submodule ${paths.join(", ")}…`
          : "Initializing and updating submodules…",
        () => service.updateSubmodules(paths),
      );
      ctx.onRepositoryChanged();
      return true;
    } catch (err) {
      ctx.reportFailure("Updating submodules", err);
      return false;
    }
  }

  async function sync(service: GitService) {
    try {
      await ctx.withProgress("Syncing submodule URLs…", () =>
        service.syncSubmodules(),
      );
      ctx.onRepositoryChanged();
      void vscode.window.showInformationMessage(
        "JGC: Submodule URLs synced from .gitmodules.",
      );
    } catch (err) {
      ctx.reportFailure("Syncing submodules", err);
    }
  }

  async function open(service: GitService, submodule: SubmoduleInfo) {
    if (submodule.state === "uninitialized") {
      const choice = await vscode.window.showInformationMessage(
        `JGC: ${submodule.path} is not initialized yet.`,
        "Initialize and Open",
      );
      if (choice !== "Initialize and Open") return;
      if (!(await update(service, [submodule.path]))) return;
    }
    await openFolder(submodule.absolutePath, true);
  }

  async function pickSubmodule(
    service: GitService,
    title: string,
  ): Promise<SubmoduleInfo | undefined> {
    const list = await load(service);
    if (!list) return undefined;
    if (list.length === 0) {
      void vscode.window.showInformationMessage(
        "JGC: This repository has no submodules.",
      );
      return undefined;
    }
    const picked = await vscode.window.showQuickPick(list.map(toItem), {
      title,
      placeHolder: "Submodule",
    });
    return picked?.submodule;
  }

  /** The list is the hub: pick to open, the title buttons act on all of them. */
  async function showList(rootArg?: unknown) {
    const service = await ctx.chooseRepository(rootOf(rootArg));
    if (!service) return;
    const list = await load(service);
    if (!list) return;
    if (list.length === 0) {
      void vscode.window.showInformationMessage(
        "JGC: This repository has no submodules.",
      );
      return;
    }

    const quickPick = vscode.window.createQuickPick<SubmoduleItem>();
    quickPick.title = "Submodules";
    quickPick.placeholder = "Select a submodule to open it in a new window";
    quickPick.items = list.map(toItem);
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    const updateButton: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon("cloud-download"),
      tooltip: "Initialize and update all submodules",
    };
    const syncButton: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon("sync"),
      tooltip: "Sync submodule URLs from .gitmodules",
    };
    quickPick.buttons = [updateButton, syncButton];

    quickPick.onDidTriggerButton((button) => {
      quickPick.hide();
      if (button === updateButton) void update(service);
      else if (button === syncButton) void sync(service);
    });
    quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0]?.submodule;
      quickPick.hide();
      if (selected) void open(service, selected);
    });
    quickPick.onDidHide(() => quickPick.dispose());
    quickPick.show();
  }

  return [
    vscode.commands.registerCommand("git-brains.submodules.list", showList),

    vscode.commands.registerCommand(
      "git-brains.submodules.update",
      async (rootArg?: unknown) => {
        const service = await ctx.chooseRepository(rootOf(rootArg));
        if (!service) return;
        if (await update(service)) {
          void vscode.window.showInformationMessage(
            "JGC: Submodules are initialized and up to date.",
          );
        }
      },
    ),

    vscode.commands.registerCommand(
      "git-brains.submodules.sync",
      async (rootArg?: unknown) => {
        const service = await ctx.chooseRepository(rootOf(rootArg));
        if (service) await sync(service);
      },
    ),

    vscode.commands.registerCommand(
      "git-brains.submodules.open",
      async (rootArg?: unknown) => {
        const service = await ctx.chooseRepository(rootOf(rootArg));
        if (!service) return;
        const submodule = await pickSubmodule(service, "Open Submodule");
        if (submodule) await open(service, submodule);
      },
    ),
  ];
}
