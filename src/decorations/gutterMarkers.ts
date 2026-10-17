import * as path from "node:path";
import * as vscode from "vscode";
import type { GitService } from "../git/gitService";
import { type ChangeBlock, changeBlocks, classifyFromBlocks } from "./lineDiff";
import { blockAtLine, buildCard } from "./markerCard";
import { hoverFor } from "./markerHover";
import { type GutterState, readStateColor } from "./palette";

/** A repository root together with the service that talks to it. */
export interface RepoEntry {
  root: string;
  service: GitService;
}

/** The four icons needed to make adjacent same-state gutter rows join. */
interface SegmentStyles {
  single: vscode.TextEditorDecorationType;
  first: vscode.TextEditorDecorationType;
  middle: vscode.TextEditorDecorationType;
  last: vscode.TextEditorDecorationType;
}

/** What one diff pass yields: the painted ranges plus the block model. */
interface Computed {
  added: vscode.Range[];
  modified: vscode.Range[];
  deleted: vscode.Range[];
  blocks: ChangeBlock[];
  /** The file's lines in `HEAD`; `undefined` when the path is new. */
  base: string[] | undefined;
  now: string[];
  /** Whether the `HEAD` file (or, for a new file, the buffer) ends with `\n`. */
  trailingNewline: boolean;
}

/** The block model the marker commands act on. */
export interface BlockPeek {
  repo: RepoEntry;
  uri: vscode.Uri;
  base: string[] | undefined;
  now: string[];
  blocks: ChangeBlock[];
  trailingNewline: boolean;
}

// Recompute on the next short UI beat after edits. A long debounce leaves the
// old line-by-line gutter icons visible while the user is typing.
const DEBOUNCE_MS = 16;

/**
 * Per-line change markers (added / modified / deleted) drawn as a thin colored
 * bar in front of the line, the way the IDE Git plugin does.
 */
