import * as vscode from "vscode";
import type { MessageRouter } from "../messages/messageRouter";
import { getWebviewHtml } from "./html";

export class WorktreeViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "git-brains.worktrees";

  /**
   * Last known visibility. The Create Branch dialog in the Git Log view gives
   * its height to this view while it is open, mirroring what the New Worktree
   * dialog does in the other direction.
   */
  private visible = false;

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

    webview.html = getWebviewHtml(webview, this.extensionUri, "worktree");

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
