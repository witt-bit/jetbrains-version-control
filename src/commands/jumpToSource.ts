import * as vscode from "vscode";
import { GIT_BRAINS_SCHEME } from "../views/gitContentProvider";

/**
 * Diff sides are served by our `git-brains:` content provider, so opening a side
 * directly would show a read-only snapshot instead of the file on disk. Map the
 * virtual URI back to the real workspace file.
 */
function toRealFileUri(uri: vscode.Uri): vscode.Uri | undefined {
  if (uri.scheme === "file") return uri;
  if (uri.scheme !== GIT_BRAINS_SCHEME) return undefined;

  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return undefined;

  const relative = uri.path.startsWith("/") ? uri.path.slice(1) : uri.path;
  if (!relative) return undefined;
  return vscode.Uri.joinPath(folder.uri, relative);
}

/**
 * Open the file under the cursor in a normal editor, keeping the view intact.
 *
 * Mirrors the built-in git extension's `git.openFile` (the diff editor's
 * "Open File" button we replace): it carries the full selection over and pins
 * the viewport to the ranges that were visible in the diff, so a multi-line
 * selection stays selected and the scroll position does not jump to the top.
 *
 * VS Code's own `workbench.action.compareEditor.openSide` calls
 * `openEditor(editor)` with no selection, which loses both.
 *
 * @returns false when no usable diff/editor was found, so the caller can fall
 *   back to another behaviour.
 */
export async function jumpToSourceFromDiffEditor(): Promise<boolean> {
  const tabInput = vscode.window.tabGroups.activeTabGroup?.activeTab?.input;
  if (!(tabInput instanceof vscode.TabInputTextDiff)) return false;

  const editor = vscode.window.activeTextEditor;
  if (!editor) return false;

  const { original, modified } = tabInput;
  // Prefer whichever side has focus; otherwise fall back to the modified side.
  const side =
    editor.document.uri.toString() === original.toString()
      ? original
      : modified;

  const target = toRealFileUri(side);
  if (!target) return false;

  // Snapshot before opening: after `vscode.open` the diff editor is gone.
  const { selection, visibleRanges } = editor;

  await vscode.commands.executeCommand("vscode.open", target, {
    preview: false,
    viewColumn: vscode.ViewColumn.Active,
  });

  const opened = vscode.window.activeTextEditor?.document;
  // Opening can move focus elsewhere (e.g. a preview pane), in which case we
  // must not pretend the selection was applied.
  if (!opened || opened.uri.toString() !== target.toString()) {
    return true;
  }

  const shown = await vscode.window.showTextDocument(opened, {
    selection,
    preview: false,
    viewColumn: vscode.ViewColumn.Active,
  });

  if (visibleRanges.length > 0) {
    // Pin the viewport back to where the user was: prefer the range that
    // overlaps the selection (that is what they were looking at), else the
    // first visible one.
    const anchor =
      visibleRanges.length > 1
        ? (visibleRanges.find((r) => r.intersection(selection)) ??
          visibleRanges[0])
        : visibleRanges[0];
    shown.revealRange(anchor);
  }
  return true;
}
