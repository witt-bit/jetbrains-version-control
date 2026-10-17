import { type ChangeBlock, changeBlocks } from "./lineDiff.ts";

/**
 * Everything the gutter-marker hover card and the marker commands need,
 * computed from the two line arrays the gutter itself already diffs. Kept free
 * of the `vscode` module so the logic is unit-testable and the rendering layer
 * stays thin.
 */

/**
 * The toolbar actions the card offers, in display order. Commit is not here:
 * it lives in the card's reply box, whose text becomes the commit message.
 */
export type CardAction = "prev" | "next" | "rollback" | "showDiff" | "copy";

/** A block's full card: the code to preview and the commands it triggers. */
export interface MarkerCard {
  state: "added" | "modified" | "deleted";
  /** 1-based, user-facing line span in the current text. */
  from: number;
  to: number;
  /** HEAD lines shown as the removed side; empty for an insertion. */
  removed: string[];
  /** Current lines shown as the added side; empty for a deletion. */
  added: string[];
  /** The document's language id, so the preview's fence highlights correctly. */
  languageId: string;
  actions: CardAction[];
}

/** The block containing `line`, if any; a deletion owns the line it anchors on. */
export function blockAtLine(
  blocks: ChangeBlock[],
  line: number,
): ChangeBlock | undefined {
  return blocks.find(
    (block) =>
      line >= block.curStart &&
      (line < block.curStart + block.curCount ||
        // A deletion has no current lines; it owns only its anchor line.
        (block.curCount === 0 && line === block.curStart)),
  );
}

/**
 * The nearest block after `line` (wrapping around the file end), or `undefined`
 * when the file has none.
 */
export function nextBlock(
  blocks: ChangeBlock[],
  line: number,
): ChangeBlock | undefined {
  const after = blocks
    .filter((block) => block.curStart > line && block.curCount > 0)
    .sort((a, b) => a.curStart - b.curStart);
  if (after.length > 0) return after[0];
  const first = blocks.filter((block) => block.curCount > 0);
  return first[0];
}

/** The mirror image of `nextBlock`: nearest before `line`, wrapping around. */
export function prevBlock(
  blocks: ChangeBlock[],
  line: number,
): ChangeBlock | undefined {
  const before = blocks
    .filter((block) => block.curStart < line && block.curCount > 0)
    .sort((a, b) => b.curStart - a.curStart);
  if (before.length > 0) return before[0];
  const last = blocks.filter((block) => block.curCount > 0);
  return last[last.length - 1];
}

/**
 * How many lines the card's preview shows per side before it is cut off.
 * IDEA's card scrolls; a hover tooltip is a poor scroller, so long edits trim.
 */
const MAX_PREVIEW_LINES = 8;

/**
 * Build the card for one block. The preview keeps the two sides apart — the
 * removed HEAD lines and the current lines — so the renderer can show them as
 * the code they are. An insertion carries only its current lines, which the
 * card leaves out (they sit right there in the editor).
 */
export function buildCard(
  block: ChangeBlock,
  base: string[],
  now: string[],
  languageId: string,
): MarkerCard {
  const state: MarkerCard["state"] =
    block.baseCount > 0 && block.curCount > 0
      ? "modified"
      : block.curCount > 0
        ? "added"
        : "deleted";

  return {
    state,
    from: block.curStart + 1,
    to: block.curStart + Math.max(block.curCount, 1),
    removed: trimPreview(
      base.slice(block.baseStart, block.baseStart + block.baseCount),
    ),
    added: trimPreview(
      now.slice(block.curStart, block.curStart + block.curCount),
    ),
    languageId,
    actions: ["prev", "next", "rollback", "showDiff", "copy"],
  };
}

/**
 * Cut a side from both ends around the middle so its first and last changes
 * stay visible; the elision line reads as part of the code.
 */
function trimPreview(lines: string[]): string[] {
  if (lines.length <= MAX_PREVIEW_LINES) return lines;
  const half = Math.floor(MAX_PREVIEW_LINES / 2);
  return [...lines.slice(0, half), "…", ...lines.slice(lines.length - half)];
}

/** A replacement of a span of current lines, 0-based, end-exclusive. */
export interface SpanEdit {
  start: number;
  end: number;
  replacement: string[];
}

/**
 * Undo one block: the workspace edit that turns the current text back into
 * the base text at exactly that block, leaving every other change alone.
 */
export function rollbackEdit(block: ChangeBlock, base: string[]): SpanEdit {
  return {
    start: block.curStart,
    end: block.curStart + block.curCount,
    replacement: base.slice(block.baseStart, block.baseStart + block.baseCount),
  };
}

/**
 * The whole file as it would be if only this one block were applied to `HEAD`:
 * the content "Commit this change" puts in the committed tree. Everything the
 * user changed elsewhere stays out of the commit but keeps living in the
 * working tree.
 */
export function committedContent(
  block: ChangeBlock,
  base: string[],
  now: string[],
  trailingNewline = true,
): string {
  const head = base.slice();
  head.splice(
    block.baseStart,
    block.baseCount,
    ...now.slice(block.curStart, block.curStart + block.curCount),
  );
  return head.join("\n") + (trailingNewline ? "\n" : "");
}

/**
 * All blocks at once — the shape the gutter consumes and the commands reuse.
 */
export { changeBlocks };
