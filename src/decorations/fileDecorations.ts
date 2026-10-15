import * as path from "node:path";
import * as vscode from "vscode";
import type { GitService } from "../git/gitService";
import type { FileStatus } from "../git/types";
import type { DecoState } from "./palette";

/**
 * Paints the Explorer's file names by Git state, so disabling VS Code's
 * built-in Git does not leave the tree without the colours users expect.
 *
 * `FileDecoration.color` only accepts a `ThemeColor`, so the values configured
 * under `jgc.decoration.color.*` are mirrored into
 * `workbench.colorCustomizations` (keys `jgc.decoration.<state>`) by
 * `DecorationController`. The colors themselves are also declared under
 * `contributes.colors` with the same defaults.
 */
export class FileDecorationController
  implements vscode.FileDecorationProvider, vscode.Disposable
{
  private readonly changeEmitter = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[] | undefined
  >();
  readonly onDidChangeFileDecorations = this.changeEmitter.event;

  private readonly registration: vscode.Disposable;
  private states = new Map<string, FileDecorationState>();

  constructor(
    private readonly root: string,
    private readonly service: GitService,
    private readonly log?: (message: string) => void,
  ) {
    this.registration = vscode.window.registerFileDecorationProvider(this);
  }

  /** Re-read the status of the whole tree. Cheap: one Git call, debounced. */
  async refresh(): Promise<void> {
    let statuses: FileStatus[] = [];
    try {
      statuses = await this.service.getStatus({ ignored: true });
    } catch {
      statuses = [];
    }

    const next = new Map<string, FileDecorationState>();
    for (const status of statuses) {
      const state = stateOf(status);
      if (state) {
        // `git status` marks directory entries (untracked and ignored folders)
        // with a trailing slash. Explorer queries them without it, so the
        // slash must be stripped from the key and the entry remembered as a
        // directory: coloring one only helps if it propagates to children.
        const isDirectory = status.path.endsWith("/");
        next.set(normalizeRelative(status.path), {
          state,
          propagate: isDirectory,
        });
      }
    }

    const changed: vscode.Uri[] = [];
    for (const key of next.keys()) {
      if (this.states.get(key) !== next.get(key)) {
        changed.push(vscode.Uri.file(path.join(this.root, key)));
      }
    }
    for (const key of this.states.keys()) {
      if (!next.has(key)) {
        changed.push(vscode.Uri.file(path.join(this.root, key)));
      }
    }

    this.states = next;
    this.log?.(
      `file decorations: ${next.size} file(s), ${changed.length} changed`,
    );
    if (changed.length > 0) {
      this.changeEmitter.fire(changed);
    }
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme !== "file") return undefined;
    const found = this.states.get(relativeKey(this.root, uri.fsPath));
    if (!found) return undefined;
    this.log?.(
      `file decoration: ${uri.fsPath} -> ${found.state}${found.propagate ? " (dir)" : ""}`,
    );
    return {
      color: new vscode.ThemeColor(`jgc.decoration.${found.state}`),
      // Folders (gitignored / untracked directories) should carry the color to
      // the files inside, otherwise only the folder label changes.
      propagate: found.propagate,
    };
  }

  dispose(): void {
    this.registration.dispose();
    this.changeEmitter.dispose();
  }
}

/** A resolved decoration for one path. */
interface FileDecorationState {
  state: DecoState;
  /** True for directory entries, which must colour their children too. */
  propagate: boolean;
}

/** Match a status entry to one of our palette keys, or undefined to ignore. */
function stateOf(status: FileStatus): DecoState | undefined {
  const index = status.indexStatus;
  const workTree = status.workTreeStatus;
  const both = index + workTree;

  if (index === "?") return "untracked";
  if (index === "!") return "ignored";
  if (both.includes("U") || both === "DD" || both === "AA") {
    return "conflict";
  }
  if (status.oldPath) return "added";
  if (index === "D" || workTree === "D") return "deleted";
  if (index === "A") return "added";
  if (index === "M" || workTree === "M" || index === "T") {
    return "modified";
  }
  return undefined;
}

function relativeKey(root: string, filePath: string): string {
  const rel = path.relative(root, filePath);
  return rel.split(path.sep).join("/");
}

/** Normalize a repo-relative path from Git into stable `/`-separated form. */
function normalizeRelative(filePath: string): string {
  const normalized = filePath.split(path.sep).join("/");
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}
