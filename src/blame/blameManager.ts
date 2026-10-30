import * as path from "node:path";
import * as vscode from "vscode";
import { blameBoxStyle, blankBlameBox } from "../decorations/box";
import type { GitService } from "../git/gitService";
import type { BlameLine } from "../git/types";
import type { MessageRouter } from "../messages/messageRouter";
import { GIT_BRAINS_SCHEME } from "../views/gitContentProvider";

interface BlameState {
  decorationType: vscode.TextEditorDecorationType;
  /** working-tree line number (1-based) → full commit hash (uncommitted lines omitted) */
  lineToHash: Map<number, string>;
  /** Pre-rendered options for every blamed line, filtered per display mode */
  allOptions: vscode.DecorationOptions[];
  maxWidth: number;
  /**
   * Document lines as of the moment the annotation was built. Diffed against
   * the live document to tell which lines still carry a label: the annotation
   * only decorates non-empty lines, and lines added since carry nothing.
   */
  annotatedLines: string[];
  /** Whether the full-line annotation is currently applied (skip redundant renders) */
  lastRenderedLine: number;
}

/** author = color per author; order = by commit age (IDEA-like); hide = fixed fg */
type ColorMode = "author" | "order" | "hide";
type NameStyle = "initials" | "lastName" | "firstName" | "fullName" | "email";
type ColumnId = "revision" | "date" | "author" | "commitNumber";

const COLUMN_ORDER: readonly ColumnId[] = [
  "revision",
  "date",
  "author",
  "commitNumber",
];

interface BlameConfig {
  columns: ColumnId[];
  colorMode: ColorMode;
  nameStyle: NameStyle;
  dateFormat: string;
  colorLight: string;
  colorDark: string;
}

interface GitServiceEntry {
  root: string;
  service: GitService;
}

/**
 * Virtual-document `ref` values that name content no git revision holds, so
 * `git blame` cannot run against them: the empty placeholder for added /
 * deleted diff sides, the index (`:0`), and the shelf-side content keys.
 */
const NON_BLAMABLE_REFS = new Set([
  "empty",
  ":0",
  "base",
  "modified",
  "external",
]);

// Heat-map gradient stops by commit age (t: 0 = newest, 1 = oldest),
// IDEA-annotate style: recent commits pop out, old ones fade away.
type Rgb = readonly [number, number, number];
interface HeatStop {
  t: number;
  c: Rgb;
}
const HEAT_STOPS_DARK: HeatStop[] = [
  { t: 0, c: [92, 155, 255] }, // vivid blue
  { t: 0.5, c: [126, 231, 135] }, // green
  { t: 1, c: [139, 148, 158] }, // gray
];
const HEAT_STOPS_LIGHT: HeatStop[] = [
  { t: 0, c: [5, 80, 174] }, // strong blue
  { t: 0.5, c: [26, 127, 55] }, // green
  { t: 1, c: [110, 119, 129] }, // gray
];

function lerp(a: number, b: number, ratio: number): number {
  return Math.round(a + (b - a) * ratio);
}

/**
 * Build a colorizer mapping commit timestamps to hex colors.
 * t is normalized between the newest and oldest commit in the file.
 */
function createHeatColorizer(
  lines: BlameLine[],
  darkTheme: boolean,
): (line: BlameLine) => string {
  const stops = darkTheme ? HEAT_STOPS_DARK : HEAT_STOPS_LIGHT;

  let minTime = Number.POSITIVE_INFINITY;
  let maxTime = Number.NEGATIVE_INFINITY;
  for (const line of lines) {
    if (line.uncommitted || line.authorTime <= 0) continue;
    if (line.authorTime < minTime) minTime = line.authorTime;
    if (line.authorTime > maxTime) maxTime = line.authorTime;
  }
  const span = maxTime - minTime;

  return (line) => {
    if (
      line.uncommitted ||
      line.authorTime <= 0 ||
      !Number.isFinite(span) ||
      span === 0
    ) {
      // Uncommitted / degenerate: dimmest tone
      const fallback = stops[stops.length - 1].c;
      return rgbToHex(fallback);
    }
    const t = (maxTime - line.authorTime) / span;
    let upper = 0;
    while (upper < stops.length - 2 && t > stops[upper + 1].t) {
      upper++;
    }
    const left = stops[upper];
    const right = stops[upper + 1] ?? left;
    const segRatio = right.t === left.t ? 0 : (t - left.t) / (right.t - left.t);
    return rgbToHex([
      lerp(left.c[0], right.c[0], segRatio),
      lerp(left.c[1], right.c[1], segRatio),
      lerp(left.c[2], right.c[2], segRatio),
    ]);
  };
}

