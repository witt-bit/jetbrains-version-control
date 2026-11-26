import * as path from "node:path";
import * as vscode from "vscode";
import { gitFailureMessage } from "../git/cloneRepo";
import type { GitService } from "../git/gitService";
import { detectRepository } from "../git/initRepo";

/** What the repository-operation commands share: which repo to act on, and how to say it failed. */
export interface RepoCommandContext {
  extensionContext: vscode.ExtensionContext;
  /** One service per workspace folder, repository or not. */
  services: GitService[];
  /** Drop caches and tell panels, the status bar and decorations to reload. */
  onRepositoryChanged: () => void;
  /**
   * The repository a command should act on, or undefined (after telling the
   * user why) when there is none or they dismissed the picker. `root` pins a
   * specific one, e.g. what the Git Log panel is showing.
   */
  chooseRepository(root?: string): Promise<GitService | undefined>;
  reportFailure(what: string, err: unknown): void;
  withProgress<T>(title: string, task: () => Promise<T>): Promise<T>;
}

export interface RepoCommandContextDeps {
  extensionContext: vscode.ExtensionContext;
  services: GitService[];
  onRepositoryChanged: () => void;
}

export function createRepoCommandContext(
  deps: RepoCommandContextDeps,
): RepoCommandContext {
  const { services } = deps;

  async function repositoryServices(): Promise<GitService[]> {
    const checked = await Promise.all(
      services.map(async (service) =>
        (await detectRepository(service.root).catch(() => "none")) ===
        "repository"
          ? service
          : undefined,
      ),
    );
    return checked.filter((s): s is GitService => s !== undefined);
  }

  async function explainNoRepository(): Promise<void> {
    const create = "Create Git Repository…";
    const clone = "Clone Repository…";
    const actions = services.length > 0 ? [create, clone] : [clone];
    const choice = await vscode.window.showInformationMessage(
      "JGC: This workspace has no Git repository.",
      ...actions,
    );
    if (choice === create) {
      await vscode.commands.executeCommand("git-brains.repo.init");
    } else if (choice === clone) {
      await vscode.commands.executeCommand("git-brains.repo.clone");
    }
  }

  return {
    extensionContext: deps.extensionContext,
    services,
    onRepositoryChanged: deps.onRepositoryChanged,

    async chooseRepository(root) {
      const repos = await repositoryServices();
      if (repos.length === 0) {
        await explainNoRepository();
        return undefined;
      }
      const pinned = root ? repos.find((s) => s.root === root) : undefined;
      if (pinned) return pinned;
      if (repos.length === 1) return repos[0];

      const active = vscode.window.activeTextEditor?.document.uri;
      if (active?.scheme === "file") {
        const folder = vscode.workspace.getWorkspaceFolder(active);
        const hit = repos.find((s) => s.root === folder?.uri.fsPath);
        if (hit) return hit;
      }
      const picked = await vscode.window.showQuickPick(
        repos.map((service) => ({
          label: path.basename(service.root),
          description: service.root,
          service,
        })),
        { title: "Choose a repository", placeHolder: "Repository" },
      );
      return picked?.service;
    },

    reportFailure(what, err) {
      void vscode.window.showErrorMessage(
        `JGC: ${what} failed: ${gitFailureMessage(err)}`,
      );
    },

    withProgress(title, task) {
      return Promise.resolve(
        vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title },
          task,
        ),
      );
    },
  };
}

/** Open a folder in this window or a new one. */
export async function openFolder(
  directory: string,
  forceNewWindow: boolean,
): Promise<void> {
  await vscode.commands.executeCommand(
    "vscode.openFolder",
    vscode.Uri.file(directory),
    { forceNewWindow },
  );
}
