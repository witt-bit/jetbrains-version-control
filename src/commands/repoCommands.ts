import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  CloneCancelledError,
  CloneError,
  cloneNameProblem,
  cloneRepository,
  cloneTargetProblem,
  cloneUrlProblem,
  redactUrlCredentials,
  repoNameFromUrl,
} from "../git/cloneRepo";
import type { GitService } from "../git/gitService";
import {
  branchNameProblem,
  defaultInitialBranch,
  detectRepository,
  initRepository,
} from "../git/initRepo";
import type { MessageRouter } from "../messages/messageRouter";
import {
  createRepoCommandContext,
  openFolder,
  type RepoCommandContext,
} from "./repoCommandContext";
import { registerSparseCheckoutCommands } from "./sparseCheckoutCommands";
import { registerSubmoduleCommands } from "./submoduleCommands";

const LAST_CLONE_PARENT_KEY = "jgc.clone.lastParentDirectory";

export interface RepoCommandsDeps {
  context: vscode.ExtensionContext;
  messageRouter: MessageRouter;
  /** One service per workspace folder, repository or not. */
  services: GitService[];
  /** Drop caches and make panels, the status bar and decorations reload. */
  onRepositoryChanged: () => void;
}

/** `rootArg` is only set by the bridge, to act on the repository the panel shows. */
const rootOf = (arg: unknown): string | undefined =>
  typeof arg === "string" ? arg : undefined;

/**
 * Repository-level operations that work on (or without) a whole repository:
 * Clone, Init, submodules, sparse checkout and shallow history. Everything
 * Git-facing lives in `src/git/*`; this file is the VS Code side.
 */
export function registerRepoCommands(deps: RepoCommandsDeps): void {
  const { context, messageRouter } = deps;
  const ctx = createRepoCommandContext({
    extensionContext: context,
    services: deps.services,
    onRepositoryChanged: deps.onRepositoryChanged,
  });

  const hint = createNoRepositoryHint(deps.services);

  context.subscriptions.push(
    hint,
    vscode.commands.registerCommand("git-brains.repo.clone", () =>
      cloneCommand(ctx),
    ),
    vscode.commands.registerCommand("git-brains.repo.init", async () => {
      await initCommand(ctx);
      await hint.refresh();
    }),
    vscode.commands.registerCommand(
      "git-brains.repo.unshallow",
      (rootArg?: unknown) => unshallowCommand(ctx, rootOf(rootArg)),
    ),
    vscode.commands.registerCommand(
      "git-brains.repo.deepen",
      (rootArg?: unknown) => deepenCommand(ctx, rootOf(rootArg)),
    ),
    ...registerSubmoduleCommands(ctx),
    ...registerSparseCheckoutCommands(ctx),
  );

  registerBridgeHandlers(messageRouter, deps.services);
}

/**
 * The webview's requests time out after ten seconds, so anything that asks
 * questions or runs git for longer is started as a host command and the
 * request returns at once; the command reports its own progress and failures.
 */
function registerBridgeHandlers(
  messageRouter: MessageRouter,
  services: GitService[],
): void {
  const panelRoot = () => services[0]?.root;
  const start = (command: string) => async () => {
    void vscode.commands.executeCommand(command, panelRoot());
    return { success: true };
  };

  messageRouter.handle("cloneRepository", async () => {
    void vscode.commands.executeCommand("git-brains.repo.clone");
    return { success: true };
  });
  messageRouter.handle("showSubmodules", start("git-brains.submodules.list"));
  messageRouter.handle(
    "showSparseCheckout",
    start("git-brains.sparseCheckout.status"),
  );
  messageRouter.handle(
    "unshallowRepository",
    start("git-brains.repo.unshallow"),
  );
  messageRouter.handle("isShallowRepository", async () => {
    const service = services[0];
    return { shallow: service ? await service.isShallow() : false };
  });
}

// ────────────────────────────────────────────
// Clone
// ────────────────────────────────────────────

