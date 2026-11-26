/**
 * Changelists: named groups of working-tree changes, the IDEA/Rider way of
 * splitting unrelated work in one checkout.
 *
 * This is an *overlay*. Git has no such concept, so the assignment lives in a
 * small file next to the repository's git dir (see `changelistStore.ts`) and
 * the git index is never touched: the Staged group keeps behaving as it does
 * without changelists.
 *
 * Everything here is pure (no `vscode`, no fs) so the rules are unit-tested.
 * Functions never mutate their input; they return a new state, or the very
 * same object when nothing changed so callers can skip a write.
 */

import { randomUUID } from "node:crypto";

export const DEFAULT_CHANGELIST_ID = "default";
export const DEFAULT_CHANGELIST_NAME = "Changes";

/**
 * A path that stops being changed keeps its assignment this many days.
 *
 * Stash, shelve, smart checkout and `git update` all make files vanish and
 * reappear; forgetting them at once would drop the grouping every time.
 */
export const STALE_AFTER_DAYS = 7;

export const MAX_NAME_LENGTH = 200;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface Changelist {
  id: string;
  name: string;
}

export interface ChangelistAssignment {
  list: string;
  /** Epoch day (UTC) this path was last seen as changed. */
  seen: number;
}

export interface ChangelistState {
  version: 1;
  activeId: string;
  lists: Changelist[];
  /** Keyed by repo-relative path. A `Map`, so a file named `__proto__` is safe. */
  assignments: ReadonlyMap<string, ChangelistAssignment>;
}

/** A changed path; `oldPath` is the source of a rename. */
export interface ChangedPath {
  path: string;
  oldPath?: string;
}

export type ChangelistResult =
  | { ok: true; state: ChangelistState }
  | { ok: false; error: string };

export type CreateChangelistResult =
  | { ok: true; state: ChangelistState; id: string }
  | { ok: false; error: string };

export function epochDay(now: number = Date.now()): number {
  return Math.floor(now / MS_PER_DAY);
}

export function createDefaultState(): ChangelistState {
  return {
    version: 1,
    activeId: DEFAULT_CHANGELIST_ID,
    lists: [{ id: DEFAULT_CHANGELIST_ID, name: DEFAULT_CHANGELIST_NAME }],
    assignments: new Map(),
  };
}

/**
 * Read a persisted value. Never throws: a hand-edited or truncated file must
 * degrade to something usable instead of taking the Commit panel down.
 */
export function parseState(raw: unknown): ChangelistState {
  if (typeof raw !== "object" || raw === null) return createDefaultState();
  const source = raw as Record<string, unknown>;

  const entries: Changelist[] = [];
  if (Array.isArray(source.lists)) {
    for (const entry of source.lists) {
      if (typeof entry !== "object" || entry === null) continue;
      const { id, name } = entry as Record<string, unknown>;
      if (typeof id !== "string" || typeof name !== "string") continue;
      const trimmed = name.trim();
      if (!id || !trimmed || trimmed.length > MAX_NAME_LENGTH) continue;
      entries.push({ id, name: trimmed });
    }
  }

  // The default list may be renamed but never removed, and always comes first.
  const stored = entries.find((entry) => entry.id === DEFAULT_CHANGELIST_ID);
  const lists: Changelist[] = [
    stored ?? { id: DEFAULT_CHANGELIST_ID, name: DEFAULT_CHANGELIST_NAME },
  ];
  const ids = new Set<string>([DEFAULT_CHANGELIST_ID]);
  const names = new Set<string>([lists[0].name.toLowerCase()]);
  for (const entry of entries) {
    if (ids.has(entry.id) || names.has(entry.name.toLowerCase())) continue;
    ids.add(entry.id);
    names.add(entry.name.toLowerCase());
    lists.push(entry);
  }

  const assignments = new Map<string, ChangelistAssignment>();
  if (typeof source.assignments === "object" && source.assignments !== null) {
    for (const [path, value] of Object.entries(source.assignments)) {
      if (typeof value !== "object" || value === null) continue;
      const { list, seen } = value as Record<string, unknown>;
      assignments.set(path, {
        list:
          typeof list === "string" && ids.has(list)
            ? list
            : DEFAULT_CHANGELIST_ID,
        seen: typeof seen === "number" && Number.isFinite(seen) ? seen : 0,
      });
    }
  }

  const activeId =
    typeof source.activeId === "string" && ids.has(source.activeId)
      ? source.activeId
      : DEFAULT_CHANGELIST_ID;

  return { version: 1, activeId, lists, assignments };
}

