import * as vscode from "vscode";
import type { CardLine, MarkerCard } from "./markerCard";

/**
 * Turns a `MarkerCard` into the hover markdown carried by the gutter-marker
 * decorations. The preview uses the editor's own diff theme colors so it reads
 * like a diff without being one; the buttons are ordinary command links.
 */

/** Escape a line of code for HTML rendering inside the hover. */
function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function lineHtml(line: CardLine): string {
  const bg =
    line.tone === "removed"
      ? "var(--vscode-diffEditor-removedLineBackground)"
      : line.tone === "added"
        ? "var(--vscode-diffEditor-addedLineBackground)"
        : "transparent";
  const inner = line.pieces
    ? line.pieces
        .map((piece) =>
          piece.changed
            ? `<span style="background-color:${
                line.tone === "removed"
                  ? "var(--vscode-diffEditor-removedTextBackground)"
                  : "var(--vscode-diffEditor-addedTextBackground)"
              };border-radius:2px;">${esc(piece.text)}</span>`
            : esc(piece.text),
        )
        .join("")
    : esc(line.text);
  // `white-space: pre-wrap` keeps the code's own spacing; the invisible
  // `&#8203;` placeholder gives empty lines their height.
  return `<div style="background-color:${bg};white-space:pre-wrap;">${inner || "&#8203;"}</div>`;
}

/** The command-link label for a card action. */
const ACTION_LABELS: Record<MarkerCard["actions"][number], string> = {
  prev: "Prev Change",
  next: "Next Change",
  rollback: "Rollback Lines",
  showDiff: "Show Diff for Lines",
  copy: "Copy",
  commit: "Commit this change",
};

const COMMANDS: Record<MarkerCard["actions"][number], string> = {
  prev: "jgc.marker.prevChange",
  next: "jgc.marker.nextChange",
  rollback: "jgc.marker.rollbackLines",
  showDiff: "jgc.marker.showDiffForLines",
  copy: "jgc.marker.copyBlock",
  commit: "jgc.marker.commitBlock",
};

const STATE_LABELS: Record<MarkerCard["state"], string> = {
  added: "Added",
  modified: "Modified",
  deleted: "Deleted",
};

/**
 * The hover for one change block: state, line span, a word-level diff preview
 * (nothing for insertions, like IDEA's card) and the action row.
 */
export function hoverFor(
  card: MarkerCard,
  uri: vscode.Uri,
): vscode.MarkdownString {
  const span =
    card.to > card.from ? `lines ${card.from}–${card.to}` : `line ${card.from}`;
  const title = `**${STATE_LABELS[card.state]}** · ${span}${
    card.state === "deleted" ? " (in HEAD)" : ""
  }`;

  const preview = card.lines.map(lineHtml).join("");

  const args = encodeURIComponent(
    JSON.stringify([card.from - 1, uri.toString()]),
  );
  const buttons = card.actions
    .map(
      (action) =>
        `[${ACTION_LABELS[action]}](command:${COMMANDS[action]}?${args})`,
    )
    .join("&nbsp;&nbsp; ");

  const md = new vscode.MarkdownString(
    `${title}\n\n<div style="font-family:var(--vscode-editor-font-family,monospace);font-size:0.9em;margin:4px 0;">${preview}</div>\n\n${buttons}`,
  );
  md.isTrusted = true;
  md.supportHtml = true;
  return md;
}