async function cloneCommand(ctx: RepoCommandContext): Promise<void> {
  const url = (
    await vscode.window.showInputBox({
      title: "Clone Repository",
      prompt: "Repository URL or local path",
      placeHolder: "https://github.com/owner/repository.git",
      ignoreFocusOut: true,
      validateInput: cloneUrlProblem,
    })
  )?.trim();
  if (!url) return;

  const state = ctx.extensionContext.globalState;
  const remembered = state.get<string>(LAST_CLONE_PARENT_KEY);
  const parentPick = await vscode.window.showOpenDialog({
    title: "Choose where to clone",
    openLabel: "Select Repository Location",
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    defaultUri: vscode.Uri.file(remembered ?? os.homedir()),
  });
  const parent = parentPick?.[0]?.fsPath;
  if (!parent) return;
  await state.update(LAST_CLONE_PARENT_KEY, parent);

  const name = (
    await vscode.window.showInputBox({
      title: "Clone Repository",
      prompt: `Folder name, created inside ${parent}`,
      value: repoNameFromUrl(url),
      ignoreFocusOut: true,
      validateInput: async (value) =>
        cloneNameProblem(value) ??
        (await cloneTargetProblem(path.join(parent, value.trim()))),
    })
  )?.trim();
  if (!name) return;
  const targetDir = path.join(parent, name);

  const recurseSubmodules = vscode.workspace
    .getConfiguration("jgc.clone")
    .get<boolean>("recurseSubmodules", false);
  const shownUrl = redactUrlCredentials(url);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Cloning ${shownUrl}`,
        cancellable: true,
      },
      async (progress, token) => {
        const abort = new AbortController();
        token.onCancellationRequested(() => abort.abort());
        let reported = 0;
        await cloneRepository({
          url,
          targetDir,
          recurseSubmodules,
          signal: abort.signal,
          onProgress: (p) => {
            const increment = Math.max(0, p.overall - reported);
            reported += increment;
            progress.report({
              message:
                p.percent === undefined ? p.phase : `${p.phase} ${p.percent}%`,
              increment,
            });
          },
        });
      },
    );
  } catch (err) {
    if (err instanceof CloneCancelledError) {
      void vscode.window.showInformationMessage("JGC: Clone cancelled.");
    } else if (err instanceof CloneError) {
      void vscode.window.showErrorMessage(`JGC: Clone failed. ${err.message}`);
    } else {
      void vscode.window.showErrorMessage(
        `JGC: Clone failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return;
  }

  const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
  const open = "Open";
  const openNew = "Open in New Window";
  const addToWorkspace = "Add to Workspace";
  const choice = await vscode.window.showInformationMessage(
    `JGC: Cloned ${name}. Open it?`,
    open,
    openNew,
    ...(hasWorkspace ? [addToWorkspace] : []),
  );
  if (choice === open) {
    await openFolder(targetDir, false);
  } else if (choice === openNew) {
    await openFolder(targetDir, true);
  } else if (choice === addToWorkspace) {
    vscode.workspace.updateWorkspaceFolders(
      vscode.workspace.workspaceFolders?.length ?? 0,
      0,
      { uri: vscode.Uri.file(targetDir) },
    );
  }
}

// ────────────────────────────────────────────
// Init
// ────────────────────────────────────────────

