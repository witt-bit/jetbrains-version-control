import * as path from "node:path";
import type { FileStatus } from "../git/types";
import type { DecoState } from "./palette";

/**
 * Mapping from `git status --porcelain=v1` to the palette, kept free of
 * `vscode` imports so it can be unit tested.
 */

/** Match a status entry to one of our palette keys, or undefined to ignore. */
export function stateOf(status: FileStatus): DecoState | undefined {
  const index = status.indexStatus;
  const workTree = status.workTreeStatus;
  const both = index + workTree;

  if (index === "?") return "untracked";
  if (index === "!") return "ignored";
  if (both.includes("U") || both === "DD" || both === "AA") {
    return "conflict";
  }
  if (index === "D" || workTree === "D") return "deleted";
  // A rename (`R`, reported with the old path) or a staged add (`A`) is new
  // content from the user's point of view.
  if (status.oldPath || index === "A") return "added";
  // `T` on either side is a file-type change (file ↔ symlink), i.e. the file
  // was rewritten in place.
  if (index === "M" || workTree === "M" || index === "T" || workTree === "T") {
    return "modified";
  }
  return undefined;
}

/** Repo-relative path of `filePath` in stable `/`-separated form. */
export function relativeKey(root: string, filePath: string): string {
  return normalizeRelative(path.relative(root, filePath));
}

/** Normalize a repo-relative path from Git into stable `/`-separated form. */
export function normalizeRelative(filePath: string): string {
  const normalized = filePath.split(path.sep).join("/");
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}
