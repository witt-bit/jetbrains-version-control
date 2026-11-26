import {
  type ChangelistsInfo,
  DEFAULT_CHANGELIST_ID,
} from "../shared/types/git";

/** The slice of a changed file the grouping looks at. */
export interface ChangelistGroupable {
  status: string;
  changelist?: string;
}

export interface ChangelistBucket<T> {
  /** Stable across refreshes, so the collapsed state survives a reload. */
  key: string;
  label: string;
  /** True for the changelist new changes land in. */
  active: boolean;
  files: T[];
}

export const MERGE_CONFLICTS_LABEL = "Merge Conflicts";
export const UNVERSIONED_FILES_LABEL = "Unversioned Files";
const DEFAULT_CHANGELIST_LABEL = "Changes";

/** Pseudo-group keys use a different prefix than changelist ids, so no id can collide with them. */
export const MERGE_CONFLICTS_KEY = "pseudo:conflicts";
export const UNVERSIONED_FILES_KEY = "pseudo:unversioned";

export function changelistKey(id: string): string {
  return `changelist:${id}`;
}

/**
 * Splits files into the Commit panel's groups: every changelist in the host's
 * order, then "Merge Conflicts" and "Unversioned Files" when they have files.
 *
 * The default list is only worth a row when it holds files, or is the active
 * list and there is another list to tell it apart from; every other list is
 * always shown, empty or not. This is the Commit panel's rule too. Files with
 * no or an unknown changelist fall back to the default list, except untracked
 * and conflicted ones, which are never in a changelist.
 */
export function groupFilesByChangelist<T extends ChangelistGroupable>(
  files: readonly T[],
  changelists: ChangelistsInfo,
): ChangelistBucket<T>[] {
  // The host always sends the default list; if it were missing, its files would
  // otherwise have nowhere to go.
  const lists = changelists.lists.some((l) => l.id === DEFAULT_CHANGELIST_ID)
    ? changelists.lists
    : [
        { id: DEFAULT_CHANGELIST_ID, name: DEFAULT_CHANGELIST_LABEL },
        ...changelists.lists,
      ];

  const byList = new Map<string, T[]>(lists.map((l) => [l.id, []]));
  const defaultFiles: T[] = [];
  byList.set(DEFAULT_CHANGELIST_ID, defaultFiles);
  const conflicted: T[] = [];
  const unversioned: T[] = [];

  for (const file of files) {
    if (!file.changelist) {
      if (file.status === "conflicted") {
        conflicted.push(file);
        continue;
      }
      if (file.status === "untracked") {
        unversioned.push(file);
        continue;
      }
    }
    const target = file.changelist ? byList.get(file.changelist) : undefined;
    (target ?? defaultFiles).push(file);
  }

  const hasNamedList = lists.some((l) => l.id !== DEFAULT_CHANGELIST_ID);

  const buckets: ChangelistBucket<T>[] = [];
  for (const list of lists) {
    const listFiles = byList.get(list.id) ?? [];
    const active = list.id === changelists.activeId;
    if (
      list.id === DEFAULT_CHANGELIST_ID &&
      listFiles.length === 0 &&
      !(active && hasNamedList)
    )
      continue;
    buckets.push({
      key: changelistKey(list.id),
      label: list.name,
      active,
      files: listFiles,
    });
  }

  if (conflicted.length > 0) {
    buckets.push({
      key: MERGE_CONFLICTS_KEY,
      label: MERGE_CONFLICTS_LABEL,
      active: false,
      files: conflicted,
    });
  }
  if (unversioned.length > 0) {
    buckets.push({
      key: UNVERSIONED_FILES_KEY,
      label: UNVERSIONED_FILES_LABEL,
      active: false,
      files: unversioned,
    });
  }
  return buckets;
}