export class GutterMarkers implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  /** Per-state segment styles: a run of N lines needs different corners. */
  private types:
    | {
        added: SegmentStyles;
        modified: SegmentStyles;
        deleted: vscode.TextEditorDecorationType;
        pad: vscode.TextEditorDecorationType;
      }
    | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private tracked = new Set<vscode.TextEditor>();
  /**
   * Bumped by `rebuild()`. An `apply()` that is still awaiting diffs when the
   * styles are rebuilt holds references to disposed decoration types, so it
   * drops its results instead of writing them (and possibly overwriting a newer
   * run) through types that no longer exist.
   */
  private generation = 0;
  /** Prevents an older async diff from painting over a newer document state. */
  private applySequence = 0;
  /**
   * Caches that keep a run from spawning Git per file per keystroke. All of
   * them are dropped when the repository state changes, which is also when
   * `HEAD` may have moved.
   */
  private readonly headCommitByRoot = new Map<string, string | null>();
  private readonly headContent = new Map<string, string | undefined>();
  private readonly ignoredPaths = new Map<string, boolean>();
  private enabled = true;

  constructor(
    private readonly repos: RepoEntry[],
    private readonly log?: (message: string) => void,
    private readonly blamePad?: (
      uri: vscode.Uri,
      doc: vscode.TextDocument,
    ) => Promise<
      | {
          box: vscode.ThemableDecorationAttachmentRenderOptions;
          unlabeled: boolean[];
        }
      | undefined
    >,
  ) {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.schedule()),
      vscode.window.onDidChangeVisibleTextEditors(() => this.schedule()),
      vscode.workspace.onDidChangeTextDocument((event) => {
        // Only a visible editor's own text can change its markers. Output
        // channels, terminals and background documents would otherwise make
        // every visible file re-diff.
        const visible = vscode.window.visibleTextEditors.some(
          (editor) => editor.document === event.document,
        );
        if (visible) this.schedule();
      }),
      vscode.window.onDidChangeTextEditorSelection(() => {
        // In `cursor` / `around` blame mode the annotated window follows the
        // caret, so which lines carry a label — and which need a pad —
        // changes without any edit to the document.
        if (blameFollowsCursor()) this.schedule();
      }),
    );
  }

  /** Build the marker styles from the configured palette. */
  rebuild(): void {
    // Any in-flight `apply()` is now writing to styles that are about to be
    // disposed; the generation bump tells it to throw its results away.
    this.generation++;
    for (const type of this.types ? allStyles(this.types) : []) {
      type.dispose();
    }
    this.types = {
      added: {
        single: segmentStyle("added", "both"),
        first: segmentStyle("added", "top"),
        middle: segmentStyle("added", "none"),
        last: segmentStyle("added", "bottom"),
      },
      modified: {
        single: segmentStyle("modified", "both"),
        first: segmentStyle("modified", "top"),
        middle: segmentStyle("modified", "none"),
        last: segmentStyle("modified", "bottom"),
      },
      deleted: gutterStyle(readStateColor("deleted"), "both"),
      // Keep the blame column reserved on lines that have no blame label.
      // This is only an invisible spacer; change markers remain in the gutter.
      pad: vscode.window.createTextEditorDecorationType({ before: {} }),
    };
    this.log?.(
      `gutter markers rebuilt: ${Object.values(this.types).length} group(s)`,
    );
    this.apply();
  }

  schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.apply();
    }, DEBOUNCE_MS);
  }

  /**
   * Drop what is known about the repositories themselves: whether they have a
   * `HEAD` and what it contains. Call this when Git state changes, so a commit,
   * a new repository or a changed ignore list is picked up without a reload.
   */
  invalidateRepoState(): void {
    this.headCommitByRoot.clear();
    this.headContent.clear();
    this.ignoredPaths.clear();
  }

  /**
   * Turn the markers on or off. Switching off removes every decoration they
   * carry, including the reserved columns, so the text goes back to column 0.
   */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (enabled) {
      this.apply();
    } else {
      this.clear();
    }
  }

  /** Drop the markers from every editor they were applied to. */
  private clear(): void {
    const types = this.types;
    if (!types) return;
    for (const editor of this.tracked) {
      for (const type of allStyles(types)) {
        editor.setDecorations(type, []);
      }
    }
    this.tracked.clear();
  }

  private async apply(): Promise<void> {
    if (!this.enabled) {
      this.clear();
      return;
    }
    const types = this.types;
    if (!types) return;
    const generation = this.generation;
    const sequence = ++this.applySequence;
    /** True once the styles were rebuilt under us and this run is stale. */
    const stale = () =>
      generation !== this.generation || sequence !== this.applySequence;

    const visible = vscode.window.visibleTextEditors.filter(
      (editor) => editor.document.uri.scheme === "file",
    );

    for (const editor of this.tracked) {
      if (!visible.includes(editor)) {
        const t = types;
        editor.setDecorations(t.deleted, []);
        editor.setDecorations(t.pad, []);
        for (const group of [t.added, t.modified]) {
          for (const style of Object.values(group)) {
            editor.setDecorations(style, []);
          }
        }
        this.tracked.delete(editor);
      }
    }

    for (const editor of visible) {
      const repo = this.repoFor(editor.document.uri);
      if (!repo) {
        this.log?.(`gutter: no repo for ${editor.document.uri.fsPath}`);
        continue;
      }
      this.tracked.add(editor);

      const computed = await this.compute(repo, editor.document);
      if (stale()) return;
      this.log?.(
        `gutter: ${editor.document.uri.fsPath} -> a=${computed.added.length} m=${computed.modified.length} d=${computed.deleted.length}`,
      );

      // Overlapping buckets are resolved so preference is given to a full
      // height added/modified marker over a deletion marker.
      const byLine = new Map<number, GutterState>();
      const add = (line: number, state: GutterState) => {
        const existing = byLine.get(line);
        if (!existing || rank(existing) < rank(state)) {
          byLine.set(line, state);
        }
      };
      for (const range of computed.deleted) {
        add(range.start.line, "deleted");
      }
      for (const range of computed.modified) {
        add(range.start.line, "modified");
      }
      for (const range of computed.added) {
        add(range.start.line, "added");
      }

      // Hover cards are built once per block and shared by every line the
      // block spans.
      const cards = new Map<ChangeBlock, vscode.MarkdownString>();
      const hover = (line: number): vscode.MarkdownString | undefined => {
        const block = blockAtLine(computed.blocks, line);
        if (!block) return undefined;
        let md = cards.get(block);
        if (!md) {
          md = hoverFor(
            buildCard(block, computed.base ?? [], computed.now),
            editor.document.uri,
          );
          cards.set(block, md);
        }
        return md;
      };

      // Gutter icons are independent of editor text and cursor positions. Each
      // line receives an icon with matching square edges when its neighbour
      // has the same state, so contiguous rows appear as one capsule. The
      // decoration range spans the whole line so the hover card shows wherever
      // the changed line is hovered.
      const buckets = {
        addedSingle: [] as vscode.DecorationOptions[],
        addedFirst: [] as vscode.DecorationOptions[],
        addedMiddle: [] as vscode.DecorationOptions[],
        addedLast: [] as vscode.DecorationOptions[],
        modifiedSingle: [] as vscode.DecorationOptions[],
        modifiedFirst: [] as vscode.DecorationOptions[],
        modifiedMiddle: [] as vscode.DecorationOptions[],
        modifiedLast: [] as vscode.DecorationOptions[],
        deleted: [] as vscode.DecorationOptions[],
      } satisfies Record<string, vscode.DecorationOptions[]>;

      const stateAt = (line: number): GutterState | undefined =>
        byLine.get(line);

      const lineRange = (line: number): vscode.Range => {
        const length = editor.document.lineAt(line).text.length;
        return new vscode.Range(line, 0, line, Math.max(length, 1));
      };

      const pad = await this.blamePad?.(editor.document.uri, editor.document);
      if (stale()) return;
      const pads: vscode.DecorationOptions[] = [];
      const lineCount = editor.document.lineCount;
      for (let line = 0; line < lineCount; line++) {
        if (pad?.unlabeled[line]) {
          pads.push({
            range: new vscode.Range(line, 0, line, 1),
            renderOptions: { before: pad.box },
          });
        }
        const state = stateAt(line);
        const prev = line > 0 ? stateAt(line - 1) : undefined;
        const next = line + 1 < lineCount ? stateAt(line + 1) : undefined;

        if (state === "added" || state === "modified") {
          const sameAbove = prev === state;
          const sameBelow = next === state;
          const shape =
            !sameAbove && !sameBelow
              ? "single"
              : !sameAbove
                ? "first"
                : !sameBelow
                  ? "last"
                  : "middle";
          const key =
            `${state}${shape[0].toUpperCase()}${shape.slice(1)}` as keyof typeof buckets;
          buckets[key].push({
            range: lineRange(line),
            hoverMessage: hover(line),
          });
          continue;
        }
        if (state === "deleted") {
          buckets.deleted.push({
            range: lineRange(line),
            hoverMessage: hover(line),
          });
        }
      }

      const t = types;
      editor.setDecorations(t.pad, pads);
      editor.setDecorations(t.added.single, buckets.addedSingle);
      editor.setDecorations(t.added.first, buckets.addedFirst);
      editor.setDecorations(t.added.middle, buckets.addedMiddle);
      editor.setDecorations(t.added.last, buckets.addedLast);
      editor.setDecorations(t.modified.single, buckets.modifiedSingle);
      editor.setDecorations(t.modified.first, buckets.modifiedFirst);
      editor.setDecorations(t.modified.middle, buckets.modifiedMiddle);
      editor.setDecorations(t.modified.last, buckets.modifiedLast);
      editor.setDecorations(t.deleted, buckets.deleted);
    }
  }

  /**
   * The commit to compare against, cached per root. `null` means the folder is
   * not a repository (or has no commits), in which case there is nothing to
   * diff against and no file is painted.
   */
  private async headCommit(repo: RepoEntry): Promise<string | null> {
    if (this.headCommitByRoot.has(repo.root)) {
      return this.headCommitByRoot.get(repo.root) ?? null;
    }
    let commit: string | null = null;
    try {
      commit = await repo.service.headCommit();
    } catch {
      commit = null;
    }
    this.headCommitByRoot.set(repo.root, commit);
    return commit;
  }

  /**
   * The file's contents in `HEAD`, cached per commit so that a keystroke costs
   * no Git process at all: the base only changes when `HEAD` moves, which
   * invalidates the cache.
   */
  private async headText(
    repo: RepoEntry,
    commit: string,
    relative: string,
  ): Promise<string | undefined> {
    const key = `${repo.root}\0${commit}\0${relative}`;
    if (this.headContent.has(key)) {
      return this.headContent.get(key);
    }
    let text: string | undefined;
    try {
      text = await repo.service.showFileAtHead(relative);
    } catch {
      text = undefined;
    }
    this.headContent.set(key, text);
    return text;
  }

  /** Whether Git ignores the path, cached until the repository state changes. */
  private async isIgnored(repo: RepoEntry, relative: string): Promise<boolean> {
    const key = `${repo.root}\0${relative}`;
    const cached = this.ignoredPaths.get(key);
    if (cached !== undefined) return cached;
    let ignored: boolean;
    try {
      ignored = await repo.service.isIgnored(relative);
    } catch {
      ignored = false;
    }
    this.ignoredPaths.set(key, ignored);
    return ignored;
  }

  private repoFor(uri: vscode.Uri): RepoEntry | undefined {
    let best: RepoEntry | undefined;
    for (const repo of this.repos) {
      const prefix = repo.root.endsWith(path.sep)
        ? repo.root
        : repo.root + path.sep;
      if (
        uri.fsPath.startsWith(prefix) &&
        (!best || repo.root.length > best.root.length)
      ) {
        best = repo;
      }
    }
    return best;
  }

  /**
   * The block model for the commands behind the marker hover cards: what the
   * painted markers show, plus the base/current lines and block spans. Cheap
   * on repeat calls — `HEAD` content and ignore checks are cached.
   */
  async peek(editor: vscode.TextEditor): Promise<BlockPeek | undefined> {
    const repo = this.repoFor(editor.document.uri);
    if (!repo) return undefined;
    return {
      repo,
      uri: editor.document.uri,
      ...(await this.compute(repo, editor.document)),
    };
  }

  /**
   * Compute per-line change markers by diffing the document text (including
   * unsaved edits) against `HEAD`, so an unsaved buffer shows markers the same
   * way a saved file does.
   */
  private async compute(
    repo: RepoEntry,
    doc: vscode.TextDocument,
  ): Promise<Computed> {
    const relative = path.relative(repo.root, doc.uri.fsPath);
    const limit = doc.lineCount;
    const at = (line: number) => Math.max(0, Math.min(line, limit - 1));

    const added: vscode.Range[] = [];
    const modified: vscode.Range[] = [];
    const deleted: vscode.Range[] = [];
    const empty = {
      added,
      modified,
      deleted,
      blocks: [] as ChangeBlock[],
      base: undefined,
      now: [] as string[],
      trailingNewline: true,
    };

    if (doc.uri.scheme !== "file") {
      return empty;
    }

    // Without a HEAD there is no base to diff against. Marking every line as
    // added would paint whole files green in a folder that is not a repository
    // at all, or in a repository that has no commit yet.
    const commit = await this.headCommit(repo);
    if (!commit) {
      return empty;
    }

    // An ignored file is not tracked, so every line would read as added.
    if (await this.isIgnored(repo, relative)) {
      return empty;
    }

    const rawBase = (await this.headText(repo, commit, relative))?.split("\n");

    const nowLines = doc.getText().split("\n");
    const nowFlag = nowLines.length > 1 && nowLines[nowLines.length - 1] === "";
    const now = nowFlag ? nowLines.slice(0, -1) : nowLines;

    // The repository has a HEAD and this path is not in it: a new file, whose
    // every line is one added block.
    if (rawBase === undefined) {
      const block: ChangeBlock = {
        baseStart: 0,
        baseCount: 0,
        curStart: 0,
        curCount: now.length,
      };
      for (let i = 0; i < limit; i++) {
        added.push(new vscode.Range(i, 0, i, 0));
      }
      return {
        ...empty,
        added,
        blocks: [block],
        now,
        trailingNewline: nowFlag,
      };
    }

    // A trailing newline in the file would otherwise diff as a phantom empty
    // last line; drop it so only real content lines are compared.
    const baseFlag = rawBase.length > 1 && rawBase[rawBase.length - 1] === "";
    const base = baseFlag ? rawBase.slice(0, -1) : rawBase;

    // Block semantics (see `changeBlocks`): a paired removed+added run is a
    // modification of every replaced line, a lone added run an insertion, a
    // lone removed run a deletion — with the editor's own quick-diff
    // heuristics for joining blocks that a blank line happens to separate.
    const blocks = changeBlocks(base, now);
    const classification = classifyFromBlocks(blocks, now);
    for (const line of classification.added) {
      added.push(new vscode.Range(at(line), 0, at(line), 0));
    }
    for (const line of classification.modified) {
      modified.push(new vscode.Range(at(line), 0, at(line), 0));
    }
    for (const line of classification.deleted) {
      deleted.push(new vscode.Range(at(line), 0, at(line), 0));
    }

    return {
      added,
      modified,
      deleted,
      blocks,
      base,
      now,
      trailingNewline: baseFlag,
    };
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    for (const type of allStyles(this.types)) {
      type.dispose();
    }
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}

