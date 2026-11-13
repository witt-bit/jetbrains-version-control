import * as nodefs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import type { MessageRouter } from "../messages/messageRouter";
import { getWebviewHtml } from "./html";

// TEMP DIAGNOSTIC — remove once the "Close All hides the panel" cause is known.
const TRACE_FILE = path.join(os.tmpdir(), "jgc-changes-view.log");
function trace(message: string): void {
  const line = `${new Date().toISOString()} pid=${process.pid} ${message}
`;
  nodefs.appendFile(TRACE_FILE, line).catch(() => {});
}

/**
 * Context key that gates the whole Changes container. The view declares
 * `"when": "jgc.changesViewVisible"`, and a container whose views are all
 * hidden is not contributed to the activity bar — so the icon is absent until
 * the branch context menu asks for it, and gone again once the user leaves.
 */
export const CHANGES_VIEW_VISIBLE_KEY = "jgc.changesViewVisible";

/**
 * The Changes view — a working-tree file list whose clicks open file diffs in
 * the editor area. Sits in its own activity-bar container below Commit so the
 * list has room of its own; the Commit panel is already crowded with the
 * message box, the checkbox list and the shelf tabs.
 *
 * Unlike the other views it is not always on screen: it is a transient tool,
 * shown on request and hidden as soon as the user switches the sidebar to
 * something else.
 */
export class ChangesViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "git-brains.changes";

  /**
   * What the list is diffed against. `null` means the plain working-tree
   * status; a ref means "everything that differs between this ref and the
   * working tree", which is what the branch menu asks for.
   */
  private baseRef: string | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly messageRouter: MessageRouter,
  ) {
    trace("provider constructed (host activated)");
  }

  getBaseRef(): string | null {
    return this.baseRef;
  }

  /** Reveals the container and focuses the view, diffing against `baseRef`. */
  async reveal(baseRef: string | null = null): Promise<void> {
    trace(`reveal baseRef=${baseRef}`);
    this.baseRef = baseRef;
    await vscode.commands.executeCommand(
      "setContext",
      CHANGES_VIEW_VISIBLE_KEY,
      true,
    );
    // The container only exists after the `when` clause re-evaluates, which
    // happens on a later tick — opening it straight away would find nothing.
    await new Promise((resolve) => setTimeout(resolve, 60));
    try {
      // Opening the container is what actually puts it on screen; focusing a
      // view that was hidden by `when` a moment ago can silently do nothing.
      await vscode.commands.executeCommand(
        "workbench.view.extension.git-brains-changes",
      );
    } catch {
      // Container command unavailable — focus below is the fallback.
    }
    try {
      await vscode.commands.executeCommand(
        `${ChangesViewProvider.viewType}.focus`,
      );
    } catch {
      // Focus is best effort; the container is already open.
    }
    // A view that is already mounted still shows the previous base ref; ask it
    // to refetch. A freshly created view gets the new base ref with its first
    // request, so the extra event is harmless.
    this.messageRouter.broadcastEvent("commitStateChanged", {});
  }

  /** Un-contributes the container: icon and panel both disappear. */
  static async hide(): Promise<void> {
    trace(`hide called from:\n${new Error().stack ?? ""}`);
    await vscode.commands.executeCommand(
      "setContext",
      CHANGES_VIEW_VISIBLE_KEY,
      false,
    );
  }

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

    webview.html = getWebviewHtml(webview, this.extensionUri, "changes");

    const routerDisposable = this.messageRouter.registerWebview(webview);

    // A webview view is resolved before it is live. A `postMessage` reply sent
    // in that window is dropped without an error, so a list requested on mount
    // can time out and leave the panel empty. Asking again once the view is
    // really visible (and shortly after resolve, for the already-visible case)
    // makes the first paint reliable.
    const nudge = () => {
      setTimeout(() => {
        this.messageRouter.broadcastEvent("commitStateChanged", {});
      }, 150);
    };
    nudge();

    // The container is hidden only when the user closes it explicitly (the
    // toolbar ✕) — the single `hide()` caller is `closeChangesView`.
    //
    // Every automatic trigger was tried and abandoned. `onDidChangeVisibility`
    // cannot tell "Close All" from "the user switched the sidebar": both
    // deactivate the container. And `onDidDispose` is not a close either — VS
    // Code disposes a webview view whenever it stops being shown, so hiding
    // from there removed the container on any switch, which also left the
    // activity bar with nothing selected.
    webviewView.onDidDispose(() => {
      trace("view disposed");
      routerDisposable.dispose();
    });
    webviewView.onDidChangeVisibility(() => {
      trace(`visibility visible=${webviewView.visible}`);
    });
  }
}
