import { diffWordsWithSpace } from "diff";
import { type ChangeBlock, changeBlocks } from "./lineDiff.ts";

/**
 * Everything the gutter-marker hover card and the marker commands need,
 * computed from the two line arrays the gutter itself already diffs. Kept free
 * of the `vscode` module so the logic is unit-testable and the rendering layer
 * stays thin.
 */

/** Which tone a rendered diff line carries. */
export type CardLineTone = "removed" | "added" | "context";

/** One rendered line of the card's preview area. */
export interface CardLine {
  tone: CardLineTone;
  /**
   * Word-level pieces of the line, or `undefined` when the whole line shares
   * one tone. Only modified lines get pieces: it is the only case where the
   * changed part is a fraction of the line.
   */
  pieces?: Array<{ text: string; changed: boolean }>;
  text: string;
}

/** The actions the card offers, in display order. */
export type CardAction =
  | "prev"
  | "next"
  | "rollback"
  | "showDiff"
  | "copy"
  | "commit";

/** A block's full card: a preview and the commands it triggers. */
export interface MarkerCard {
  state: "added" | "modified" | "deleted";
  /** 1-based, user-facing line span in the current text. */
  from: number;
  to: number;
  lines: CardLine[];
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
 * How many lines the card's preview area shows per side before it is cut off.
 * IDEA's card scrolls; a hover tooltip is a poor scroller, so long edits trim.
 */
const MAX_PREVIEW_LINES = 8;

/**
 * Build the card for one block. A modification pairs its removed and added
 * lines and word-diffs each pair; a deletion shows its removed lines; an
 * insertion shows nothing — IDEA shows just the toolbar there too.
 */
export function buildCard(
  block: ChangeBlock,
  base: string[],
  now: string[],
): MarkerCard {
  const state: MarkerCard["state"] =
    block.baseCount > 0 && block.curCount > 0
      ? "modified"
      : block.curCount > 0
        ? "added"
        : "deleted";

  const lines: CardLine[] = [];
  if (state === "modified") {
    const paired = Math.min(block.baseCount, block.curCount);
    for (let i = 0; i < paired; i++) {
      const oldLine = base[block.baseStart + i];
      const newLine = now[block.curStart + i];
      if (i > 0 && lines.length < MAX_PREVIEW_LINES) {
        lines.push({ tone: "context", text: "" });
      }
      pushWordDiff(lines, oldLine, newLine);
    }
    // A block can be unbalanced (2 removed, 3 added): the leftovers have no
    // partner and read as a plain removal/insertion of their own.
    for (let i = paired; i < block.baseCount; i++) {
      pushTone(lines, "removed", base[block.baseStart + i]);
    }
    for (let i = paired; i < block.curCount; i++) {
      pushTone(lines, "added", now[block.curStart + i]);
    }
  } else if (state === "deleted") {
    for (let i = 0; i < block.baseCount; i++) {
      pushTone(lines, "removed", base[block.baseStart + i]);
    }
  }

  return {
    state,
    from: block.curStart + 1,
    to: block.curStart + Math.max(block.curCount, 1),
    lines: trimPreview(lines),
    actions: ["prev", "next", "rollback", "showDiff", "copy", "commit"],
  };
}

/** The empty preview an insertion gets: nothing to show before the toolbar. */
function pushTone(lines: CardLine[], tone: CardLineTone, text: string): void {
  if (lines.length >= MAX_PREVIEW_LINES) return;
  lines.push({ tone, text });
}

/** Word-diff one replaced pair into a removed and an added card line. */
function pushWordDiff(
  lines: CardLine[],
  oldLine: string,
  newLine: string,
): void {
  if (oldLine === newLine) {
    pushTone(lines, "context", oldLine);
    return;
  }
  if (lines.length + 2 > MAX_PREVIEW_LINES) return;
  const parts = diffWordsWithSpace(oldLine, newLine);
  lines.push({
    tone: "removed",
    text: oldLine,
    pieces: parts
      .filter((part) => part.removed || !part.added)
      .map((part) => ({ text: part.value, changed: Boolean(part.removed) })),
  });
  lines.push({
    tone: "added",
    text: newLine,
    pieces: parts
      .filter((part) => part.added || !part.removed)
      .map((part) => ({ text: part.value, changed: Boolean(part.added) })),
  });
}

/**
 * Cut the preview from both ends around the middle so the first and last
 * changes stay visible, and note nothing — the card stays silent about the
 * trim, matching how tight the IDEA card is.
 */
function trimPreview(lines: CardLine[]): CardLine[] {
  if (lines.length <= MAX_PREVIEW_LINES) return lines;
  const half = Math.floor(MAX_PREVIEW_LINES / 2);
  return [
    ...lines.slice(0, half),
    { tone: "context", text: "…" },
    ...lines.slice(lines.length - half),
  ];
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