/** The JSON-able form of a state. */
export function serializeState(state: ChangelistState): {
  version: 1;
  activeId: string;
  lists: Changelist[];
  assignments: Record<string, ChangelistAssignment>;
} {
  return {
    version: 1,
    activeId: state.activeId,
    lists: state.lists,
    assignments: Object.fromEntries(state.assignments),
  };
}

export function findChangelist(
  state: ChangelistState,
  id: string,
): Changelist | undefined {
  return state.lists.find((list) => list.id === id);
}

/** The list a path belongs to; unassigned paths belong to the active list. */
export function changelistOf(state: ChangelistState, path: string): string {
  return state.assignments.get(path)?.list ?? state.activeId;
}

/** Every assigned path in a list, sorted. */
export function pathsInChangelist(
  state: ChangelistState,
  id: string,
): string[] {
  const paths: string[] = [];
  for (const [path, assignment] of state.assignments) {
    if (assignment.list === id) paths.push(path);
  }
  return paths.sort();
}

type NameCheck = { ok: true; name: string } | { ok: false; error: string };

/** Names are trimmed, non-empty, bounded and unique ignoring case. */
export function validateName(
  state: ChangelistState,
  name: unknown,
  exceptId?: string,
): NameCheck {
  if (typeof name !== "string") {
    return { ok: false, error: "A changelist name is required." };
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, error: "A changelist name is required." };
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      error: `A changelist name can be at most ${MAX_NAME_LENGTH} characters.`,
    };
  }
  const clash = state.lists.find(
    (list) =>
      list.id !== exceptId && list.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (clash) {
    return {
      ok: false,
      error: `A changelist named "${clash.name}" already exists.`,
    };
  }
  return { ok: true, name: trimmed };
}

function missing(id: string): { ok: false; error: string } {
  return { ok: false, error: `Changelist "${id}" no longer exists.` };
}

export function createChangelist(
  state: ChangelistState,
  name: unknown,
  options: { makeActive?: boolean; id?: string } = {},
): CreateChangelistResult {
  const checked = validateName(state, name);
  if (!checked.ok) return checked;
  let id = options.id ?? `cl-${randomUUID().slice(0, 8)}`;
  while (findChangelist(state, id)) id = `cl-${randomUUID().slice(0, 8)}`;
  return {
    ok: true,
    id,
    state: {
      ...state,
      activeId: options.makeActive ? id : state.activeId,
      lists: [...state.lists, { id, name: checked.name }],
    },
  };
}

export function renameChangelist(
  state: ChangelistState,
  id: string,
  name: unknown,
): ChangelistResult {
  if (!findChangelist(state, id)) return missing(id);
  const checked = validateName(state, name, id);
  if (!checked.ok) return checked;
  if (findChangelist(state, id)?.name === checked.name) {
    return { ok: true, state };
  }
  return {
    ok: true,
    state: {
      ...state,
      lists: state.lists.map((list) =>
        list.id === id ? { ...list, name: checked.name } : list,
      ),
    },
  };
}

/** Delete a list; its files fall back to the default list. */
export function deleteChangelist(
  state: ChangelistState,
  id: string,
): ChangelistResult {
  if (id === DEFAULT_CHANGELIST_ID) {
    return { ok: false, error: "The default changelist cannot be deleted." };
  }
  if (!findChangelist(state, id)) return missing(id);
  const assignments = new Map<string, ChangelistAssignment>();
  for (const [path, assignment] of state.assignments) {
    assignments.set(
      path,
      assignment.list === id
        ? { ...assignment, list: DEFAULT_CHANGELIST_ID }
        : assignment,
    );
  }
  return {
    ok: true,
    state: {
      ...state,
      activeId: state.activeId === id ? DEFAULT_CHANGELIST_ID : state.activeId,
      lists: state.lists.filter((list) => list.id !== id),
      assignments,
    },
  };
}

