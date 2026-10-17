import * as path from "node:path";
import * as vscode from "vscode";
import type { BlockPeek, GutterMarkers } from "../decorations/gutterMarkers";
import type { ChangeBlock } from "../decorations/lineDiff.ts";
import {
  blockAtLine,
  buildCard,
  committedContent,
  nextBlock,
  prevBlock,
  rollbackEdit,
} from "../decorations/markerCard";
import { hoverFor } from "../decorations/markerHover";
import type { MarkerPopup } from "../decorations/markerPopup";

/** Command ids, as contributed in `package.json`. */
export const MARKER_COMMANDS = {
  prev: "jgc.marker.prevChange",
  next: "jgc.marker.nextChange",
  rollback: "jgc.marker.rollbackLines",
  showDiff: "jgc.marker.showDiffForLines",
  copy: "jgc.marker.copyBlock",
  commit: "jgc.marker.commitBlock",
  manage: "jgc.marker.manageSelection",
  close: "jgc.marker.closePopup",
} as const;

/**
 * The actions behind the gutter-marker hover cards: block navigation,
 * rollback, scoped diff, copy and single-block commit. Every command receives
 * `(line, uri)` from the card link and falls back to the caret line when
 * invoked from the command palette.
 */
export function registerMarkerActions(deps: {
  /** Lazy so registration may happen before the controller is constructed. */
  markers: () => GutterMarkers | undefined;
  log?: (message: string) => void;
  /** Called after the repository state changed (a block was committed). */
  onMutated?: () => void;
  /** The extension-wide floating card, shared with the Manage Selection flow. */
  popup?: () => MarkerPopup | undefined;
}): vscode.Disposable[] {
  const log = deps.log ?? (() => {});
  const getMarkers = () => deps.markers();

  /** Open the floating card anchored to one block's first line. */
  const showPopup = (
    editor: vscode.TextEditor,
    peek: BlockPeek,
    block: ChangeBlock,
  ): void => {
    const popup = deps.popup?.();
    if (!popup) return;
    const end =
      block.curCount > 0 ? block.curStart + block.curCount - 1 : block.curStart;
    popup.show(
      peek.uri,
      block.curStart,
      Math.min(end, peek.now.length - 1),
      hoverFor(
        buildCard(block, peek.base ?? [], peek.now, editor.document.languageId),
        peek.uri,
      ),
    );
  };

  /**
   * Resolve the block the command targets. Card links pass the line they were
   * rendered on; palette calls use the caret. The document may have changed
   * since the card was drawn, so blocks are recomputed, and the command simply
   * does nothing when the line is no longer part of a change.
   */
  const withBlock = async (
    rawLine: unknown,
    rawUri: unknown,
    fn: (ctx: {
      editor: vscode.TextEditor;
      block: ChangeBlock;
      peek: BlockPeek;
    }) => Promise<void>,
  ): Promise<void> => {
    const markers = getMarkers();
    if (!markers) return;
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const cardUri =
      typeof rawUri === "string" ? vscode.Uri.parse(rawUri, true) : undefined;
    // A card from another editor must not act on the active one.
    if (cardUri && cardUri.toString() !== editor.document.uri.toString())
      return;
    const line =
      typeof rawLine === "number" ? rawLine : editor.selection.active.line;

    const peek = await markers.peek(editor);
    if (!peek) {
      void vscode.window.showInformationMessage(
        "This file is not in a Git repository.",
      );
      return;
    }
    const block = blockAtLine(peek.blocks, line);
    if (!block) {
      log(`marker action: no change block at line ${line + 1}`);
      void vscode.window.showInformationMessage(
        "No change block at the cursor.",
      );
      return;
    }
    await fn({ editor, block, peek });
  };

  const selectBlock = (editor: vscode.TextEditor, block: ChangeBlock): void => {
    const count = editor.document.lineCount;
    const start = Math.min(block.curStart, count - 1);
    const end =
      block.curCount > 0
        ? Math.min(block.curStart + block.curCount - 1, count - 1)
        : start;
    const range = new vscode.Range(
      start,
      0,
      end,
      editor.document.lineAt(end).text.length,
    );
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(
      range,
      vscode.TextEditorRevealType.InCenterIfOutsideViewport,
    );
  };

  /**
   * Park the caret on one block's first line and scroll it into view: both
   * the floating card and the block jumps anchor at the caret, so jumps keep
   * the caret on the target's first line instead of selecting the block.
   */
  const focusBlock = (editor: vscode.TextEditor, block: ChangeBlock): void => {
    const line = Math.min(block.curStart, editor.document.lineCount - 1);
    editor.selection = new vscode.Selection(line, 0, line, 0);
    editor.revealRange(
      new vscode.Range(line, 0, line, 1),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport,
    );
  };

  return [
    vscode.commands.registerCommand(
      MARKER_COMMANDS.prev,
      async (line?: unknown) =>
        withBlock(line, undefined, async ({ editor, block, peek }) => {
          const target = prevBlock(peek.blocks, block.curStart);
          if (target) focusBlock(editor, target);
          showPopup(editor, peek, target ?? block);
        }),
    ),
    vscode.commands.registerCommand(
      MARKER_COMMANDS.next,
      async (line?: unknown) =>
        withBlock(line, undefined, async ({ editor, block, peek }) => {
          const target = nextBlock(peek.blocks, block.curStart);
          if (target) focusBlock(editor, target);
          showPopup(editor, peek, target ?? block);
        }),
    ),
    vscode.commands.registerCommand(
      MARKER_COMMANDS.rollback,
      async (line?: unknown, uri?: unknown) =>
        withBlock(line, uri, async ({ editor, block, peek }) => {
          if (peek.base === undefined && block.curCount === 0) return;
          const edit = rollbackEdit(block, peek.base ?? []);
          const workspaceEdit = new vscode.WorkspaceEdit();
          // Position (lineCount, 0) does not exist; the end of the document is
          // the end of its last line's line break.
          const end =
            edit.end < editor.document.lineCount
              ? new vscode.Position(edit.end, 0)
              : editor.document.lineAt(editor.document.lineCount - 1)
                  .rangeIncludingLineBreak.end;
          workspaceEdit.replace(
            editor.document.uri,
            new vscode.Range(edit.start, 0, end.line, end.character),
            edit.replacement.join("\n"),
          );
          if (!(await vscode.workspace.applyEdit(workspaceEdit))) {
            void vscode.window.showErrorMessage(
              "Rollback failed: the document was modified.",
            );
            return;
          }
          await editor.document.save();
          deps.popup?.()?.close();
          log(
            `marker rollback: ${editor.document.uri.fsPath} lines ${edit.start + 1}-${edit.end}`,
          );
        }),
    ),
    vscode.commands.registerCommand(
      MARKER_COMMANDS.showDiff,
      async (line?: unknown, uri?: unknown) =>
        withBlock(line, uri, async ({ block, peek }) => {
          const relativePath = path.relative(peek.repo.root, peek.uri.fsPath);
          const leftUri = vscode.Uri.parse(
            `git-brains:/${relativePath}?ref=HEAD`,
          );
          await vscode.commands.executeCommand(
            "vscode.diff",
            leftUri,
            peek.uri,
            `${relativePath} (HEAD ↔ Working Tree)`,
            { preview: true },
          );
          // The diff editor opens asynchronously; reveal the block once its
          // modified side is visible.
          for (let attempt = 0; attempt < 10; attempt++) {
            const diffEditor = vscode.window.visibleTextEditors.find(
              (candidate) =>
                candidate.document.uri.toString() === peek.uri.toString(),
            );
            if (diffEditor) {
              selectBlock(diffEditor, block);
              return;
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }),
    ),
    vscode.commands.registerCommand(
      MARKER_COMMANDS.copy,
      async (line?: unknown, uri?: unknown) =>
        withBlock(line, uri, async ({ block, peek }) => {
          const source =
            block.curCount > 0
              ? peek.now.slice(block.curStart, block.curStart + block.curCount)
              : (peek.base ?? []).slice(
                  block.baseStart,
                  block.baseStart + block.baseCount,
                );
          await vscode.env.clipboard.writeText(source.join("\n"));
        }),
    ),
    vscode.commands.registerCommand(
      MARKER_COMMANDS.commit,
      async (arg?: unknown) => {
        // Invoked from the card's reply box, the argument is a `CommentReply`
        // carrying the typed message and the thread the card rides on; its
        // single-line range names the block to commit.
        const reply =
          arg && typeof arg === "object" && "thread" in arg && "text" in arg
            ? (arg as vscode.CommentReply)
            : undefined;
        if (!reply) return;
        const message = reply.text.trim();
        if (!message) {
          void vscode.window.showWarningMessage(
            "Type a commit message before committing this change.",
          );
          return;
        }
        const uri = reply.thread.uri;
        const line = reply.thread.range.start.line;
        const editor = vscode.window.visibleTextEditors.find(
          (candidate) => candidate.document.uri.toString() === uri.toString(),
        );
        const markers = getMarkers();
        if (!editor || !markers) return;
        // The committed content is read from the buffer, so unsaved edits are
        // saved first — the same thing IDEA does before its block commit.
        if (editor.document.isDirty && !(await editor.document.save())) return;
        const fresh = await markers.peek(editor);
        if (!fresh) return;
        const freshBlock = blockAtLine(fresh.blocks, line);
        if (!freshBlock) return;

        const content = committedContent(
          freshBlock,
          fresh.base ?? [],
          fresh.now,
          fresh.trailingNewline,
        );
        const basename = path.basename(fresh.uri.fsPath);
        try {
          const commit = await fresh.repo.service.commitBlockChange(
            path.relative(fresh.repo.root, fresh.uri.fsPath),
            content,
            message,
          );
          log(`marker commit: ${commit} (${basename})`);
          deps.popup?.()?.close();
          deps.onMutated?.();
          void vscode.window.showInformationMessage(
            `Committed this change: ${commit.slice(0, 7)} — ${basename}`,
          );
        } catch (error) {
          void vscode.window.showErrorMessage(
            `Committing this change failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    ),
    vscode.commands.registerCommand(
      MARKER_COMMANDS.manage,
      async (
        arg?: { lineNumber?: number; uri?: string | vscode.Uri } | number,
      ) => {
        // From the line-number menu the clicked line arrives as a 1-based
        // `lineNumber` (with the clicked file's uri); from the editor context
        // menu it arrives as a bare number or nothing at all. The block model
        // is 0-based, so the menu's line is shifted down by one.
        const line =
          typeof arg === "number"
            ? arg
            : typeof arg?.lineNumber === "number"
              ? arg.lineNumber - 1
              : undefined;
        // The menu forwards its target as a `Uri`; `withBlock` compares
        // strings, so it is flattened here.
        const uri =
          typeof arg === "object" && arg?.uri ? `${arg.uri}` : undefined;
        await withBlock(line, uri, async ({ editor, block, peek }) => {
          // The comment-widget card is the popup: it stays open until the user
          // acts on it, where the summoned hover gets reaped by the focus and
          // mouse logic — flaky enough to be unreadable. Its frame width is
          // VS Code chrome and cannot be styled; the content inside hugs.
          focusBlock(editor, block);
          log(`manage selection: popup at line ${block.curStart + 1}`);
          showPopup(editor, peek, block);
        });
      },
    ),
    vscode.commands.registerCommand(MARKER_COMMANDS.close, () =>
      deps.popup?.()?.close(),
    ),
  ];
}
