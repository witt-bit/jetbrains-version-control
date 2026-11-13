import * as vscode from "vscode";
import type { MessageRouter } from "../messages/messageRouter";
import { getWebviewHtml } from "./html";

export class GitLogViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "git-brains.gitLog";

  /**
   * Last known visibility. The New Worktree dialog gives its height to the
   * Worktrees view while it is open, and needs to know whether there is a
   * Git Log to give back — the view itself is not resolved until first shown,
   * so "false" is the correct answer for a view that was never opened.
   */
  private visible = false;

  /** Whether the Git Log view is currently on screen. */
  get isVisible(): boolean {
    return this.visible;
  }

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly messageRouter: MessageRouter,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    const webview = webviewView.webview;

    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist")],
    };

    webview.html = getWebviewHtml(webview, this.extensionUri, "panel");

    const routerDisposable = this.messageRouter.registerWebview(webview);
    this.visible = webviewView.visible;
    webviewView.onDidChangeVisibility(() => {
      this.visible = webviewView.visible;
    });
    webviewView.onDidDispose(() => {
      this.visible = false;
      routerDisposable.dispose();
    });
  }
}
