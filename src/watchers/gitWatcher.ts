import * as path from "node:path";
import * as vscode from "vscode";
import type { MessageRouter } from "../messages/messageRouter";

type Scope = "all" | "branches" | "status" | "mergeState" | "log";

export class GitWatcher implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private debounceTimers = new Map<Scope, ReturnType<typeof setTimeout>>();
  private readonly stateEmitter = new vscode.EventEmitter<Scope>();

  /**
   * Fires for extension-host consumers (status bar, decorations) that cannot
   * subscribe to the webview-only `gitStateChanged` router event.
   */
  readonly onDidChangeState = this.stateEmitter.event;

  constructor(
    private readonly workspaceRoots: string[],
    private readonly messageRouter: MessageRouter,
    private readonly invalidateCaches: () => void,
  ) {
    this.setupFileWatchers();
    this.setupEditorWatchers();
  }

  private setupFileWatchers(): void {
    // Every workspace folder gets its own set of watchers: in a multi-root
    // workspace the single-root version missed Git state changes in every
    // folder but the first.
    for (const workspaceRoot of this.workspaceRoots) {
      this.watchRoot(workspaceRoot);
    }
  }

  private watchRoot(workspaceRoot: string): void {
    const gitBase = vscode.Uri.file(`${workspaceRoot}/.git`);

    // .git/HEAD → all
    const headWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(gitBase, "HEAD"),
    );
    headWatcher.onDidChange(() => this.notify("all"));
    headWatcher.onDidCreate(() => this.notify("all"));
    headWatcher.onDidDelete(() => this.notify("all"));
    this.disposables.push(headWatcher);

    // .git/refs/heads/** → branches
    const headsWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(gitBase, "refs/heads/**"),
    );
    headsWatcher.onDidChange(() => this.notify("branches"));
    headsWatcher.onDidCreate(() => this.notify("branches"));
    headsWatcher.onDidDelete(() => this.notify("branches"));
    this.disposables.push(headsWatcher);

    // .git/refs/remotes/** → branches
    const remotesWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(gitBase, "refs/remotes/**"),
    );
    remotesWatcher.onDidChange(() => this.notify("branches"));
    remotesWatcher.onDidCreate(() => this.notify("branches"));
    remotesWatcher.onDidDelete(() => this.notify("branches"));
    this.disposables.push(remotesWatcher);

    // .git/refs/tags/** → branches (tags group)
    const tagsWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(gitBase, "refs/tags/**"),
    );
    tagsWatcher.onDidChange(() => this.notify("branches"));
    tagsWatcher.onDidCreate(() => this.notify("branches"));
    tagsWatcher.onDidDelete(() => this.notify("branches"));
    this.disposables.push(tagsWatcher);

    // .git/index → status
    const indexWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(gitBase, "index"),
    );
    indexWatcher.onDidChange(() => this.notify("status"));
    this.disposables.push(indexWatcher);

    // .git/MERGE_HEAD → mergeState
    const mergeHeadWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(gitBase, "MERGE_HEAD"),
    );
    mergeHeadWatcher.onDidChange(() => this.notify("mergeState"));
    mergeHeadWatcher.onDidCreate(() => this.notify("mergeState"));
    mergeHeadWatcher.onDidDelete(() => this.notify("mergeState"));
    this.disposables.push(mergeHeadWatcher);

    // .git/CHERRY_PICK_HEAD → mergeState (cherry-pick state)
    const cherryPickHeadWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(gitBase, "CHERRY_PICK_HEAD"),
    );
    cherryPickHeadWatcher.onDidChange(() => this.notify("mergeState"));
    cherryPickHeadWatcher.onDidCreate(() => this.notify("mergeState"));
    cherryPickHeadWatcher.onDidDelete(() => this.notify("mergeState"));
    this.disposables.push(cherryPickHeadWatcher);

    // .git/rebase-merge/** → mergeState (rebase state)
    const rebaseMergeWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(gitBase, "rebase-merge/**"),
    );
    rebaseMergeWatcher.onDidChange(() => this.notify("mergeState"));
    rebaseMergeWatcher.onDidCreate(() => this.notify("mergeState"));
    rebaseMergeWatcher.onDidDelete(() => this.notify("mergeState"));
    this.disposables.push(rebaseMergeWatcher);

    // .git/rebase-apply/** → mergeState (rebase state)
    const rebaseApplyWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(gitBase, "rebase-apply/**"),
    );
    rebaseApplyWatcher.onDidChange(() => this.notify("mergeState"));
    rebaseApplyWatcher.onDidCreate(() => this.notify("mergeState"));
    rebaseApplyWatcher.onDidDelete(() => this.notify("mergeState"));
    this.disposables.push(rebaseApplyWatcher);

    // .git/COMMIT_EDITMSG → log
    const commitMsgWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(gitBase, "COMMIT_EDITMSG"),
    );
    commitMsgWatcher.onDidChange(() => this.notify("log"));
    commitMsgWatcher.onDidCreate(() => this.notify("log"));
    this.disposables.push(commitMsgWatcher);

    // Workspace file create/delete → status. Creating, renaming or deleting an
    // untracked file writes neither .git/index nor a saved text document, so
    // without this the untracked count goes stale.
    const untrackedWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceRoot, "**/*"),
    );
    const inGitDir = (uri: vscode.Uri) =>
      uri.fsPath.startsWith(`${workspaceRoot}${path.sep}.git`);
    untrackedWatcher.onDidCreate((uri) => {
      if (!inGitDir(uri)) this.notify("status");
    });
    untrackedWatcher.onDidDelete((uri) => {
      if (!inGitDir(uri)) this.notify("status");
    });
    this.disposables.push(untrackedWatcher);
  }

  private setupEditorWatchers(): void {
    // Save → status refresh
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument(() => this.notify("status")),
    );
  }

  private notify(scope: Scope): void {
    // Debounce per scope, 300ms
    const existing = this.debounceTimers.get(scope);
    if (existing) {
      clearTimeout(existing);
    }

    this.debounceTimers.set(
      scope,
      setTimeout(() => {
        this.debounceTimers.delete(scope);
        this.invalidateCaches();
        this.messageRouter.broadcastEvent("gitStateChanged", { scope });
        this.stateEmitter.fire(scope);
      }, 300),
    );
  }

  dispose(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.stateEmitter.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
