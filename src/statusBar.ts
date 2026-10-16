import * as path from "node:path";
import * as vscode from "vscode";
import type { RepoEntry } from "./decorations/gutterMarkers";
import type { GitService } from "./git/gitService";

const UPDATE_ITEM = "update";

/** Surface a failed menu action instead of letting the promise reject unseen. */
function logFailure(label: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (/index\.lock/.test(message)) {
    void vscode.window.showErrorMessage(
      `JGC: ${label} failed. Another Git process may hold .git/index.lock, or the lock is stale — remove it and retry.`,
      "Retry",
    );
    return;
  }
  void vscode.window.showErrorMessage(`JGC: ${label} failed: ${message}`);
}

const COMMIT_ITEM = "commit";
const PUSH_ITEM = "push";
const NEW_BRANCH_ITEM = "newBranch";
const SWITCH_ITEM = "switch";
const LOG_ITEM = "log";

/**
 * The status bar branch indicator that replaces VS Code's built-in Git one:
 * always shows the branch of the repository the current editor belongs to,
 * together with the incoming/outgoing counts, and opens the Git actions menu
 * on click.
 */
export class StatusBarController implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly menuDisposable: vscode.Disposable;
  private repos: RepoEntry[] = [];
  private current: RepoEntry | undefined;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.item.command = "git-brains.status.menu";
    this.menuDisposable = vscode.commands.registerCommand(
      "git-brains.status.menu",
      () => this.showMenu(),
    );
  }

  setRepos(repos: RepoEntry[]): void {
    this.repos = repos;
  }

  async refresh(): Promise<void> {
    const repo = this.resolveRepo();
    this.current = repo;
    if (!repo) {
      this.item.hide();
      return;
    }

    const branch = await repo.service.getCurrentBranch();
    if (!branch) {
      // No branch name means either a detached HEAD or a repository without
      // commits. IDEA shows the detached state rather than hiding the item, and
      // a hidden item would leave the user with no way back.
      const detached = await repo.service.headCommit().catch(() => null);
      if (!detached) {
        this.item.hide();
        return;
      }
      this.item.text = "$(git-commit) detached HEAD";
      this.item.tooltip = new vscode.MarkdownString(
        `**JetBrains Git Control**\n\nDetached HEAD at \`${detached.slice(
          0,
          7,
        )}\`\n\nClick for Git actions`,
      );
      this.item.show();
      return;
    }

    let ahead = 0;
    let behind = 0;
    try {
      const branches = await repo.service.getBranches();
      const current = branches.find((entry) => entry.isCurrent);
      ahead = current?.ahead ?? 0;
      behind = current?.behind ?? 0;
    } catch {
      // Counts are informational only; the branch name still shows.
    }

    let text = `$(git-branch) ${branch}`;
    if (ahead > 0) text += ` ↑${ahead}`;
    if (behind > 0) text += ` ↓${behind}`;

    this.item.text = text;
    const counts = [
      ahead > 0 ? `${ahead} to push` : "",
      behind > 0 ? `${behind} to pull` : "",
    ].filter(Boolean);
    this.item.tooltip = new vscode.MarkdownString(
      `**JetBrains Git Control**\n\nBranch \`${branch}\`${
        counts.length ? ` — ${counts.join(", ")}` : ""
      }\n\nClick for Git actions`,
    );
    this.item.show();
  }

  /** Repo of the active editor, else the first repository available. */
  private resolveRepo(): RepoEntry | undefined {
    const uri = vscode.window.activeTextEditor?.document.uri;
    if (uri) {
      let best: RepoEntry | undefined;
      for (const repo of this.repos) {
        const prefix = repo.root.endsWith(path.sep)
          ? repo.root
          : repo.root + path.sep;
        if (
          uri.fsPath.startsWith(prefix) &&
          (!best || repo.root.length > best.root.length)
        ) {
          best = repo;
        }
      }
      if (best) return best;
    }
    return this.repos[0];
  }

  private async showMenu(): Promise<void> {
    if (!this.current) {
      await this.refresh();
    }
    const repo = this.current;
    if (!repo) return;

    const branch = (await repo.service.getCurrentBranch()) ?? "detached HEAD";
    const pick = vscode.window.createQuickPick();
    pick.title = `JetBrains Git Control — ${branch}`;
    pick.placeholder = "Select a Git action";

    type Item = vscode.QuickPickItem & { id: string };
    const items: Item[] = [
      {
        id: UPDATE_ITEM,
        label: "$(sync) Update Project",
        description: "fetch + pull",
      },
      {
        id: COMMIT_ITEM,
        label: "$(check) Commit…",
        description: "Open the Commit panel",
      },
      {
        id: PUSH_ITEM,
        label: "$(cloud-upload) Push…",
        description: "Open the Push panel",
      },
      { id: NEW_BRANCH_ITEM, label: "$(add) New Branch…" },
      { id: SWITCH_ITEM, label: "$(git-branch) Switch Branch…" },
      {
        id: LOG_ITEM,
        label: "$(git-commit) Git Log",
        description: "Open the Git Log view",
      },
    ];
    pick.items = items;

    pick.onDidAccept(() => {
      const selected = pick.selectedItems[0] as Item | undefined;
      pick.hide();
      if (!selected) return;
      // Event handlers outside our control: never let a rejection escape.
      this.runAction(selected.id).catch((error: unknown) => {
        logFailure(selected.label, error);
      });
    });
    pick.onDidHide(() => pick.dispose());
    pick.show();
  }

  private async runAction(id: string): Promise<void> {
    const repo = this.current;
    if (!repo) return;
    const service: GitService = repo.service;

    switch (id) {
      case UPDATE_ITEM:
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Window,
            title: "Updating project…",
          },
          async () => {
            await service.fetch();
            await service.pull();
          },
        );
        break;
      case COMMIT_ITEM:
        await vscode.commands.executeCommand("git-brains.commitPanel.focus");
        break;
      case PUSH_ITEM:
        await vscode.commands.executeCommand("git-brains.openPushPanel");
        break;
      case NEW_BRANCH_ITEM:
        await this.newBranch(service);
        break;
      case SWITCH_ITEM:
        await this.switchBranch(service);
        break;
      case LOG_ITEM:
        await vscode.commands.executeCommand("git-brains.gitLog.focus");
        break;
    }
    await this.refresh();
  }

  private async newBranch(service: GitService): Promise<void> {
    const name = await vscode.window.showInputBox({
      prompt: "New branch name",
      ignoreFocusOut: true,
      validateInput: (value) =>
        value.trim() ? undefined : "Branch name cannot be empty",
    });
    if (!name) return;
    const trimmed = name.trim();
    try {
      await service.createBranch(trimmed, "HEAD");
      await service.checkout(trimmed);
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Could not create branch: ${(error as Error).message}`,
      );
    }
  }

  private async switchBranch(service: GitService): Promise<void> {
    let branches: Awaited<ReturnType<GitService["getBranches"]>> = [];
    try {
      branches = await service.getBranches();
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Could not list branches: ${(error as Error).message}`,
      );
      return;
    }

    const local = branches.filter((entry) => !entry.isRemote);
    const remote = branches.filter((entry) => entry.isRemote);

    type BranchItem = vscode.QuickPickItem & { id: string };
    const pick = vscode.window.createQuickPick<BranchItem>();
    pick.title = "Switch Branch";
    pick.placeholder = "Type to filter branches";
    pick.matchOnDescription = true;
    pick.items = [...local, ...remote].map((branch) => ({
      label: branch.isCurrent ? `$(check) ${branch.name}` : branch.name,
      description: branch.isCurrent
        ? "current"
        : branch.isRemote
          ? "remote — checking out detaches HEAD"
          : branch.ahead > 0
            ? `↑${branch.ahead}`
            : "",
      id: branch.name,
    }));
    // The current branch is offered for orientation only: selecting it is a
    // no-op, so accepting it does nothing.
    const currentName = branches.find((entry) => entry.isCurrent)?.name;
    pick.onDidAccept(async () => {
      const selected = pick.selectedItems[0];
      pick.hide();
      if (!selected || selected.id === currentName) return;
      if (selected.description?.startsWith("remote")) {
        const answer = await vscode.window.showWarningMessage(
          `Checking out ${selected.id} leaves you on a detached HEAD.`,
          "Checkout",
          "Cancel",
        );
        if (answer !== "Checkout") return;
      }
      try {
        await service.checkout(selected.id);
      } catch (error) {
        void vscode.window.showErrorMessage(
          `Could not switch branch: ${(error as Error).message}`,
        );
      }
    });
    pick.onDidHide(() => pick.dispose());
    pick.show();
  }

  dispose(): void {
    this.item.dispose();
    this.menuDisposable.dispose();
  }
}