export function setActiveChangelist(
  state: ChangelistState,
  id: string,
): ChangelistResult {
  if (!findChangelist(state, id)) return missing(id);
  return state.activeId === id
    ? { ok: true, state }
    : { ok: true, state: { ...state, activeId: id } };
}

export function moveToChangelist(
  state: ChangelistState,
  paths: readonly string[],
  id: string,
  today: number,
): ChangelistResult {
  if (!findChangelist(state, id)) return missing(id);
  let assignments: Map<string, ChangelistAssignment> | undefined;
  for (const path of paths) {
    const current = (assignments ?? state.assignments).get(path);
    if (current?.list === id && current.seen === today) continue;
    assignments ??= new Map(state.assignments);
    assignments.set(path, { list: id, seen: today });
  }
  return assignments
    ? { ok: true, state: { ...state, assignments } }
    : { ok: true, state };
}

/**
 * Bring assignments in line with the current working tree:
 * - a path seen for the first time joins the active list (a renamed file
 *   keeps the list of the path it came from);
 * - a path still changed has `seen` refreshed, which only writes once a day;
 * - a path unseen for more than {@link STALE_AFTER_DAYS} is forgotten.
 */
export function reconcile(
  state: ChangelistState,
  changed: readonly ChangedPath[],
  today: number,
): ChangelistState {
  let assignments: Map<string, ChangelistAssignment> | undefined;
  const current = () => assignments ?? state.assignments;

  for (const { path, oldPath } of changed) {
    const existing = current().get(path);
    if (existing) {
      if (existing.seen === today) continue;
      assignments ??= new Map(state.assignments);
      assignments.set(path, { ...existing, seen: today });
      continue;
    }
    const inherited = oldPath ? current().get(oldPath)?.list : undefined;
    assignments ??= new Map(state.assignments);
    assignments.set(path, {
      list: inherited ?? state.activeId,
      seen: today,
    });
  }

  for (const [path, assignment] of current()) {
    if (today - assignment.seen > STALE_AFTER_DAYS) {
      assignments ??= new Map(state.assignments);
      assignments.delete(path);
    }
  }

  return assignments ? { ...state, assignments } : state;
}

/**
 * Forget assignments for paths that are no longer changed, right after a
 * commit or rollback made them vanish for good. `only` limits the sweep to
 * the paths the user acted on; omit it to sweep everything.
 */
export function forgetUnchanged(
  state: ChangelistState,
  changedPaths: Iterable<string>,
  only?: Iterable<string>,
): ChangelistState {
  const stillChanged = new Set(changedPaths);
  const candidates = only ? new Set(only) : undefined;
  let assignments: Map<string, ChangelistAssignment> | undefined;
  for (const path of state.assignments.keys()) {
    if (stillChanged.has(path)) continue;
    if (candidates && !candidates.has(path)) continue;
    assignments ??= new Map(state.assignments);
    assignments.delete(path);
  }
  return assignments ? { ...state, assignments } : state;
}

/** The slice of a working-tree entry changelists care about. */
export interface ListableFile {
  path: string;
  oldPath?: string;
  status: string;
}

/**
 * Only tracked changes are grouped. Untracked files stay under "Unversioned
 * Files" and conflicts under "Merge Conflicts", exactly as without changelists.
 */
export function isListable(file: ListableFile): boolean {
  return file.status !== "untracked" && file.status !== "conflicted";
}

/** The distinct changed paths to reconcile against. */
export function changedPathsOf(files: readonly ListableFile[]): ChangedPath[] {
  const seen = new Set<string>();
  const changed: ChangedPath[] = [];
  for (const file of files) {
    if (!isListable(file) || seen.has(file.path)) continue;
    seen.add(file.path);
    changed.push({ path: file.path, oldPath: file.oldPath });
  }
  return changed;
}

/** Tag each listable file with the id of its changelist. */
export function annotateChangelists<T extends ListableFile>(
  state: ChangelistState,
  files: readonly T[],
): (T & { changelist?: string })[] {
  return files.map((file) =>
    isListable(file)
      ? { ...file, changelist: changelistOf(state, file.path) }
      : { ...file },
  );
}
