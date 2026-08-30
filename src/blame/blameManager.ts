import * as path from "node:path";
import * as vscode from "vscode";
import type { GitService } from "../git/gitService";
import type { BlameLine } from "../git/types";
import type { MessageRouter } from "../messages/messageRouter";

interface BlameState {
  decorationType: vscode.TextEditorDecorationType;
  /** working-tree line number (1-based) → full commit hash (uncommitted lines omitted) */
  lineToHash: Map<number, string>;
  /** Pre-rendered options for every blamed line, filtered per display mode */
  allOptions: vscode.DecorationOptions[];
  maxWidth: number;
  /** Last line around which decorations were rendered (skip redundant renders) */
  lastRenderedLine: number;
}

type DisplayMode = "all" | "cursor" | "around";
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
  displayMode: DisplayMode;
  aroundLines: number;
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

const CONTEXT_BLAME_ACTIVE = "jgc.blameActive";

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
function formatBlameDate(unixSeconds: number, pattern: string): string {
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
    displayMode: cfg.get<DisplayMode>("displayMode", "all"),
    aroundLines: Math.max(0, cfg.get<number>("aroundLines", 3)),
    columns: columns.length > 0 ? columns : ["date", "author"],
    colorMode: cfg.get<ColorMode>("colorMode", "order"),
    nameStyle: cfg.get<NameStyle>("nameStyle", "fullName"),
    dateFormat: cfg.get<string>("dateFormat", "yyyy-MM-dd HH:mm"),
    colorLight: cfg.get<string>("foregroundColorLight", "#57606a"),
    colorDark: cfg.get<string>("foregroundColorDark", "#8b949e"),
  };
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

  constructor(
    private readonly services: GitServiceEntry[],
    private readonly messageRouter: MessageRouter,
  ) {}

  register(): void {
    this.disposables.push(
      // ONE global listener delegated to annotated editors only
      vscode.window.onDidChangeTextEditorSelection((e) => {
        this.handleSelectionChange(e);
      }),
      // Update blameActive context and re-render when switching between editors
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          const state = this.states.get(editor.document.uri.toString());
          if (state) {
            // Re-render decorations when switching to a blamed file
            this.renderDecorations(editor, state, true);
          }
          const hasBlame = !!state;
          void vscode.commands.executeCommand(
            "setContext",
            CONTEXT_BLAME_ACTIVE,
            hasBlame,
          );
        } else {
          void vscode.commands.executeCommand(
            "setContext",
            CONTEXT_BLAME_ACTIVE,
            false,
          );
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
        if (readConfig().colorMode !== "hide") {
          void this.refreshAll();
        }
      }),
    );
  }

  async annotate(editor?: vscode.TextEditor): Promise<void> {
    const target = editor ?? vscode.window.activeTextEditor;
    if (!target || !this.isSupported(target.document.uri)) {
      return;
    }
    const entry = this.resolveService(target.document.uri);
    if (!entry) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t("JGC: File is outside any workspace folder."),
      );
      return;
    }

    const relativePath = path.relative(entry.root, target.document.uri.fsPath);
    let blameLines: BlameLine[];
    try {
      blameLines = await entry.service.blame(relativePath);
    } catch {
      await vscode.commands.executeCommand(
        "setContext",
        CONTEXT_BLAME_ACTIVE,
        false,
      );
      void vscode.window.showInformationMessage(
        vscode.l10n.t(
          "JGC: File has no Git blame history (untracked or ignored).",
        ),
      );
      return;
    }
    if (blameLines.length === 0) {
      return;
    }

    // Replace previous decoration (dispose clears everything)
    this.removeState(target.document.uri);

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

    // Per-line colors (order/author) are set per-decoration instance; "none"
    // uses the type-level light/dark pair so VS Code handles theme switching.
    const decorationType = vscode.window.createTextEditorDecorationType({
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

    // Generate decorations for ALL lines in the document
    const totalLines = target.document.lineCount;
    for (let lineNum = 1; lineNum <= totalLines; lineNum++) {
      const lineStart = target.document.lineAt(lineNum - 1).range.start;
      const blameLine = blameMap.get(lineNum);

      if (blameLine && blameMap.has(lineNum)) {
        // Line has blame info - show blame text
        const labelIndex = blameLines.findIndex(
          (l) => l.lineNumber === lineNum,
        );
        if (labelIndex >= 0) {
          allOptions.push({
            range: new vscode.Range(lineStart, lineStart),
            hoverMessage: new vscode.MarkdownString(
              [
                `**${blameLine.shortHash}** ${blameLine.authorName}`,
                blameLine.summary ?? "",
              ]
                .filter(Boolean)
                .join("\n\n"),
            ),
            renderOptions: {
              before: {
                contentText: labels[labelIndex].padEnd(maxWidth),
                ...(colorizer ? { color: colorizer(blameLine) } : {}),
                fontStyle: "italic",
                textDecoration: `none; display:inline-block; min-width:${maxWidth}ch; margin-right:1ch;`,
              },
            },
          });
        }
      } else {
        // Line has no blame info - show empty space to align content
        allOptions.push({
          range: new vscode.Range(lineStart, lineStart),
          renderOptions: {
            before: {
              contentText: " ".repeat(maxWidth + 1),
              textDecoration: `none; display:inline-block; min-width:${maxWidth}ch;`,
            },
          },
        });
      }
    }

    const state: BlameState = {
      decorationType,
      lineToHash,
      allOptions,
      maxWidth,
      lastRenderedLine: -1,
    };
    this.states.set(target.document.uri.toString(), state);
    this.renderDecorations(target, state);
    await vscode.commands.executeCommand(
      "setContext",
      CONTEXT_BLAME_ACTIVE,
      true,
    );
  }

  clear(editor?: vscode.TextEditor): void {
    const target = editor ?? vscode.window.activeTextEditor;
    if (!target) {
      if (this.states.size === 0) {
        void vscode.window.showInformationMessage(
          vscode.l10n.t("JGC: No active annotation to clear."),
        );
      }
      return;
    }
    if (this.removeState(target.document.uri)) {
      void vscode.commands.executeCommand(
        "setContext",
        CONTEXT_BLAME_ACTIVE,
        false,
      );
    } else {
      void vscode.window.showInformationMessage(
        "JGC: No active annotation to clear.",
      );
    }
  }

  handleSelectionChange(e: vscode.TextEditorSelectionChangeEvent): void {
    const state = this.states.get(e.textEditor.document.uri.toString());
    if (state) {
      // Cursor/around modes follow the caret on any selection change
      this.renderDecorations(e.textEditor, state);
    }

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

  /** Re-apply decorations according to the current display mode & cursor */
  private renderDecorations(
    editor: vscode.TextEditor,
    state: BlameState,
    forceRender = false,
  ): void {
    const { displayMode, aroundLines } = readConfig();

    // For "all" mode, apply all options once
    if (displayMode === "all") {
      if (forceRender || state.lastRenderedLine === -1) {
        state.lastRenderedLine = -2; // mark as fully rendered
        editor.setDecorations(state.decorationType, state.allOptions);
      }
      return;
    }

    const activeLine = editor.selection.active.line + 1; // 1-based
    if (!forceRender && activeLine === state.lastRenderedLine) return;
    state.lastRenderedLine = activeLine;

    let options: vscode.DecorationOptions[];
    if (displayMode === "cursor") {
      options = state.allOptions.filter(
        (o) => o.range.start.line + 1 === activeLine,
      );
    } else {
      options = state.allOptions.filter((o) => {
        const lineNo = o.range.start.line + 1;
        return Math.abs(lineNo - activeLine) <= aroundLines;
      });
    }
    editor.setDecorations(state.decorationType, options);
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
      return "Uncommitted";
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
    return uri.scheme === "file";
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
