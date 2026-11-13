import * as vscode from "vscode";
import type { MessageRouter } from "../messages/messageRouter";
import { getWebviewHtml } from "./html";

/**
 * Context key that gates the whole Changes container. The view declares
 * `"when": "jgc.changesViewVisible"`, and a container whose views are all
 * hidden is not contributed to the activity bar — so the icon is absent until
 * the branch context menu asks for it, and gone again once the user leaves.
 */
export const CHANGES_VIEW_VISIBLE_KEY = "jgc.changesViewVisible";

/**
 * Grace period before deciding the sidebar really collapsed. The visibility
 * event can arrive before VS Code has finished closing the editor tabs, so
 * judging immediately still sees a non-empty editor area.
 */
const RESTORE_DELAY = 400;

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

  /**
   * Set when this view opens a diff tab, cleared once the editor area is found
   * empty again. It is the only reliable way to tell "Close All" apart from
   * "the user switched the sidebar": closing our own diff is the one thing
   * that empties the editor area while this view is on screen.
   */
  private diffTabOpen = false;

  /** Title of the diff tab this view opened last, to recognise its closing. */
  private diffTabTitle: string | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly messageRouter: MessageRouter,
  ) {}

  getBaseRef(): string | null {
    return this.baseRef;
  }

  /** Called after a diff tab was opened for this view. */
  noteDiffTabOpened(title: string): void {
    this.diffTabOpen = true;
    this.diffTabTitle = title;
  }

  /** Reveals the container and focuses the view, diffing against `baseRef`. */
  async reveal(baseRef: string | null = null): Promise<void> {
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
    // toolbar ✕) — the single `hide()` caller is `closeChangesView`. Making
    // `onDidChangeVisibility(false)` hide it was tried and abandoned: "Close
    // All" deactivates the container exactly like switching the sidebar does,
    // so closing editor tabs took the panel with it. `onDidDispose` is not a
    // close either — VS Code disposes a webview view whenever it stops being
    // shown.
    //
    // Closing every editor tab still collapses the sidebar *part*, and that is
    // a VS Code bug, not ours: LayoutService registers a per-part
    // `onDidVisibilityChange` feedback loop whose sidebar branch is unguarded
    // (`g === sidebar ? this.setSideBarHidden(!f)`), while the panel branch is
    // guarded with `PANEL_HIDDEN === f`. Removing the last editor group
    // re-lays out the grid, that re-layout calls `Part.setVisible(false)` on
    // the sidebar, and the unguarded branch turns it into a real
    // `setSideBarHidden(true)` — which hides the part, calls
    // `hideActivePaneComposite(0)` (nothing lit) and moves focus. That is repaired here rather than
    // prevented, and the trigger is deliberately narrow — our own diff tab was
    // open and the editor area is now empty. Editors still open means the user
    // switched the sidebar, and then nothing happens.
    //
    // The restore uses `<viewId>.focus` with `preserveFocus`: it re-selects the
    // container, *unhides* the sidebar part (`doOpenPaneComposite` →
    // `setPartHidden(false, …)`), and does not steal focus from the editor.
    let restoreTimer: ReturnType<typeof setTimeout> | null = null;
    const clearRestoreTimer = () => {
      if (restoreTimer !== null) {
        clearTimeout(restoreTimer);
        restoreTimer = null;
      }
    };

    /** Re-selects the container and un-hides the sidebar, without focus. */
    const restoreSidebar = () => {
      if (webviewView.visible) return;
      const editorAreaEmpty = vscode.window.tabGroups.all.every(
        (group) => group.tabs.length === 0,
      );
      if (!editorAreaEmpty) return;
      void vscode.commands.executeCommand(
        `${ChangesViewProvider.viewType}.focus`,
        { preserveFocus: true },
      );
    };

    // React to our own diff tab being closed rather than to the sidebar
    // collapsing: the collapse is a VS Code bug (see below) and by the time we
    // could see it, it has already been painted. This fires on the real cause,
    // immediately — and also keeps `diffTabOpen` honest, which the
    // visibility-based fallback depends on.
    const tabsListener = vscode.window.tabGroups.onDidChangeTabs((e) => {
      if (!this.diffTabOpen) return;
      const closedOurs = e.closed.some(
        (tab) => tab.label === this.diffTabTitle,
      );
      if (!closedOurs) return;
      this.diffTabOpen = false;
      // Immediate attempt, plus one retry for the turn where the tab model in
      // the extension host has not caught up with the renderer yet.
      restoreSidebar();
      clearRestoreTimer();
      restoreTimer = setTimeout(() => {
        restoreTimer = null;
        restoreSidebar();
      }, RESTORE_DELAY);
    });
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        clearRestoreTimer();
        nudge();
        return;
      }
      // Fallback: only when the tab-close event did not arrive first.
      clearRestoreTimer();
      restoreTimer = setTimeout(() => {
        restoreTimer = null;
        if (!this.diffTabOpen) return;
        this.diffTabOpen = false;
        restoreSidebar();
      }, RESTORE_DELAY);
    });

    webviewView.onDidDispose(() => {
      clearRestoreTimer();
      tabsListener.dispose();
      routerDisposable.dispose();
    });
  }
}
