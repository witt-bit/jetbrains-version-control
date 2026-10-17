import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { MarkerCard } from "./markerCard";

/**
 * Turns a `MarkerCard` into the markdown carried by the gutter-marker hover
 * cards and the floating popup. The preview is a fenced code block, so the
 * editor tokenizes it with the file's own grammar and font and the card reads
 * like the code it came from; the buttons are ordinary command links.
 */

/** The command-link label for a card action. */
const ACTION_LABELS: Record<MarkerCard["actions"][number], string> = {
  prev: "Prev Change",
  next: "Next Change",
  rollback: "Rollback Lines",
  showDiff: "Show Diff for Lines",
  copy: "Copy",
};

const COMMANDS: Record<MarkerCard["actions"][number], string> = {
  prev: "jgc.marker.prevChange",
  next: "jgc.marker.nextChange",
  rollback: "jgc.marker.rollbackLines",
  showDiff: "jgc.marker.showDiffForLines",
  copy: "jgc.marker.copyBlock",
};

const STATE_LABELS: Record<MarkerCard["state"], string> = {
  added: "Added",
  modified: "Modified",
  deleted: "Deleted",
};

/** The git-decoration theme token that colors each state, as in the gutter. */
const STATE_COLORS: Record<MarkerCard["state"], string> = {
  added: "addedResourceForeground",
  modified: "modifiedResourceForeground",
  deleted: "deletedResourceForeground",
};

/**
 * Inline SVG fallbacks for the card's action icons, 16×16, in a neutral gray
 * that reads on both themes — used only if the bundled JetBrains icons in
 * `images/icons` could not be loaded.
 */
const ICON_FALLBACKS: Record<MarkerCard["actions"][number], string> = {
  prev: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#9aa0a6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 3h9M8 12.5V6M4.5 9.5L8 6l3.5 3.5"/></svg>',
  next: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#9aa0a6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 13h9M8 3.5V10M4.5 6.5L8 10l3.5-3.5"/></svg>',
  rollback:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#9aa0a6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 3v4h4"/><path d="M3.7 7a5 5 0 1 1 .5 4"/></svg>',
  showDiff:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#9aa0a6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2.5" width="12" height="11" rx="1"/><path d="M8 2.5v11"/></svg>',
  copy: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#9aa0a6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8.5" height="8.5" rx="1.2"/><path d="M10.5 3.5v-.8A1.2 1.2 0 0 0 9.3 1.5h-6A1.3 1.3 0 0 0 2 2.8v6a1.2 1.2 0 0 0 1.2 1.2h.8"/></svg>',
};

/** Bundled JetBrains icons per action, light and dark in one file pair. */
const ICON_FILES: Record<MarkerCard["actions"][number], string> = {
  prev: "previous-change",
  next: "next-change",
  rollback: "rollback",
  showDiff: "diff",
  copy: "copy",
};

/** Rendered as data URIs so the icons stay self-contained. */
type IconPair = { light: string; dark: string };

const ICONS: Partial<Record<MarkerCard["actions"][number], IconPair>> = {};

/**
 * Read the bundled icon files once at activation. Markdown images in editor
 * widgets render data URIs only, so the file contents are inlined on load.
 */
export function loadMarkerIcons(extensionPath: string): void {
  for (const [action, name] of Object.entries(ICON_FILES)) {
    try {
      const dir = path.join(extensionPath, "images", "icons");
      const read = (file: string): string =>
        fs.readFileSync(path.join(dir, file)).toString("base64");
      ICONS[action as MarkerCard["actions"][number]] = {
        light: `data:image/svg+xml;base64,${read(`${name}.svg`)}`,
        dark: `data:image/svg+xml;base64,${read(`${name}_dark.svg`)}`,
      };
    } catch (error) {
      console.error("loading marker icons failed", error);
    }
  }
}

/** The icon data URI for the active theme, falling back to the inline set. */
function iconFor(action: MarkerCard["actions"][number]): string {
  const loaded = ICONS[action];
  const kind = vscode.window.activeColorTheme.kind;
  const lightish =
    kind === vscode.ColorThemeKind.Light ||
    kind === vscode.ColorThemeKind.HighContrastLight;
  if (loaded) return lightish ? loaded.light : loaded.dark;
  return iconUri(ICON_FALLBACKS[action]);
}

/** A self-contained URI for one icon SVG. */
function iconUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * The top row of the card: each action is an icon-only button, i.e. an
 * image nested inside a command link, so the whole icon is clickable. The
 * groups are separated by a hairline bar, the way IDEA splits its toolbar.
 */
function iconRow(card: MarkerCard, args: string): string {
  return card.actions
    .map(
      (action) =>
        `[![${ACTION_LABELS[action]}](${iconFor(action)})](command:${COMMANDS[action]}?${args})`,
    )
    .join("&#8195;");
}

/** The longest backtick run in the code, so the fence outruns it. */
function fenceFor(lines: string[]): string {
  let longest = 0;
  for (const line of lines) {
    for (const run of line.match(/`+/g) ?? []) {
      if (run.length > longest) longest = run.length;
    }
  }
  return "`".repeat(Math.max(3, longest + 1));
}

/**
 * The code preview as a fenced block. The editor tokenizes it with the file's
 * own grammar and font, so the card reads like the code it came from.
 */
function codeBlock(lines: string[], languageId: string): string {
  const fence = fenceFor(lines);
  return `${fence}${languageId}\n${lines.join("\n")}\n${fence}`;
}

/**
 * The preview below the toolbar. An insertion repeats nothing — its lines sit
 * right there in the editor — while a modification or deletion shows the code
 * as a highlighted block, the way the file renders it.
 */
function preview(card: MarkerCard): string {
  if (card.state === "added") return "";
  const blocks: string[] = [];
  if (card.removed.length > 0) {
    blocks.push(codeBlock(card.removed, card.languageId));
  }
  if (card.state === "modified" && card.added.length > 0) {
    blocks.push(codeBlock(card.added, card.languageId));
  }
  return blocks.length > 0 ? `\n\n${blocks.join("\n\n")}` : "";
}

/**
 * The hover for one change block: an icon-button toolbar, then the state and
 * line span, then a highlighted preview of the code (nothing for insertions,
 * like IDEA's card).
 */
export function hoverFor(
  card: MarkerCard,
  uri: vscode.Uri,
): vscode.MarkdownString {
  const span =
    card.to > card.from ? `lines ${card.from}–${card.to}` : `line ${card.from}`;
  const title =
    `<span style="color:var(--vscode-gitDecoration-${STATE_COLORS[card.state]});">${STATE_LABELS[card.state]}</span>` +
    ` · ${span}${card.state === "deleted" ? " (in HEAD)" : ""}`;

  const args = encodeURIComponent(
    JSON.stringify([card.from - 1, uri.toString()]),
  );

  const md = new vscode.MarkdownString(
    `${iconRow(card, args)}\n\n${title}${preview(card)}`,
  );
  md.isTrusted = true;
  md.supportHtml = true;
  return md;
}