/** Flatten the nested style groups into a disposable list. */
function allStyles(
  types:
    | {
        added: SegmentStyles;
        modified: SegmentStyles;
        deleted: vscode.TextEditorDecorationType;
        pad: vscode.TextEditorDecorationType;
      }
    | undefined,
): vscode.TextEditorDecorationType[] {
  if (!types) return [];
  return [
    ...Object.values(types.added),
    ...Object.values(types.modified),
    types.deleted,
    types.pad,
  ];
}

/**
 * A colored segment of a change run, rendered in the editor gutter.
 */
function segmentStyle(
  state: "added" | "modified",
  ends: "both" | "top" | "bottom" | "none",
): vscode.TextEditorDecorationType {
  const color = readStateColor(state);
  return gutterStyle(color, ends);
}

function gutterStyle(
  color: string,
  ends: "both" | "top" | "bottom" | "none",
): vscode.TextEditorDecorationType {
  return vscode.window.createTextEditorDecorationType({
    gutterIconPath: gutterIcon(color, ends),
    gutterIconSize: "contain",
  });
}

function gutterIcon(
  color: string,
  ends: "both" | "top" | "bottom" | "none",
): vscode.Uri {
  const top = ends === "both" || ends === "top" ? 3 : 0;
  const bottom = ends === "both" || ends === "bottom" ? 3 : 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="6" height="20" viewBox="0 0 6 20"><path fill="${color}" d="M${top} 0H${6 - top}Q6 0 6 ${top}V${20 - bottom}Q6 20 ${6 - bottom} 20H${bottom}Q0 20 0 ${20 - bottom}V${top}Q0 0 ${top} 0Z"/></svg>`;
  return vscode.Uri.parse(`data:image/svg+xml,${encodeURIComponent(svg)}`);
}

/**
 * Whether the blame annotation paints only a window around the caret, in which
 * case moving the caret changes which lines the marker layer has to pad.
 */
function blameFollowsCursor(): boolean {
  const mode = vscode.workspace
    .getConfiguration("jgc.blame")
    .get<string>("displayMode", "all");
  return mode === "cursor" || mode === "around";
}

/** When two buckets claim a line, the full-height bar wins over the short one. */
function rank(state: GutterState): number {
  return state === "added" || state === "modified" ? 2 : 1;
}
