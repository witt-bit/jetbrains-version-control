import * as path from "node:path";
import * as vscode from "vscode";
import type { GitService } from "../git/gitService";
import { transparentPixelUri } from "./box";
import { pairEdits } from "./editPairing";
import { type GutterState, readStateColor } from "./palette";

/** A repository root together with the service that talks to it. */
export interface RepoEntry {
  root: string;
  service: GitService;
}

/** The four styles a run of same-state lines needs for rounded ends. */
interface SegmentStyles {
  single: vscode.TextEditorDecorationType;
  first: vscode.TextEditorDecorationType;
  middle: vscode.TextEditorDecorationType;
  last: vscode.TextEditorDecorationType;
}

const DEBOUNCE_MS = 300;

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
        blank: vscode.TextEditorDecorationType;
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
    /**
     * Supplies a transparent box plus the set of lines that carry no blame
     * label, so their change markers land in the same column as the labelled
     * rows. Undefined when the document is not annotated.
     */
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
      // Attachment order inside a line follows decoration-type creation order:
      // the pad must be created before every marker style, or its box renders
      // to the right of the bars and pushes them out of their column. The box
      // comes per line from `blamePad`.
      pad: vscode.window.createTextEditorDecorationType({ before: {} }),
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
      // Deletions sit on the line boundary, so they stay half-height and are
      // never merged with neighbours.
      deleted: deletionStyle("deleted"),
      // Reserves the marker column on every unchanged line, so the code column
      // (and the cursor positions) does not shift when a marker appears.
      blank: blankStyle(),
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
    /** True once the styles were rebuilt under us and this run is stale. */
    const stale = () => generation !== this.generation;

    const visible = vscode.window.visibleTextEditors.filter(
      (editor) => editor.document.uri.scheme === "file",
    );

    for (const editor of this.tracked) {
      if (!visible.includes(editor)) {
        const t = types;
        editor.setDecorations(t.blank, []);
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

      const ranges = await this.markersFor(repo, editor);
      if (stale()) return;
      this.log?.(
        `gutter: ${editor.document.uri.fsPath} -> a=${ranges.added.length} m=${ranges.modified.length} d=${ranges.deleted.length}`,
      );

      // Exactly one marker attachment per line: a colored bar for changed
      // lines, an invisible spacer elsewhere. Overlapping buckets are resolved
      // so preference is given to a full-height changed-line bar.
      const byLine = new Map<number, GutterState>();
      const add = (line: number, state: GutterState) => {
        const existing = byLine.get(line);
        if (!existing || rank(existing) < rank(state)) {
          byLine.set(line, state);
        }
      };
      for (const range of ranges.deleted) {
        add(range.start.line, "deleted");
      }
      for (const range of ranges.modified) {
        add(range.start.line, "modified");
      }
      for (const range of ranges.added) {
        add(range.start.line, "added");
      }

      // One decoration per line. A `before` attachment only renders at the
      // start of its range, so a multi-line range would leave every following
      // line bare and break the reserved marker column. Adjacent same-state
      // lines instead get boxes with matching corners and no vertical gap, so
      // they read as one continuous capsule.
      const buckets = {
        addedSingle: [] as vscode.Range[],
        addedFirst: [] as vscode.Range[],
        addedMiddle: [] as vscode.Range[],
        addedLast: [] as vscode.Range[],
        modifiedSingle: [] as vscode.Range[],
        modifiedFirst: [] as vscode.Range[],
        modifiedMiddle: [] as vscode.Range[],
        modifiedLast: [] as vscode.Range[],
        deleted: [] as vscode.Range[],
        blank: [] as vscode.Range[],
      } satisfies Record<string, vscode.Range[]>;

      const stateAt = (line: number): GutterState | undefined =>
        byLine.get(line);

      // Lines the annotation leaves bare — empty when it ran, or added since —
      // render no blame label, so their markers would slide left into the blame
      // column; a transparent pad re-reserves it.
      const pad = await this.blamePad?.(editor.document.uri, editor.document);
      if (stale()) return;
      const pads: vscode.DecorationOptions[] = [];

      const lineCount = editor.document.lineCount;
      for (let line = 0; line < lineCount; line++) {
        // A non-empty range keeps the rendered attachment anchored to the line
        // without turning it into a cursor anchor point: zero-width ranges are
        // the ones the cursor can land on, which is how markers were reachable.
        const range = new vscode.Range(line, 0, line, 1);
        if (pad?.unlabeled[line]) {
          pads.push({ range, renderOptions: { before: pad.box } });
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
          buckets[key].push(range);
          continue;
        }
        if (state === "deleted") {
          buckets.deleted.push(range);
          continue;
        }
        buckets.blank.push(range);
      }

      const t = types;
      // The pad's decoration type is created before every marker style (see
      // `rebuild`), which is what keeps its box left of the marker on a line
      // that carries both.
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
      editor.setDecorations(t.blank, buckets.blank);
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
   * Compute per-line change markers by diffing the document text (including
   * unsaved edits) against `HEAD`, so an unsaved buffer shows markers the same
   * way a saved file does.
   */
  private async markersFor(
    repo: RepoEntry,
    editor: vscode.TextEditor,
  ): Promise<Record<GutterState, vscode.Range[]>> {
    const doc = editor.document;
    const relative = path.relative(repo.root, doc.uri.fsPath);
    const limit = doc.lineCount;
    const at = (line: number) => Math.max(0, Math.min(line, limit - 1));

    const added: vscode.Range[] = [];
    const modified: vscode.Range[] = [];
    const deleted: vscode.Range[] = [];

    if (doc.uri.scheme !== "file") {
      return { added, modified, deleted };
    }

    // Without a HEAD there is no base to diff against. Marking every line as
    // added would paint whole files green in a folder that is not a repository
    // at all, or in a repository that has no commit yet.
    const commit = await this.headCommit(repo);
    if (!commit) {
      return { added, modified, deleted };
    }

    // An ignored file is not tracked, so every line would read as added.
    if (await this.isIgnored(repo, relative)) {
      return { added, modified, deleted };
    }

    const baseLines = (await this.headText(repo, commit, relative))?.split(
      "\n",
    );

    // The repository has a HEAD and this path is not in it: a new file.
    if (baseLines === undefined) {
      for (let i = 0; i < limit; i++) {
        added.push(new vscode.Range(i, 0, i, 0));
      }
      return { added, modified, deleted };
    }

    // A trailing newline in the file would otherwise diff as a phantom empty
    // last line; drop it so only real content lines are compared.
    const base =
      baseLines.length > 0 && baseLines[baseLines.length - 1] === ""
        ? baseLines.slice(0, -1)
        : baseLines;
    const current = doc.getText().split("\n");
    const now =
      current.length > 0 && current[current.length - 1] === ""
        ? current.slice(0, -1)
        : current;

    // `node-diff3` is ESM-only and the extension host is CommonJS, so it is
    // loaded lazily rather than at module scope.
    const { diffIndices } = await import("node-diff3");

    for (const chunk of diffIndices(base, now)) {
      const [oldStart, oldCount] = chunk.buffer1;
      const [newStart, newCount] = chunk.buffer2;

      if (newCount === 0) {
        // Anchor the short bar to the line that follows the gap, so it sits on
        // the boundary between the previous and next line.
        deleted.push(new vscode.Range(at(newStart), 0, at(newStart), 0));
        continue;
      }

      if (oldCount === 0) {
        for (let i = 0; i < newCount; i++) {
          const index = at(newStart + i);
          added.push(new vscode.Range(index, 0, index, 0));
        }
        continue;
      }

      // A chunk that both replaces old lines and adds new ones is usually one
      // edit wrapped in insertions (a changed line followed by fresh blanks).
      // The most similar old/new lines pair up as edits; the leftovers read
      // as pure additions, so inserted blanks stay green inside a rewritten
      // region instead of painting the whole replacement blue.
      const edits = pairEdits(
        base.slice(oldStart, oldStart + oldCount),
        now.slice(newStart, newStart + newCount),
      );
      for (let i = 0; i < newCount; i++) {
        const index = at(newStart + i);
        const range = new vscode.Range(index, 0, index, 0);
        if (edits[i]) {
          modified.push(range);
        } else {
          added.push(range);
        }
      }
    }

    return { added, modified, deleted };
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
        blank: vscode.TextEditorDecorationType;
        pad: vscode.TextEditorDecorationType;
      }
    | undefined,
): vscode.TextEditorDecorationType[] {
  if (!types) return [];
  return [
    ...Object.values(types.added),
    ...Object.values(types.modified),
    types.deleted,
    types.blank,
    types.pad,
  ];
}

/**
 * A colored segment of a change run, rendered as a `before` attachment.
 *
 * `before` is required, not a stylistic choice: the editor's cursor movement
 * treats `after` attachments as positions it can land on, so a marker attached
 * with `after` can be reached with the Left arrow (and included in a
 * selection). `before` attachments are not cursor-accessible, which is why the
 * Blame text on the same line behaves correctly.
 *
 * The box is anchored by a transparent 1×1 icon rather than `contentText`: an
 * icon is a replaced element the cursor cannot enter, while `contentText`
 * would be treated as editable content.
 */
function segmentStyle(
  state: "added" | "modified",
  ends: "both" | "top" | "bottom" | "none",
): vscode.TextEditorDecorationType {
  const color = readStateColor(state);
  return vscode.window.createTextEditorDecorationType({
    before: markerBox(color, ends),
    cursor: "pointer",
  });
}

/**
 * The invisible counterpart of a marker: same box, so the code column starts at
 * the same place on every line, but no visible bar. Applied to lines without a
 * change marker.
 */
function blankStyle(): vscode.TextEditorDecorationType {
  return vscode.window.createTextEditorDecorationType({
    before: markerBox("transparent", "both"),
  });
}

/**
 * Deletion markers are half-height and hug the row, which visually straddles
 * the boundary between the previous and next line.
 */
function deletionStyle(state: GutterState): vscode.TextEditorDecorationType {
  const color = readStateColor(state);
  return vscode.window.createTextEditorDecorationType({
    before: markerBox(color, "both", "0.5em"),
    cursor: "pointer",
  });
}

function markerBox(
  color: string,
  ends: "both" | "top" | "bottom" | "none",
  height = "1lh",
): vscode.ThemableDecorationAttachmentRenderOptions {
  // `1lh` is the line box height, so adjacent segments touch vertically with
  // no gap. Only the ends of a run are rounded, which makes a multi-line run
  // read as one capsule rather than a stack of pills.
  const radius =
    ends === "both"
      ? "3px"
      : ends === "top"
        ? "3px 3px 0 0"
        : ends === "bottom"
          ? "0 0 3px 3px"
          : "0";

  // `borderRadius` is understood by the renderer's CSS whitelist but is absent
  // from the public attachment typings, so it is attached through a widened
  // view of the same object rather than dropped.
  const box: vscode.ThemableDecorationAttachmentRenderOptions & {
    borderRadius?: string;
  } = {
    // A transparent replaced element, so the box has no text for the caret to
    // land on and no glyphs of its own.
    contentIconPath: transparentPixelUri(),
    width: "6px",
    height,
    // No vertical margin: it would open a gap between segments of a run.
    margin: "0 4px",
    border: `3px solid ${color}`,
    backgroundColor: color,
  };
  box.borderRadius = radius;
  return box;
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