async function initCommand(ctx: RepoCommandContext): Promise<void> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    const open = "Open Folder…";
    const clone = "Clone Repository…";
    const choice = await vscode.window.showInformationMessage(
      "JGC: Open a folder to initialize it as a Git repository, or clone one.",
      open,
      clone,
    );
    if (choice === open) {
      await vscode.commands.executeCommand("vscode.openFolder");
    } else if (choice === clone) {
      await vscode.commands.executeCommand("git-brains.repo.clone");
    }
    return;
  }

  let candidates: vscode.WorkspaceFolder[];
  try {
    const states = await Promise.all(
      folders.map((folder) => detectRepository(folder.uri.fsPath)),
    );
    candidates = folders.filter((_, i) => states[i] === "none");
  } catch (err) {
    ctx.reportFailure("Checking for a Git repository", err);
    return;
  }
  if (candidates.length === 0) {
    void vscode.window.showInformationMessage(
      "JGC: This workspace is already a Git repository.",
    );
    return;
  }

  let folder: vscode.WorkspaceFolder | undefined = candidates[0];
  if (candidates.length > 1) {
    const picked = await vscode.window.showQuickPick(
      candidates.map((f) => ({
        label: f.name,
        description: f.uri.fsPath,
        folder: f,
      })),
      { title: "Create Git Repository", placeHolder: "Folder to initialize" },
    );
    folder = picked?.folder;
  }
  if (!folder) return;
  const directory = folder.uri.fsPath;

  const branch = (
    await vscode.window.showInputBox({
      title: `Create Git Repository in ${folder.name}`,
      prompt: "Initial branch name",
      value: await defaultInitialBranch(directory),
      ignoreFocusOut: true,
      validateInput: (value) => branchNameProblem(value.trim()),
    })
  )?.trim();
  if (!branch) return;

  try {
    await initRepository(directory, { initialBranch: branch });
  } catch (err) {
    ctx.reportFailure("Creating the Git repository", err);
    return;
  }
  ctx.onRepositoryChanged();
  void vscode.window.showInformationMessage(
    `JGC: Created a Git repository in ${folder.name} on branch ${branch}.`,
  );
}

/**
 * A status bar entry while no workspace folder is a Git repository: the one
 * place a user in a bare folder sees "Create Git Repository" without going
 * through the command palette. Hidden as soon as any folder becomes one.
 */
function createNoRepositoryHint(
  services: GitService[],
): vscode.Disposable & { refresh(): Promise<void> } {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  item.text = "$(repo) Create Git Repository";
  item.tooltip = "This folder is not a Git repository. Click to create one.";
  item.command = "git-brains.repo.init";

  let generation = 0;
  const refresh = async () => {
    const mine = ++generation;
    const states = await Promise.all(
      services.map((s) => detectRepository(s.root).catch(() => "error")),
    );
    if (mine !== generation) return;
    const bare = states.length > 0 && states.every((s) => s === "none");
    if (bare) item.show();
    else item.hide();
  };

  const subscriptions = [
    vscode.workspace.onDidChangeWorkspaceFolders(() => void refresh()),
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused) void refresh();
    }),
  ];
  void refresh();

  return {
    refresh,
    dispose() {
      generation++;
      for (const subscription of subscriptions) subscription.dispose();
      item.dispose();
    },
  };
}

// ────────────────────────────────────────────
// Shallow repositories
// ────────────────────────────────────────────

async function unshallowCommand(
  ctx: RepoCommandContext,
  root?: string,
): Promise<void> {
  const service = await ctx.chooseRepository(root);
  if (!service) return;
  try {
    if (!(await service.isShallow())) {
      void vscode.window.showInformationMessage(
        "JGC: This repository already has its full history.",
      );
      return;
    }
    await ctx.withProgress("Fetching the full history…", () =>
      service.unshallow(),
    );
  } catch (err) {
    ctx.reportFailure("Unshallow", err);
    return;
  }
  ctx.onRepositoryChanged();
  void vscode.window.showInformationMessage(
    "JGC: Full history fetched; the repository is no longer shallow.",
  );
}

async function deepenCommand(
  ctx: RepoCommandContext,
  root?: string,
): Promise<void> {
  const service = await ctx.chooseRepository(root);
  if (!service) return;
  try {
    if (!(await service.isShallow())) {
      void vscode.window.showInformationMessage(
        "JGC: This repository already has its full history.",
      );
      return;
    }
  } catch (err) {
    ctx.reportFailure("Deepen history", err);
    return;
  }
  const input = await vscode.window.showInputBox({
    title: "Deepen Shallow History",
    prompt: "How many more commits of history to fetch?",
    value: "50",
    ignoreFocusOut: true,
    validateInput: (value) =>
      /^[1-9]\d{0,8}$/.test(value.trim())
        ? undefined
        : "Enter a whole number, 1 or more",
  });
  if (input === undefined) return;
  const commits = Number(input.trim());
  try {
    await ctx.withProgress(`Fetching ${commits} more commits…`, () =>
      service.deepen(commits),
    );
  } catch (err) {
    ctx.reportFailure("Deepen history", err);
    return;
  }
  ctx.onRepositoryChanged();
}
