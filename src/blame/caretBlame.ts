import * as path from "node:path";
import * as vscode from "vscode";
import type { GitService } from "../git/gitService";
import type { BlameLine } from "../git/types";
import type { MessageRouter } from "../messages/messageRouter";
import { formatBlameDate } from "./blameManager";
import {
  CARET_BLAME_DEFAULT_FORMAT,
  CARET_BLAME_MAX_MESSAGE_CHARS,
  type CaretBlameIdentity,
  caretBlameText,
  isOwnCommit,
} from "./caretBlameText";

interface GitServiceEntry {
  root: string;
  service: GitService;
}

/** Per-document blame snapshot, keyed by uri. */
interface BlameSnapshot {
  lines: BlameLine[];
  docVersion: number;
}

/**
 * End-of-line caret blame: while the caret moves through a file, the line it
 * sits on shows `Who, date * summary` after the code — JetBrains' line
 * blame, but following the caret instead of annotating every line.
 *
 * The `${date}` token renders through the inline-blame `jgc.blame.dateFormat`
 * setting (default `yyyy-MM-dd HH:mm`), not the raw YYYY/MM/DD string git
 * blame reports.
 *
 * Blame runs once per document (cached against the document version) and is
 * invalidated on save and on Git state changes; cursor movement then costs
 * nothing but a decoration update.
 */
export class CaretBlameController implements vscode.Disposable {
  private readonly decoration: vscode.TextEditorDecorationType;
  private readonly cache = new Map<string, BlameSnapshot>();
  /** Cached committer identity per repo root, for the "You" display. */
  private readonly identities = new Map<string, CaretBlameIdentity | null>();
  private readonly disposables: vscode.Disposable[] = [];
  private decoratedEditor: vscode.TextEditor | undefined;
  private enabled: boolean;
  private format: string;
  private messageMaxLength: number;
  private dateFormat: string;

