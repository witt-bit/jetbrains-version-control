import type { WorkingTreeFile } from "./store/commit-store";
import {
  type Changelist,
  type ChangelistsInfo,
  DEFAULT_CHANGELIST_ID,
} from "./types/git";

/** DataTransfer type carrying the JSON array of file paths being dragged. */
export const CHANGELIST_DRAG_TYPE = "application/x-jgc-changelist-files";

/** The host answers `getChangelists` with a status stub outside a repository. */
export function isChangelistsInfo(value: unknown): value is ChangelistsInfo {
  if (typeof value !== "object" || value === null) return false;
  const info = value as Partial<ChangelistsInfo>;
  return (
    typeof info.enabled === "boolean" &&
    typeof info.activeId === "string" &&
    Array.isArray(info.lists)
  );
}

export interface ChangelistGroup {
  id: string;
  name: string;
  active: boolean;
  files: WorkingTreeFile[];
}

/**
 * Split the unstaged tracked files into one group per changelist, in list
 * order.
 *
 * The default list is shown when it has files, or when it is the active list
 * and there are other lists to drag into. A named list is always shown, even
 * when empty, because it is the only drop target for the files that belong in
 * it. With no named lists and nothing in the default list nothing is shown,
 * exactly as before changelists existed.
 */
export function groupByChangelist(
  files: WorkingTreeFile[],
  info: ChangelistsInfo,
): ChangelistGroup[] {
  const lists: Changelist[] = info.lists.some(
    (list) => list.id === DEFAULT_CHANGELIST_ID,
  )
    ? info.lists
    : [{ id: DEFAULT_CHANGELIST_ID, name: "Changes" }, ...info.lists];
  const known = new Set(lists.map((list) => list.id));
  const hasNamedList = lists.some((list) => list.id !== DEFAULT_CHANGELIST_ID);

  const byList = new Map<string, WorkingTreeFile[]>();
  for (const file of files) {
    // Files the host did not tag (another workspace folder) live in the default list.
    const id =
      file.changelist !== undefined && known.has(file.changelist)
        ? file.changelist
        : DEFAULT_CHANGELIST_ID;
    const bucket = byList.get(id);
    if (bucket) bucket.push(file);
    else byList.set(id, [file]);
  }

  const groups: ChangelistGroup[] = [];
  for (const list of lists) {
    const listFiles = byList.get(list.id) ?? [];
    const active = list.id === info.activeId;
    const isDefault = list.id === DEFAULT_CHANGELIST_ID;
    const visible =
      !isDefault || listFiles.length > 0 || (active && hasNamedList);
    if (visible) {
      groups.push({ id: list.id, name: list.name, active, files: listFiles });
    }
  }
  return groups;
}

/** Only unstaged, tracked files carry a list; staged rows and unversioned files do not move. */
export function isMovable(file: WorkingTreeFile): boolean {
  return !file.staged && file.changelist !== undefined;
}

/**
 * The paths an action on `file` applies to: every highlighted movable file
 * when `file` is part of a multi-selection, otherwise just `file`.
 */
export function movablePaths(
  file: WorkingTreeFile,
  changes: WorkingTreeFile[],
  highlightedFiles: Set<string>,
): string[] {
  const key = `${file.path}:${file.staged}`;
  if (highlightedFiles.size > 1 && highlightedFiles.has(key)) {
    const paths = changes
      .filter(
        (f) => isMovable(f) && highlightedFiles.has(`${f.path}:${f.staged}`),
      )
      .map((f) => f.path);
    if (paths.length > 0) return [...new Set(paths)];
  }
  return isMovable(file) ? [file.path] : [];
}

export interface PartialCommitOffer {
  listId: string;
  listName: string;
  /** Files of the list that were left out of the commit. */
  leftover: string[];
}

/**
 * Named changelists that a commit is about to split: some of their files are
 * checked and some are not.
 *
 * The default list is skipped. It is the catch-all, so a partial commit from
 * it is the normal case and prompting every time would only be noise; the
 * offer exists for lists the user has organised on purpose. Staged files count
 * as part of the list their path belongs to.
 */
export function partialCommitOffers(
  changes: WorkingTreeFile[],
  selectedFiles: Set<string>,
  info: ChangelistsInfo | null,
): PartialCommitOffer[] {
  if (!info?.enabled || !info.offerMoveOnPartialCommit) return [];

  const checked = new Set<string>();
  const byList = new Map<string, Set<string>>();
  for (const file of changes) {
    if (file.changelist === undefined) continue;
    if (selectedFiles.has(`${file.path}:${file.staged}`))
      checked.add(file.path);
    const paths = byList.get(file.changelist) ?? new Set<string>();
    paths.add(file.path);
    byList.set(file.changelist, paths);
  }

  const offers: PartialCommitOffer[] = [];
  for (const list of info.lists) {
    if (list.id === DEFAULT_CHANGELIST_ID) continue;
    const paths = byList.get(list.id);
    if (!paths) continue;
    const leftover = [...paths].filter((path) => !checked.has(path));
    if (leftover.length > 0 && leftover.length < paths.size) {
      offers.push({ listId: list.id, listName: list.name, leftover });
    }
  }
  return offers;
}
