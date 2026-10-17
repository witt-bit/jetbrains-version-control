import * as vscode from "vscode";

/**
 * A floating card over the editor, anchored to a change block's first line.
 * The comment-thread widget is the only floating surface an extension can
 * create and dismiss at will — the popup rides on a lightweight comment
 * controller while its content (icon toolbar, change preview) is entirely
 * ours. Opening it needs no mouse hover, so it also works as the
 * Manage Selection summoner.
 */
export interface MarkerPopup {
  show(
    uri: vscode.Uri,
    start: number,
    end: number,
    body: vscode.MarkdownString,
  ): void;
  close(): void;
  dispose(): void;
}

export function createMarkerPopup(): MarkerPopup {
  const controller = vscode.comments.createCommentController(
    "jgc.markerPopup",
    "Manage Selection",
  );
  // The reply box doubles as the commit-message field: its prompt labels the
  // collapsed button and its placeholder guides the expanded input.
  controller.options = {
    prompt: "Commit message…",
    placeHolder: "Commit message for this change",
  };

  let thread: vscode.CommentThread | undefined;
  let uri: vscode.Uri | undefined;
  let firstLine = 0;
  let lastLine = 0;

  const setVisible = (visible: boolean): void => {
    void vscode.commands.executeCommand(
      "setContext",
      "jgc.markerPopupVisible",
      visible,
    );
  };

  const close = (): void => {
    if (!thread) return;
    thread.dispose();
    thread = undefined;
    uri = undefined;
    setVisible(false);
  };

  // The card is computed once; once its document changes it is stale, so it
  // goes away instead of showing outdated content against new code.
  const changeListener = vscode.workspace.onDidChangeTextDocument((event) => {
    if (!thread) return;
    if (event.document.uri.toString() === uri?.toString()) close();
  });
  // A click anywhere outside the card's block closes it; clicks inside the
  // widget move no editor caret, so they do not reach this listener.
  const selectionListener = vscode.window.onDidChangeTextEditorSelection(
    (event) => {
      if (!thread || !uri) return;
      if (event.textEditor.document.uri.toString() !== uri.toString()) return;
      const line = event.selections[0]?.active.line;
      if (line === undefined) return;
      if (line < firstLine || line > lastLine) close();
    },
  );

  return {
    show(newUri, start, end, body) {
      close();
      uri = newUri;
      firstLine = start;
      lastLine = end;
      thread = controller.createCommentThread(
        newUri,
        // A single-line range renders the widget directly under the caret's
        // line, the way IDEA floats its change toolbar under the marker.
        new vscode.Range(start, 0, start, 1),
        [{ body, author: { name: "" }, mode: vscode.CommentMode.Preview }],
      );
      // The reply box is the card's commit-message field: keeping it open lets
      // the user type the message, and its submit button runs the Commit
      // action contributed to `comments/commentThread/context`. The context
      // value scopes that action to this popup's threads.
      thread.canReply = true;
      thread.contextValue = "jgc.markerPopup";
      thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
      setVisible(true);
    },
    close,
    dispose() {
      close();
      changeListener.dispose();
      selectionListener.dispose();
      controller.dispose();
    },
  };
}