  constructor(
    private readonly services: GitServiceEntry[],
    private readonly messageRouter: MessageRouter,
  ) {
    const config = vscode.workspace.getConfiguration("jgc.caretBlame");
    this.enabled = config.get<boolean>("enabled", true);
    this.format = config.get<string>("format", CARET_BLAME_DEFAULT_FORMAT);
    this.messageMaxLength = config.get<number>(
      "messageMaxLength",
      CARET_BLAME_MAX_MESSAGE_CHARS,
    );
    // The ${date} token follows the inline-blame date format, not the raw
    // YYYY/MM/DD string git blame reports.
    this.dateFormat = vscode.workspace
      .getConfiguration("jgc.blame")
      .get<string>("dateFormat", "yyyy-MM-dd HH:mm");

    this.decoration = vscode.window.createTextEditorDecorationType({
      after: {
        fontStyle: "italic",
        color: new vscode.ThemeColor("descriptionForeground"),
        margin: "0 0 0 1.5em",
      },
    });

    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor.document.uri.scheme === "file") {
          void this.render(e.textEditor);
        }
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          void this.render(editor);
        }
      }),
      vscode.workspace.onDidSaveTextDocument((doc) => {
        this.cache.delete(doc.uri.toString());
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document === doc) {
          void this.render(editor);
        }
      }),
      vscode.workspace.onDidCloseTextDocument((doc) => {
        this.cache.delete(doc.uri.toString());
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        const caretBlameChanged = e.affectsConfiguration("jgc.caretBlame");
        const blameChanged = e.affectsConfiguration("jgc.blame");
        if (!caretBlameChanged && !blameChanged) {
          return;
        }
        if (caretBlameChanged) {
          const config = vscode.workspace.getConfiguration("jgc.caretBlame");
          this.enabled = config.get<boolean>("enabled", true);
          this.format = config.get<string>(
            "format",
            CARET_BLAME_DEFAULT_FORMAT,
          );
          this.messageMaxLength = config.get<number>(
            "messageMaxLength",
            CARET_BLAME_MAX_MESSAGE_CHARS,
          );
        }
        if (blameChanged) {
          this.dateFormat = vscode.workspace
            .getConfiguration("jgc.blame")
            .get<string>("dateFormat", "yyyy-MM-dd HH:mm");
        }
        if (!this.enabled) {
          this.clear();
        } else {
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            void this.render(editor);
          }
        }
      }),
      this.messageRouter.onBroadcast((event) => {
        if (event === "gitStateChanged") {
          // HEAD may have moved; every snapshot is potentially stale.
          this.cache.clear();
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            void this.render(editor);
          }
        }
      }),
    );
  }

  dispose(): void {
    this.clear();
    this.decoration.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
  }

  private clear(): void {
    if (this.decoratedEditor) {
      this.decoratedEditor.setDecorations(this.decoration, []);
      this.decoratedEditor = undefined;
    }
  }

  private async render(editor: vscode.TextEditor): Promise<void> {
    if (!this.enabled || editor.document.uri.scheme !== "file") {
      return;
    }
    if (this.decoratedEditor && this.decoratedEditor !== editor) {
      this.decoratedEditor.setDecorations(this.decoration, []);
    }
    this.decoratedEditor = editor;

    const line = editor.selection.active.line;
    const snapshot = await this.getBlame(editor.document);
    if (this.decoratedEditor !== editor) {
      return;
    }
    const blame = snapshot.lines.find((l) => l.lineNumber === line + 1);
    // New (uncommitted) lines have no commit to describe — show nothing.
    if (!blame || blame.uncommitted) {
      editor.setDecorations(this.decoration, []);
      return;
    }
    const end = editor.document.lineAt(line).range.end;
    const self = isOwnCommit(blame, await this.identity(editor.document));
    editor.setDecorations(
      this.decoration,
      blame
        ? [
            {
              range: new vscode.Range(end, end),
              renderOptions: {
                after: {
                  contentText: caretBlameText(blame, {
                    self,
                    format: this.format,
                    messageMaxLength: this.messageMaxLength,
                    dateLabel:
                      blame.authorTime > 0
                        ? formatBlameDate(blame.authorTime, this.dateFormat)
                        : undefined,
                  }),
                },
              },
            },
          ]
        : [],
    );
  }

  /** The repo's committer identity, cached per root (git config rarely changes). */
  private async identity(
    doc: vscode.TextDocument,
  ): Promise<CaretBlameIdentity | undefined> {
    const entry = this.resolveService(doc.uri);
    if (!entry) {
      return undefined;
    }
    const cached = this.identities.get(entry.root);
    if (cached !== undefined) {
      return cached ?? undefined;
    }
    const fetched = await entry.service.getCurrentUser();
    this.identities.set(entry.root, fetched);
    return fetched ?? undefined;
  }

  private async getBlame(doc: vscode.TextDocument): Promise<BlameSnapshot> {
    const key = doc.uri.toString();
    const cached = this.cache.get(key);
    if (cached && cached.docVersion === doc.version) {
      return cached;
    }
    const entry = this.resolveService(doc.uri);
    let lines: BlameLine[] = [];
    const relative = entry ? path.relative(entry.root, doc.uri.fsPath) : "";
    if (entry && relative && !relative.startsWith("..")) {
      try {
        lines = await entry.service.blame(relative);
      } catch {
        lines = [];
      }
    }
    const snapshot: BlameSnapshot = { lines, docVersion: doc.version };
    this.cache.set(key, snapshot);
    return snapshot;
  }

  private resolveService(uri: vscode.Uri): GitServiceEntry | null {
    const fsPath = uri.fsPath;
    const match = this.services.find((entry) =>
      fsPath.startsWith(
        entry.root.endsWith(path.sep) ? entry.root : entry.root + path.sep,
      ),
    );
    return match ?? this.services[0] ?? null;
  }
}