function rgbToHex(rgb: Rgb): string {
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Convert `#rrggbb` to `rgba(...)` so commit backgrounds can stay subtle. */
function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) {
    return hex;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return rgbToHex([f(0), f(8), f(4)]);
}

/** Distinct color per author, stable via golden-angle hue distribution */
function createAuthorColorizer(
  lines: BlameLine[],
  darkTheme: boolean,
): (line: BlameLine) => string {
  const authorIndex = new Map<string, number>();
  for (const line of lines) {
    if (line.uncommitted) continue;
    const key = line.authorEmail || line.authorName;
    if (key && !authorIndex.has(key)) {
      authorIndex.set(key, authorIndex.size);
    }
  }
  return (line) => {
    if (line.uncommitted) {
      return darkTheme ? "#8b949e" : "#6e7781";
    }
    const key = line.authorEmail || line.authorName;
    const idx = (authorIndex.get(key) ?? 0) * 137.508;
    return hslToHex(idx % 360, 0.6, darkTheme ? 0.62 : 0.4);
  };
}

/** Format unix seconds with yyyy/MM/dd/HH/mm/ss tokens */
export function formatBlameDate(unixSeconds: number, pattern: string): string {
  const date = new Date(unixSeconds * 1000);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const p2 = (n: number) => String(n).padStart(2, "0");
  return pattern
    .replace(/yyyy/g, String(date.getFullYear()))
    .replace(/MM/g, p2(date.getMonth() + 1))
    .replace(/dd/g, p2(date.getDate()))
    .replace(/HH/g, p2(date.getHours()))
    .replace(/mm/g, p2(date.getMinutes()))
    .replace(/ss/g, p2(date.getSeconds()));
}

function renderAuthorName(line: BlameLine, style: NameStyle): string {
  const tokens = line.authorName.split(/\s+/).filter(Boolean);
  switch (style) {
    case "initials":
      return tokens.map((t) => t[0].toUpperCase()).join("");
    case "lastName":
      return tokens[tokens.length - 1] ?? "";
    case "firstName":
      return tokens[0] ?? "";
    case "email":
      return line.authorEmail || line.authorName;
    default:
      return line.authorName;
  }
}

function readConfig(): BlameConfig {
  const cfg = vscode.workspace.getConfiguration("jgc.blame");
  const rawColumns = cfg.get<ColumnId[]>("columns", ["date", "author"]);
  const columns = COLUMN_ORDER.filter((c) => rawColumns.includes(c));
  return {
    columns: columns.length > 0 ? columns : ["date", "author"],
    colorMode: cfg.get<ColorMode>("colorMode", "order"),
    nameStyle: cfg.get<NameStyle>("nameStyle", "fullName"),
    dateFormat: cfg.get<string>("dateFormat", "yyyy-MM-dd HH:mm"),
    colorLight: cfg.get<string>("foregroundColorLight", "#57606a"),
    colorDark: cfg.get<string>("foregroundColorDark", "#8b949e"),
  };
}

/**
 * Box that reserves the blame column on a line that gets no label.
 *
 * The label is what pushes the line change markers past the blame column, so
 * a line rendered without one would let its marker slide left out of alignment
 * with the surrounding rows. Any line the annotation leaves bare qualifies:
 * empty when it ran, or added since.
 *
 * The metrics are the label boxes', so a marker placed after either box lands
 * on the same column.
 */
function blankPadBox(
  maxWidth: number,
): vscode.ThemableDecorationAttachmentRenderOptions {
  return blankBlameBox(maxWidth);
}

/**
 * WebStorm-style inline blame annotations ("Annotate with Git Blame").
 *
 * Renders `hash date author` before column 0 of every line. Clicking the
 * annotation region (mouse click landing at character 0) jumps to the
 * Git Log graph panel and selects the commit.
 */
