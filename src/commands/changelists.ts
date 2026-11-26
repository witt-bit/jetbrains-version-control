import * as vscode from "vscode";
import {
  type ChangelistSettings,
  readChangelistSettings,
} from "../git/changelistSettings";
import {
  annotateChangelists,
  type ChangelistResult,
  type ChangelistState,
  changedPathsOf,
  epochDay,
  forgetUnchanged,
  isListable,
  reconcile,
} from "../git/changelists";
import type { GitService } from "../git/gitService";
import type { ChangelistsInfo, WorkingTreeFile } from "../git/types";

/** Bridge params are untyped; keep only the strings of a would-be string array. */
export function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Reads `jgc.changelists.*` fresh on every call so setting changes apply without a reload. */
export function currentChangelistSettings(): ChangelistSettings {
  const config = vscode.workspace.getConfiguration("jgc");
  return readChangelistSettings((key) => config.get(key));
}

/**
 * Reconcile the worktree's changelists with a fresh status listing and tag
 * each tracked file with its list.
 *
 * Changelists are a convenience layer: if the store cannot be read or written
 * (read-only git dir, say) the files come back untagged and the panel still
 * works, with everything in the default list.
 */
export async function annotateWithChangelists<T extends WorkingTreeFile>(
  service: GitService,
  files: T[],
): Promise<T[]> {
  if (!currentChangelistSettings().enabled) return files;
  try {
    const store = await service.changelists();
    const state = await store.transform((current) =>
      reconcile(current, changedPathsOf(files), epochDay()),
    );
    return annotateChangelists(state, files);
  } catch {
    return files;
  }
}

/** The lists, the active one, and the settings the webviews render from. */
export async function readChangelistsInfo(
  service: GitService,
): Promise<ChangelistsInfo> {
  const settings = currentChangelistSettings();
  const state = await (await service.changelists()).read();
  return {
    enabled: settings.enabled,
    activeId: state.activeId,
    lists: state.lists,
    offerMoveOnPartialCommit: settings.offerMoveOnPartialCommit,
  };
}

/**
 * Apply a user-requested change, turning a rejected one (duplicate name,
 * deleting the default list, a list another window already removed) into a
 * thrown error the webview shows as a notification.
 */
export async function changeChangelists<R extends ChangelistResult>(
  service: GitService,
  change: (state: ChangelistState) => R,
): Promise<Extract<R, { ok: true }>> {
  const store = await service.changelists();
  const result = await store.update(change);
  if (!result.ok) throw new Error(result.error);
  return result as Extract<R, { ok: true }>;
}

/**
 * Forget the changelist assignments of paths that a commit or rollback just
 * made disappear from the working tree. Best effort: a failure here only
 * means an assignment lingers until it goes stale.
 */
export async function forgetResolvedPaths(
  service: GitService,
  candidates: readonly string[],
): Promise<void> {
  if (candidates.length === 0 || !currentChangelistSettings().enabled) return;
  try {
    const remaining = (await service.getWorkingTreeChanges())
      .filter(isListable)
      .map((file) => file.path);
    const store = await service.changelists();
    await store.transform((state) =>
      forgetUnchanged(state, remaining, candidates),
    );
  } catch {
    // Assignments expire on their own.
  }
}

/**
 * Run a commit and, whatever its outcome, drop the assignments of the files
 * it took out of the working tree. The "before" listing scopes the sweep to
 * files that were actually changed, so a path merely absent right now (stashed,
 * shelved) keeps its list.
 */
export async function withChangelistCleanup<T>(
  service: GitService,
  run: () => Promise<T>,
): Promise<T> {
  if (!currentChangelistSettings().enabled) return run();
  let before: string[] = [];
  try {
    before = (await service.getWorkingTreeChanges())
      .filter(isListable)
      .map((file) => file.path);
  } catch {
    // No baseline, no cleanup.
  }
  try {
    return await run();
  } finally {
    await forgetResolvedPaths(service, before);
  }
}