export class BlameManager implements vscode.Disposable {
  private readonly states = new Map<string, BlameState>();
  private readonly disposables: vscode.Disposable[] = [];
  /** hash → commit number (1 = newest); rebuilt per annotate() */
  private commitNumberByHash = new Map<string, number>();
  /** The editor of the most recent selection event, across all editors. */
  private lastSelectionEditor: vscode.TextEditor | undefined;

  constructor(
    private readonly services: GitServiceEntry[],
    private readonly messageRouter: MessageRouter,
    /**
     * Fired after blame decorations are (re)written or removed. Marker
     * attachments render in creation order, so the marker layer must
     * re-create its own attachments afterwards to stay to the right of the
     * blame column.
     */
    private readonly onDecorationsChanged?: () => void,
  ) {}

  register(): void {
    this.disposables.push(
      // ONE global listener delegated to annotated editors only
      vscode.window.onDidChangeTextEditorSelection((e) => {
        this.handleSelectionChange(e);
      }),
      // Re-render when switching between editors
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          const state = this.states.get(editor.document.uri.toString());
          if (state) {
            // Re-render decorations when switching to a blamed file
            this.renderDecorations(editor, state, true);
          }
        }
      }),
      // blame of the working tree changes on save; refresh labels
      vscode.workspace.onDidSaveTextDocument((doc) => {
        void this.refreshIfAnnotated(doc.uri);
      }),
      vscode.workspace.onDidCloseTextDocument((doc) => {
        this.removeState(doc.uri);
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("jgc.blame")) {
          void this.refreshAll();
        }
      }),
      // order/author colors depend on the active theme kind
      vscode.window.onDidChangeActiveColorTheme(() => {
        // Backgrounds on empty blame placeholders also depend on theme.
        void this.refreshAll();
      }),
    );
  }

  async annotate(editor?: vscode.TextEditor): Promise<void> {
    // In a diff editor `activeTextEditor` does not reliably follow the pane
    // the user interacted with (right-clicking the original side's line
    // numbers often leaves the modified side active), which made both
    // columns' menu entries drive the same side. The editor of the last
    // selection event is the one the user is actually looking at.
    const target =
      editor ?? this.lastSelectionEditor ?? vscode.window.activeTextEditor;
    if (!target || !this.isSupported(target.document.uri)) {
      return;
    }
    const entry = this.resolveService(target.document.uri);
    if (!entry) {
      void vscode.window.showInformationMessage(
        "JGC: File is outside any workspace folder.",
      );
      return;
    }

    const revision = this.revisionOf(target.document.uri);
    if (revision === null) {
      void vscode.window.showInformationMessage(
        "JGC: This side of the diff has no git revision to blame.",
      );
      return;
    }

    const relativePath =
      target.document.uri.scheme === "file"
        ? path.relative(entry.root, target.document.uri.fsPath)
        : target.document.uri.path.replace(/^\//, "");

    let blameLines: BlameLine[];
    try {
      blameLines =
        revision === undefined
          ? await entry.service.blame(relativePath)
          : await entry.service.blameAt(revision, relativePath);
    } catch {
      void vscode.window.showInformationMessage(
        "JGC: File has no Git blame history (untracked, ignored, or not in this revision).",
      );
      return;
    }
    if (blameLines.length === 0) {
      return;
    }

    // Reuse the existing decoration type when re-annotating (save, theme
    // change, config change). Attachment order follows type creation order, so
    // recreating it here would move the blame label to the right of the line
    // change markers on every save. Only the per-line options are rebuilt.
    const existing = this.states.get(target.document.uri.toString());

    const config = readConfig();
    const labels = blameLines.map((line) => this.renderLabel(line, config));
    const maxWidth = Math.max(...labels.map((label) => label.length));

    // Commit numbers: newest commit = 1, oldest = N
    const commitNumberByHash = new Map<string, number>();
    const uniqueCommits = [
      ...new Map(
        blameLines
          .filter((l) => !l.uncommitted && l.authorTime > 0)
          .map((l) => [l.hash, l] as const),
      ).values(),
    ].sort((a, b) => b.authorTime - a.authorTime);
    for (const [i, c] of uniqueCommits.entries()) {
      commitNumberByHash.set(c.hash, i + 1);
    }
    this.commitNumberByHash = commitNumberByHash;

    const darkTheme =
      vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
    const colorizer =
      config.colorMode === "order"
        ? createHeatColorizer(blameLines, darkTheme)
        : config.colorMode === "author"
          ? createAuthorColorizer(blameLines, darkTheme)
          : null;

    // Reusing the type is what keeps the marker/blame order stable across
    // saves; a fresh type would sort after the marker types and flip them.
    const decorationType =
      existing?.decorationType ??
      vscode.window.createTextEditorDecorationType({
        before: {},
        ...(colorizer
          ? {}
          : {
              light: { before: { color: config.colorLight } },
              dark: { before: { color: config.colorDark } },
            }),
      });

    // Build decoration options for ALL lines to ensure consistent left alignment
    const allOptions: vscode.DecorationOptions[] = [];
    const lineToHash = new Map<number, string>();

    // Create a map for quick lookup of blame info by line number
    const blameMap = new Map<number, BlameLine>();
    for (let i = 0; i < blameLines.length; i++) {
      const line = blameLines[i];
      if (line.lineNumber <= target.document.lineCount) {
        blameMap.set(line.lineNumber, line);
        if (!line.uncommitted) {
          lineToHash.set(line.lineNumber, line.hash);
        }
      }
    }
    // 1-based line number → index in `blameLines`, so the per-document loop
    // below stays linear instead of re-scanning the blame array per line.
    const labelIndexByLine = new Map<number, number>();
    for (const [index, line] of blameLines.entries()) {
      if (!labelIndexByLine.has(line.lineNumber)) {
        labelIndexByLine.set(line.lineNumber, index);
      }
    }

    // Generate decorations for ALL lines in the document
    const annotatedLines: string[] = [];
    const totalLines = target.document.lineCount;
    for (let lineNum = 1; lineNum <= totalLines; lineNum++) {
      const line = target.document.lineAt(lineNum - 1);
      annotatedLines.push(line.text);
      const blameLine = blameMap.get(lineNum);

      // An empty line gets no attachment at all: a `before` attachment on a
      // line without text is a position the caret can land on. The marker
      // layer pads such lines instead (see `padBoxFor`) so their change
      // markers still line up with the labelled rows.
      if (line.text.length === 0) {
        continue;
      }

      if (blameLine && blameMap.has(lineNum)) {
        // Line has blame info - show blame text
        const labelIndex = labelIndexByLine.get(lineNum) ?? -1;
        if (labelIndex >= 0) {
          const hover = blameLine.uncommitted
            ? undefined
            : new vscode.MarkdownString(
                [
                  `**${blameLine.shortHash}** ${blameLine.authorName}`,
                  blameLine.summary ?? "",
                ]
                  .filter(Boolean)
                  .join("\n\n"),
              );
          const textColor = blameLine.uncommitted
            ? darkTheme
              ? "#8b949e"
              : "#6e7781"
            : colorizer
              ? colorizer(blameLine)
              : darkTheme
                ? config.colorDark
                : config.colorLight;
          const backgroundColor = blameLine.uncommitted
            ? darkTheme
              ? "#8b949e22"
              : "#6e778122"
            : colorizer
              ? withAlpha(textColor, darkTheme ? 0.16 : 0.18)
              : darkTheme
                ? "#1b2027"
                : "#eef1f5";
          allOptions.push({
            range: new vscode.Range(line.range.start, line.range.start),
            ...(hover ? { hoverMessage: hover } : {}),
            renderOptions: {
              before: {
                // A line without history (added / uncommitted) keeps the label's
                // box metrics but shows no text, so the column still lines up.
                ...(blameLine.uncommitted
                  ? blankBlameBox(maxWidth)
                  : { contentText: labels[labelIndex].padEnd(maxWidth) }),
                color: textColor,
                backgroundColor,
                fontStyle: "italic",
                textDecoration: blameBoxStyle(maxWidth),
              },
            },
          });
        }
      } else {
        // Line has no blame history: reserve the column with an empty box, so
        // it keeps the same width as the labelled rows.
        allOptions.push({
          range: new vscode.Range(line.range.start, line.range.start),
          renderOptions: { before: blankBlameBox(maxWidth) },
        });
      }
    }

    const state: BlameState = {
      decorationType,
      lineToHash,
      allOptions,
      maxWidth,
      annotatedLines,
      lastRenderedLine: -1,
    };
    this.states.set(target.document.uri.toString(), state);
    this.renderDecorations(target, state);
    this.onDecorationsChanged?.();
  }

  clear(editor?: vscode.TextEditor): void {
    const target =
      editor ?? this.lastSelectionEditor ?? vscode.window.activeTextEditor;
    if (!target) {
      if (this.states.size === 0) {
        void vscode.window.showInformationMessage(
          "JGC: No active annotation to clear.",
        );
      }
      return;
    }
    if (this.removeState(target.document.uri)) {
      this.onDecorationsChanged?.();
    } else {
      void vscode.window.showInformationMessage(
        "JGC: No active annotation to clear.",
      );
    }
  }

  /**
   * Annotate the given editor if it has no blame yet, clear it if it does.
   * State is per document URI, so the two sides of a diff editor — and every
   * other editor — toggle independently; annotating one side never touches
   * another.
   */
  async toggle(editor?: vscode.TextEditor): Promise<void> {
    const target =
      editor ?? this.lastSelectionEditor ?? vscode.window.activeTextEditor;
    if (!target) {
      return;
    }
    if (this.states.has(target.document.uri.toString())) {
      this.clear(target);
      return;
    }
    await this.annotate(target);
  }

  /**
   * Everything the marker layer needs to reserve the blame column on the lines
   * the annotation leaves bare, or undefined when the document is not
   * annotated. `unlabeled[i]` marks a line without a label: it was empty when
   * the annotation was built, or it was added since. The marker layer draws
   * `box` in front of its own marker for those lines, so every marker stays in
   * the column the labels reserve.
   */
  async padFor(
    uri: vscode.Uri,
    doc: vscode.TextDocument,
  ): Promise<
    | {
        box: vscode.ThemableDecorationAttachmentRenderOptions;
        unlabeled: boolean[];
      }
    | undefined
  > {
    const state = this.states.get(uri.toString());
    if (!state) {
      return undefined;
    }

    const current: string[] = [];
    for (let i = 0; i < doc.lineCount; i++) {
      current.push(doc.lineAt(i).text);
    }

    // Which snapshot lines carry an attachment right now. The annotation
    // paints every non-empty line of its snapshot.
    const isPainted = (snapshotLine: number): boolean =>
      state.annotatedLines[snapshotLine].length > 0;

    // The annotation attached a box to every non-empty line of its snapshot;
    // lines it skipped and lines created since carry nothing. Matching the live
    // document against the snapshot line by line keeps shifted and edited lines
    // labelled, so only genuinely bare lines need a pad.
    const unlabeled = new Array<boolean>(current.length).fill(true);
    const { diffIndices } = await import("node-diff3");
    let oldPos = 0;
    let newPos = 0;
    for (const chunk of diffIndices(state.annotatedLines, current)) {
      const [oldStart, oldCount] = chunk.buffer1;
      const [newStart, newCount] = chunk.buffer2;
      // Unchanged lines ahead of the chunk keep their label if the snapshot
      // line had one.
      while (oldPos < oldStart && newPos < newStart) {
        unlabeled[newPos] = !isPainted(oldPos);
        oldPos++;
        newPos++;
      }
      // Within a chunk the lines pair up by position; a painted snapshot line
      // means the line kept its label. Extra live lines stay unlabeled.
      const paired = Math.min(oldCount, newCount);
      for (let i = 0; i < paired; i++) {
        unlabeled[newStart + i] = !isPainted(oldStart + i);
      }
      oldPos = oldStart + oldCount;
      newPos = newStart + newCount;
    }
    while (oldPos < state.annotatedLines.length && newPos < current.length) {
      unlabeled[newPos] = !isPainted(oldPos);
      oldPos++;
      newPos++;
    }

    return { box: blankPadBox(state.maxWidth), unlabeled };
  }

  handleSelectionChange(e: vscode.TextEditorSelectionChangeEvent): void {
    // The editor the user last interacted with drives the annotate/clear
    // commands, so the line-number menu acts on the column it was opened
    // from — including both sides of a diff editor.
    this.lastSelectionEditor = e.textEditor;
    const state = this.states.get(e.textEditor.document.uri.toString());

    // Only real mouse clicks landing at character 0 count as "annotation click"
    if (e.kind !== vscode.TextEditorSelectionChangeKind.Mouse) return;
    const position = e.selections[0]?.active;
    if (!position || position.character !== 0) return;

    const hash = state?.lineToHash.get(position.line + 1);
    if (!hash) return;
    void this.jumpToGraph(hash);
  }

  dispose(): void {
    for (const state of this.states.values()) {
      state.decorationType.dispose();
    }
    this.states.clear();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
  }

  /** Re-apply the full-line annotation; no longer cursor-dependent. */
  private renderDecorations(
    editor: vscode.TextEditor,
    state: BlameState,
    forceRender = false,
  ): void {
    if (forceRender || state.lastRenderedLine === -1) {
      state.lastRenderedLine = -2; // mark as fully rendered
      editor.setDecorations(state.decorationType, state.allOptions);
    }
  }

  private async jumpToGraph(hash: string): Promise<void> {
    // Ensure the Git Log panel is visible before sending the event
    await vscode.commands.executeCommand("git-brains.gitLog.focus");
    this.messageRouter.broadcastEvent("focusCommitInGraph", { hash });
  }

  private async refreshIfAnnotated(uri: vscode.Uri): Promise<void> {
    if (!this.states.has(uri.toString())) {
      return;
    }
    const editor = vscode.window.visibleTextEditors.find(
      (e) => e.document.uri.toString() === uri.toString(),
    );
    if (editor) {
      await this.annotate(editor);
    }
  }

  private async refreshAll(): Promise<void> {
    for (const editor of vscode.window.visibleTextEditors) {
      if (this.states.has(editor.document.uri.toString())) {
        await this.annotate(editor);
      }
    }
  }

  /** Returns true when a state existed and was removed */
  private removeState(uri: vscode.Uri): boolean {
    const key = uri.toString();
    const state = this.states.get(key);
    if (!state) {
      return false;
    }
    state.decorationType.dispose();
    this.states.delete(key);
    return true;
  }

  private renderLabel(line: BlameLine, config: BlameConfig): string {
    if (line.uncommitted) {
      // New (uncommitted) lines have no revision to show; leave the label empty
      // instead of printing a placeholder.
      return "";
    }
    const parts: string[] = [];
    const commitNumber = this.commitNumberByHash.get(line.hash);
    for (const col of config.columns) {
      switch (col) {
        case "revision":
          parts.push(line.shortHash);
          break;
        case "date":
          if (line.authorTime > 0) {
            parts.push(formatBlameDate(line.authorTime, config.dateFormat));
          }
          break;
        case "author": {
          const name = renderAuthorName(line, config.nameStyle);
          if (name) {
            parts.push(name);
          }
          break;
        }
        case "commitNumber":
          if (commitNumber !== undefined) {
            parts.push(String(commitNumber));
          }
          break;
      }
    }
    return parts.join(" ");
  }

  private isSupported(uri: vscode.Uri): boolean {
    return uri.scheme === "file" || uri.scheme === GIT_BRAINS_SCHEME;
  }

  /**
   * The git revision whose content a document shows.
   *
   * - `undefined` — the working tree (`file:` scheme): blame runs against the
   *   on-disk file so line numbers match editor lines.
   * - a revision string — a virtual `git-brains` document fetched from
   *   `git show <ref>:<path>`: blame runs against that revision, whose line
   *   numbers are the ones this side displays.
   * - `null` — a virtual document with no git revision behind it (the empty
   *   placeholder, the index, shelf-side content): nothing to blame.
   */
  private revisionOf(uri: vscode.Uri): string | null | undefined {
    if (uri.scheme === "file") {
      return undefined;
    }
    if (uri.scheme !== GIT_BRAINS_SCHEME) {
      return null;
    }
    const ref = new URLSearchParams(uri.query).get("ref") ?? "";
    if (!ref || NON_BLAMABLE_REFS.has(ref)) {
      return null;
    }
    return ref;
  }

  private resolveService(uri: vscode.Uri): GitServiceEntry | null {
    const fsPath = uri.fsPath;
    const match = this.services.find(
      (entry) =>
        fsPath === entry.root ||
        fsPath.startsWith(
          entry.root.endsWith(path.sep) ? entry.root : entry.root + path.sep,
        ),
    );
    return match ?? this.services[0] ?? null;
  }
}
