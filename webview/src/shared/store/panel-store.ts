import { create } from "zustand";
import { bridge, reportActionError } from "../bridge";
import type { SelectionMode } from "../hooks/useModifierClickSelection";
import type {
  BranchInfo,
  Commit,
  DiffFile,
  LaneInfo,
  LaneSnapshot,
  TagInfo,
} from "../types/git";
import {
  buildLogParams,
  hasLogFilter,
  type LogParams,
  sameLogParams,
} from "./log-filter";

/** Commits per `getGraphData` / `loadMoreLog` page. */
const LOG_PAGE_SIZE = 200;
/** Largest page `focusCommit` asks for while paging towards a deep commit. */
const LOG_JUMP_PAGE_SIZE = 1000;

interface PanelFilter {
  /** Message text, matched by the host (`git log --grep`). */
  searchQuery: string;
  matchCase: boolean;
  regex: boolean;
  branch: string;
  author: string;
  dateRange: string;
  /** Path filter: a file or a folder, relative to the repository root. */
  file: string;
}

interface PanelStore {
  commits: Commit[];
  /** Commits filtered by author/date (client-side). Graph layout uses full `commits`. */
  visibleCommits: Commit[];
  branches: BranchInfo[];
  tags: TagInfo[];
  currentBranch: string;
  graphLayout: Record<string, LaneInfo>;
  laneSnapshot: LaneSnapshot | null;

  selectedCommitHash: string | null;
  selectedCommitHashes: string[];
  lastSelectedCommitHash: string | null;
  hoveredColumn: number | null;
  commitFiles: DiffFile[];
  selectedFilePath: string | null;
  /** Column visibility for the commit list */
  visibleColumns: { author: boolean; date: boolean; hash: boolean };
  /** When multiple commits are selected, stores the oldest/newest for range diff */
  rangeOldest: string | null;
  rangeNewest: string | null;
  selectedBranches: string[];
  lastSelectedBranch: string | null;
  selectedTags: string[];
  lastSelectedTag: string | null;
  remoteSectionSelected: boolean;
  /** Name of the selected remote folder row in the remote tree (e.g. "origin"). */
  selectedRemoteFolder: string | null;
  currentBranchRowSelected: boolean;
  branchGroupByDirectory: boolean;
  /** Sidebar gear menu: whether the Tags section is visible in the tree. */
  tagsSectionVisible: boolean;

  filter: PanelFilter;
  /** Hashes to restore after clearing a filter */
  pendingSelectionFromFilter: string[];
  /** Commit hash waiting to be scrolled into view by CommitList's virtualizer */
  pendingScrollToHash: string | null;
  /** Collapsed sequence IDs */
  collapsedSequenceIds: Set<string>;
  /** sequenceId → intermediate hashes that are hidden */
  collapsedIntermediates: Map<string, string[]>;

  /** Host-side filter params of the latest fetch; `loadMore` and Go To reuse them. */
  logParams: LogParams;
  loading: boolean;
  /** False until the first fetch finished, so an empty filtered list is not "Loading...". */
  loadedOnce: boolean;
  hasMore: boolean;
  operationInProgress: boolean;

  /** `quick` skips the minimum "loading" display time (used while typing a filter). */
  fetchInitialData: (options?: { quick?: boolean }) => Promise<void>;
  loadMore: (count?: number) => Promise<void>;
  selectCommit: (
    hash: string,
    mode?: SelectionMode,
    allVisibleCommits?: string[],
  ) => Promise<void>;
  /** Load/locate a commit from an external source (e.g. blame annotation click) and scroll it into view */
  focusCommit: (hash: string) => Promise<void>;
  /** Go To Hash/Branch/Tag: resolve what the user typed, then focus that commit. */
  goToRef: (query: string) => Promise<boolean>;
  consumePendingScrollToHash: () => void;
  selectFile: (filePath: string) => void;
  openDiffEditor: (commitHash: string, file: DiffFile) => Promise<void>;
  setFilter: (filter: Partial<PanelFilter>) => void;
  selectBranch: (
    name: string,
    mode: "single" | "toggle" | "range",
    allVisibleBranches: string[],
  ) => void;
  selectTag: (
    name: string,
    mode: "single" | "toggle" | "range",
    allVisibleTags: string[],
  ) => void;
  clearAllSelections: () => void;
  setRemoteSectionSelected: (selected: boolean) => void;
  setSelectedRemoteFolder: (remoteName: string | null) => void;
  setCurrentBranchRowSelected: (selected: boolean) => void;
  setHoveredColumn: (column: number | null) => void;
  toggleColumnVisibility: (column: "author" | "date" | "hash") => void;
  toggleSequenceCollapse: (sequenceId: string, intermediates: string[]) => void;
  toggleBranchGroupByDirectory: () => void;
  toggleTagsSectionVisible: () => void;
  refresh: () => Promise<void>;
}

interface SelectionSnapshot {
  selectedCommitHash: string | null;
  selectedCommitHashes: string[];
  lastSelectedCommitHash: string | null;
  rangeOldest: string | null;
  rangeNewest: string | null;
}

/**
 * Sequence guard for `selectCommit`: clicking commit B while commit A's file
 * list is still loading must not let A's late response overwrite B's list.
 */
let commitFilesRequestSeq = 0;

/**
 * Sequence guard for the log: a response for an older filter (or a `loadMore`
 * started before the filter changed) must not overwrite the current list.
 */
let logFetchSeq = 0;

function filterCommits(
  commits: Commit[],
  filter: PanelFilter,
  collapsedIntermediates: Map<string, string[]>,
): Commit[] {
  const hiddenSet = new Set<string>();
  for (const hashes of collapsedIntermediates.values()) {
    for (const h of hashes) hiddenSet.add(h);
  }

  // Compute date cutoff for dateRange filter
  let dateCutoff: Date | null = null;
  if (filter.dateRange) {
    const now = new Date();
    if (filter.dateRange === "today") {
      dateCutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (filter.dateRange === "7days") {
      dateCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (filter.dateRange === "30days") {
      dateCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (filter.dateRange === "90days") {
      dateCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    }
  }

  return commits.filter((c) => {
    if (hiddenSet.has(c.hash)) return false;

    if (filter.author) {
      if (!c.authorName.toLowerCase().includes(filter.author.toLowerCase())) {
        return false;
      }
    }
    if (dateCutoff) {
      const commitDate = new Date(c.authorDate);
      if (commitDate < dateCutoff) {
        return false;
      }
    }
    return true;
  });
}

function deriveSelectionFromVisible(
  visibleCommits: Commit[],
  selectedCommitHashes: string[],
  selectedCommitHash: string | null,
  lastSelectedCommitHash: string | null,
): SelectionSnapshot {
  const visibleHashes = visibleCommits.map((c) => c.hash);
  const visibleSet = new Set(visibleHashes);
  const nextSelected = selectedCommitHashes.filter((h) => visibleSet.has(h));

  if (nextSelected.length === 0) {
    const fallback = visibleCommits[0]?.hash ?? null;
    if (!fallback) {
      return {
        selectedCommitHash: null,
        selectedCommitHashes: [],
        lastSelectedCommitHash: null,
        rangeOldest: null,
        rangeNewest: null,
      };
    }
    return {
      selectedCommitHash: fallback,
      selectedCommitHashes: [fallback],
      lastSelectedCommitHash: fallback,
      rangeOldest: fallback,
      rangeNewest: fallback,
    };
  }

  const ordered = visibleHashes.filter((h) => nextSelected.includes(h));
  const preferredFocus =
    selectedCommitHash && visibleSet.has(selectedCommitHash);
  const nextFocus = preferredFocus ? selectedCommitHash : ordered[0];
  const nextAnchor =
    lastSelectedCommitHash && visibleSet.has(lastSelectedCommitHash)
      ? lastSelectedCommitHash
      : ordered[0];

  return {
    selectedCommitHash: nextFocus,
    selectedCommitHashes: ordered,
    lastSelectedCommitHash: nextAnchor,
    rangeOldest: ordered[ordered.length - 1],
    rangeNewest: ordered[0],
  };
}

/** Position of `hash` in the log the given filters produce, or null. */
async function locateCommit(
  hash: string,
  params: LogParams,
): Promise<number | null> {
  const result = (await bridge.request("resolveLogRef", {
    query: hash,
    locate: true,
    ...params,
  })) as { index?: number | null } | null;
  return typeof result?.index === "number" ? result.index : null;
}

export const usePanelStore = create<PanelStore>((set, get) => ({
  commits: [],
  visibleCommits: [],
  branches: [],
  tags: [],
  currentBranch: "",
  graphLayout: {},
  laneSnapshot: null,

  selectedCommitHash: null,
  selectedCommitHashes: [],
  lastSelectedCommitHash: null,
  hoveredColumn: null,
  commitFiles: [],
  selectedFilePath: null,
  visibleColumns: { author: true, date: true, hash: true },
  rangeOldest: null,
  rangeNewest: null,
  selectedBranches: [],
  lastSelectedBranch: null,
  selectedTags: [],
  lastSelectedTag: null,
  remoteSectionSelected: false,
  selectedRemoteFolder: null,
  currentBranchRowSelected: false,
  tagsSectionVisible: true,
  branchGroupByDirectory: (() => {
    try {
      return localStorage.getItem("branchGroupByDirectory") === "true";
    } catch {
      return false;
    }
  })(),

  filter: {
    searchQuery: "",
    matchCase: false,
    regex: false,
    branch: "",
    author: "",
    dateRange: "",
    file: "",
  },
  logParams: {},
  pendingSelectionFromFilter: [],
  pendingScrollToHash: null,
  collapsedSequenceIds: new Set(),
  collapsedIntermediates: new Map(),

  loading: false,
  loadedOnce: false,
  hasMore: true,
  operationInProgress: false,

  async fetchInitialData(options) {
    const seq = ++logFetchSeq;
    const previousParams = get().logParams;
    const { filter } = get();
    const logParams = buildLogParams(filter, previousParams);
    set({ loading: true, logParams });
    const start = Date.now();
    try {
      const [graphResult, branches, tags] = await Promise.all([
        bridge.request("getGraphData", {
          maxCount: LOG_PAGE_SIZE,
          ...logParams,
        }) as Promise<{
          graphData: { commits: Commit[]; lanes: Record<string, LaneInfo> };
          snapshot: LaneSnapshot;
        } | null>,
        bridge.request("getBranches") as Promise<BranchInfo[] | null>,
        bridge.request("getTags") as Promise<TagInfo[] | null>,
      ]);

      if (seq !== logFetchSeq) return;

      const commits = graphResult?.graphData?.commits ?? [];
      const lanes = graphResult?.graphData?.lanes ?? {};
      const snapshot = graphResult?.snapshot ?? null;
      const branchList = branches ?? [];
      const tagList = tags ?? [];
      const current = branchList.find((b) => b.isCurrent)?.name ?? "";

      const { pendingSelectionFromFilter, collapsedIntermediates } = get();

      const visible = filterCommits(commits, filter, collapsedIntermediates);

      // Check if we need to restore selection from a cleared filter
      if (pendingSelectionFromFilter.length > 0) {
        const validHashes = pendingSelectionFromFilter.filter((h) =>
          commits.some((c) => c.hash === h),
        );
        if (validHashes.length > 0) {
          set({
            commits,
            visibleCommits: visible,
            graphLayout: lanes,
            laneSnapshot: snapshot,
            branches: branchList,
            tags: tagList,
            currentBranch: current,

            hasMore: commits.length >= LOG_PAGE_SIZE,
            selectedCommitHash: validHashes[0],
            selectedCommitHashes: validHashes,
            lastSelectedCommitHash: validHashes[0],
            commitFiles: [],
            selectedFilePath: null,
            rangeOldest: validHashes[validHashes.length - 1],
            rangeNewest: validHashes[0],
            pendingSelectionFromFilter: [],
          });

          const files = (await bridge.request("getCommitRangeFiles", {
            hashes: validHashes,
          })) as DiffFile[] | null;
          set({ commitFiles: files ?? [] });
          return;
        }
      }

      set({
        commits,
        visibleCommits: visible,
        graphLayout: lanes,
        laneSnapshot: snapshot,
        branches: branchList,
        tags: tagList,
        currentBranch: current,

        hasMore: commits.length >= LOG_PAGE_SIZE,
        selectedCommitHash: null,
        selectedCommitHashes: [],
        lastSelectedCommitHash: null,
        commitFiles: [],
        selectedFilePath: null,
        rangeOldest: null,
        rangeNewest: null,
        pendingSelectionFromFilter: [],
      });
    } catch (err) {
      if (seq === logFetchSeq) {
        // The list on screen is still the one `previousParams` produced, so
        // the branch/path chips must not claim otherwise. The typed text stays
        // for the user to fix.
        set({
          logParams: previousParams,
          filter: {
            ...get().filter,
            branch: previousParams.branch ?? "",
            file: previousParams.file ?? "",
          },
        });
        await reportActionError("Load Git Log", err);
      }
    } finally {
      if (seq === logFetchSeq) {
        const elapsed = Date.now() - start;
        if (!options?.quick && elapsed < 1000) {
          await new Promise((r) => setTimeout(r, 1000 - elapsed));
        }
        if (seq === logFetchSeq) {
          set({ loading: false, loadedOnce: true });
        }
      }
    }
  },

  async loadMore(count = LOG_PAGE_SIZE) {
    const { commits, laneSnapshot, hasMore, loading, logParams } = get();
    if (!hasMore || loading) return;

    const seq = logFetchSeq;
    set({ loading: true });
    try {
      const result = (await bridge.request("loadMoreLog", {
        skip: commits.length,
        count,
        snapshot: laneSnapshot,
        ...logParams,
      })) as {
        graphData: { commits: Commit[]; lanes: Record<string, LaneInfo> };
        snapshot: LaneSnapshot;
      } | null;

      // A newer fetch replaced the list while this page was in flight.
      if (seq !== logFetchSeq) return;

      if (result?.graphData?.commits?.length) {
        const newCommits = result.graphData.commits;
        const allCommits = [...commits, ...newCommits];
        set({
          commits: allCommits,
          visibleCommits: filterCommits(
            allCommits,
            get().filter,
            get().collapsedIntermediates,
          ),
          graphLayout: { ...get().graphLayout, ...result.graphData.lanes },
          laneSnapshot: result.snapshot,
          hasMore: newCommits.length >= count,
          loading: false,
        });
      } else {
        set({ hasMore: false, loading: false });
      }
    } catch (err) {
      if (seq !== logFetchSeq) return;
      await reportActionError("loadMore", err);
      set({ loading: false });
    }
  },

  async selectCommit(
    hash: string,
    mode: SelectionMode = "single",
    allVisibleCommits: string[] = [],
  ) {
    const { selectedCommitHashes, lastSelectedCommitHash } = get();
    let nextSelected: string[] = [];
    let nextAnchor = lastSelectedCommitHash;

    if (mode === "single") {
      nextSelected = [hash];
      nextAnchor = hash;
    } else if (mode === "toggle") {
      if (selectedCommitHashes.includes(hash)) {
        nextSelected = selectedCommitHashes.filter((h) => h !== hash);
        if (nextSelected.length === 0) {
          nextSelected = [hash];
        }
      } else {
        nextSelected = [...selectedCommitHashes, hash];
      }
      nextAnchor = hash;
    } else {
      const anchor = lastSelectedCommitHash;
      if (!anchor || allVisibleCommits.length === 0) {
        nextSelected = [hash];
        nextAnchor = hash;
      } else {
        const anchorIdx = allVisibleCommits.indexOf(anchor);
        const targetIdx = allVisibleCommits.indexOf(hash);
        if (anchorIdx === -1 || targetIdx === -1) {
          nextSelected = [hash];
          nextAnchor = hash;
        } else {
          const start = Math.min(anchorIdx, targetIdx);
          const end = Math.max(anchorIdx, targetIdx);
          nextSelected = allVisibleCommits.slice(start, end + 1);
        }
      }
    }

    const focusHash = nextSelected.includes(hash)
      ? hash
      : (nextSelected[nextSelected.length - 1] ?? hash);

    // Sort selected hashes by visible list order (newest first)
    const selected = new Set(nextSelected);
    const orderedHashes =
      allVisibleCommits.length > 0
        ? allVisibleCommits.filter((h) => selected.has(h))
        : nextSelected;

    set({
      selectedCommitHash: focusHash,
      selectedCommitHashes: nextSelected,
      lastSelectedCommitHash: nextAnchor,
      commitFiles: [],
      selectedFilePath: null,
      rangeOldest: orderedHashes[orderedHashes.length - 1],
      rangeNewest: orderedHashes[0],
      // Clear other list selections so they don't persist visually.
      selectedBranches: [],
      selectedTags: [],
      lastSelectedBranch: null,
      lastSelectedTag: null,
      remoteSectionSelected: false,
      selectedRemoteFolder: null,
      currentBranchRowSelected: false,
    });
    const requestSeq = ++commitFilesRequestSeq;
    try {
      const files = (await bridge.request("getCommitRangeFiles", {
        hashes: orderedHashes,
      })) as DiffFile[] | null;
      // A newer selection owns the file list now; drop this stale response.
      if (requestSeq !== commitFilesRequestSeq) return;
      set({ commitFiles: files ?? [] });
    } catch (err) {
      await reportActionError("selectCommit", err);
    }
  },

  async focusCommit(hash: string) {
    const { filter, collapsedSequenceIds } = get();

    // Drop client-side filters / collapsed sequences that would hide the target.
    if (filter.author || filter.dateRange || collapsedSequenceIds.size > 0) {
      const nextFilter = { ...filter, author: "", dateRange: "" };
      const nextVisible = filterCommits(get().commits, nextFilter, new Map());
      set({
        filter: nextFilter,
        collapsedSequenceIds: new Set(),
        collapsedIntermediates: new Map(),
        visibleCommits: nextVisible,
      });
    }

    // Initial data may still be loading (cold start): let it finish first so
    // our paging starts from a consistent state.
    let waits = 0;
    while (get().loading && waits < 50) {
      await new Promise((r) => setTimeout(r, 100));
      waits++;
    }

    try {
      if (!get().commits.some((c) => c.hash === hash)) {
        // Ask the host where the commit sits in the list the current filters
        // produce, so the right number of commits is loaded in one go.
        let index = await locateCommit(hash, get().logParams);
        if (index === null && hasLogFilter(get().logParams)) {
          // The text/path/branch filter hides it: Go To means "show me that
          // commit", so lift those filters and look again.
          set({
            filter: { ...get().filter, searchQuery: "", file: "", branch: "" },
            pendingSelectionFromFilter: [],
            collapsedSequenceIds: new Set(),
            collapsedIntermediates: new Map(),
          });
          await get().fetchInitialData({ quick: true });
          index = await locateCommit(hash, get().logParams);
        }
        if (index === null) {
          throw new Error(
            `commit ${hash.slice(0, 8)} is not in the log (not reachable from any branch or tag, or deeper than the search limit)`,
          );
        }

        const seq = logFetchSeq;
        for (let pages = 0; pages < 30; pages++) {
          const loaded = get().commits.length;
          if (loaded > index || !get().hasMore || seq !== logFetchSeq) break;
          await get().loadMore(
            Math.min(
              Math.max(index + 1 - loaded, LOG_PAGE_SIZE),
              LOG_JUMP_PAGE_SIZE,
            ),
          );
          if (get().commits.length === loaded) break;
        }
        if (seq !== logFetchSeq) return; // the filter changed under us
      }

      const visible = get().visibleCommits;
      if (!visible.some((c) => c.hash === hash)) {
        throw new Error(
          `commit ${hash.slice(0, 8)} could not be loaded into the log`,
        );
      }
      await get().selectCommit(
        hash,
        "single",
        visible.map((c) => c.hash),
      );
      set({ pendingScrollToHash: hash });
    } catch (err) {
      await reportActionError("Go to commit", err);
    }
  },

  async goToRef(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return false;
    try {
      const result = (await bridge.request("resolveLogRef", {
        query: trimmed,
      })) as { hash?: string } | null;
      if (!result?.hash) return false;
      await get().focusCommit(result.hash);
      return get().selectedCommitHash === result.hash;
    } catch (err) {
      await reportActionError("Go to Hash/Branch/Tag", err);
      return false;
    }
  },

  consumePendingScrollToHash() {
    set({ pendingScrollToHash: null });
  },

  selectFile(filePath: string) {
    set({ selectedFilePath: filePath });
  },

  async openDiffEditor(commitHash: string, file: DiffFile) {
    try {
      const { selectedCommitHashes, commitFiles } = get();
      const filePath = file.newPath || file.oldPath;
      const isMulti = selectedCommitHashes.length > 1;

      if (isMulti) {
        await bridge.request("openDiffEditor", {
          commit: selectedCommitHashes[0],
          filePath,
          file,
          cherryPickHashes: selectedCommitHashes,
          fileList: commitFiles,
        });
      } else {
        await bridge.request("openDiffEditor", {
          commit: commitHash,
          filePath,
          file,
          fileList: commitFiles,
        });
      }
    } catch (err) {
      await reportActionError("openDiffEditor", err);
    }
  },

  setFilter(partial: Partial<PanelFilter>) {
    const { filter: current, selectedCommitHashes, commits, logParams } = get();
    const next = { ...current, ...partial };

    // Anything the host filters on (branch, path, message text and its
    // Match Case / Regex toggles) needs a re-fetch. An unfinished regex builds
    // the same params as before, so it only updates the filter state.
    if (!sameLogParams(buildLogParams(next, logParams), logParams)) {
      const textOnly =
        next.branch === current.branch && next.file === current.file;
      set({
        filter: next,
        // A text change keeps the selection when its commits are still listed.
        pendingSelectionFromFilter: textOnly ? selectedCommitHashes : [],
        collapsedSequenceIds: new Set(),
        collapsedIntermediates: new Map(),
      });
      void get().fetchInitialData({ quick: textOnly });
      return;
    }

    // Author/date filter: client-side only
    const wasFiltered = !!(current.author || current.dateRange);
    const isNowFiltered = !!(next.author || next.dateRange);
    const visible = filterCommits(commits, next, get().collapsedIntermediates);

    if (wasFiltered && !isNowFiltered) {
      // Clearing filter → save current selection for restoration
      set({
        filter: next,
        visibleCommits: visible,
        pendingSelectionFromFilter: selectedCommitHashes,
      });
    } else {
      set({
        filter: next,
        visibleCommits: visible,
        pendingSelectionFromFilter: [],
      });
    }
  },

  selectBranch(
    name: string,
    mode: "single" | "toggle" | "range",
    allVisibleBranches: string[],
  ) {
    // Mutually exclusive with commits and tags.
    const clearOthers = {
      selectedCommitHashes: [],
      selectedTags: [],
      lastSelectedCommitHash: null,
      lastSelectedTag: null,
      remoteSectionSelected: false,
      selectedRemoteFolder: null,
      currentBranchRowSelected: false,
    };
    if (mode === "single") {
      set({
        ...clearOthers,
        selectedBranches: [name],
        lastSelectedBranch: name,
      });
    } else if (mode === "toggle") {
      const current = get().selectedBranches;
      if (current.includes(name)) {
        set({
          ...clearOthers,
          selectedBranches: current.filter((b) => b !== name),
          lastSelectedBranch: name,
        });
      } else {
        set({
          ...clearOthers,
          selectedBranches: [...current, name],
          lastSelectedBranch: name,
        });
      }
    } else {
      // range - keep the original anchor (lastSelectedBranch) so
      // consecutive Shift+Arrow presses extend from the same start.
      const anchor = get().lastSelectedBranch;
      if (!anchor) {
        set({ selectedBranches: [name], lastSelectedBranch: name });
        return;
      }
      const anchorIdx = allVisibleBranches.indexOf(anchor);
      const targetIdx = allVisibleBranches.indexOf(name);
      if (anchorIdx === -1 || targetIdx === -1) {
        set({ selectedBranches: [name], lastSelectedBranch: name });
        return;
      }
      const start = Math.min(anchorIdx, targetIdx);
      const end = Math.max(anchorIdx, targetIdx);
      set({
        ...clearOthers,
        selectedBranches: allVisibleBranches.slice(start, end + 1),
      });
    }
  },

  selectTag(
    name: string,
    mode: "single" | "toggle" | "range",
    allVisibleTags: string[],
  ) {
    // Mutually exclusive with commits and branches.
    const clearOthers = {
      selectedCommitHashes: [],
      selectedBranches: [],
      lastSelectedCommitHash: null,
      lastSelectedBranch: null,
      remoteSectionSelected: false,
      selectedRemoteFolder: null,
      currentBranchRowSelected: false,
    };
    if (mode === "single") {
      set({
        ...clearOthers,
        selectedTags: [name],
        lastSelectedTag: name,
      });
    } else if (mode === "toggle") {
      const current = get().selectedTags;
      if (current.includes(name)) {
        set({
          ...clearOthers,
          selectedTags: current.filter((t) => t !== name),
          lastSelectedTag: name,
        });
      } else {
        set({
          ...clearOthers,
          selectedTags: [...current, name],
          lastSelectedTag: name,
        });
      }
    } else {
      const anchor = get().lastSelectedTag;
      if (!anchor) {
        set({ selectedTags: [name], lastSelectedTag: name });
        return;
      }
      const anchorIdx = allVisibleTags.indexOf(anchor);
      const targetIdx = allVisibleTags.indexOf(name);
      if (anchorIdx === -1 || targetIdx === -1) {
        set({ selectedTags: [name], lastSelectedTag: name });
        return;
      }
      const start = Math.min(anchorIdx, targetIdx);
      const end = Math.max(anchorIdx, targetIdx);
      set({
        ...clearOthers,
        selectedTags: allVisibleTags.slice(start, end + 1),
      });
    }
  },

  clearAllSelections() {
    set({
      selectedBranches: [],
      selectedTags: [],
      selectedCommitHashes: [],
      selectedCommitHash: null,
      lastSelectedBranch: null,
      lastSelectedTag: null,
      lastSelectedCommitHash: null,
      commitFiles: [],
      selectedFilePath: null,
      rangeOldest: null,
      rangeNewest: null,
      remoteSectionSelected: false,
      selectedRemoteFolder: null,
      currentBranchRowSelected: false,
    });
  },

  setRemoteSectionSelected(selected: boolean) {
    if (selected) {
      set({
        remoteSectionSelected: true,
        selectedRemoteFolder: null,
        currentBranchRowSelected: false,
        selectedBranches: [],
        selectedTags: [],
        selectedCommitHashes: [],
        selectedCommitHash: null,
        lastSelectedBranch: null,
        lastSelectedTag: null,
        lastSelectedCommitHash: null,
        commitFiles: [],
        selectedFilePath: null,
        rangeOldest: null,
        rangeNewest: null,
      });
    } else {
      set({ remoteSectionSelected: false });
    }
  },

  setSelectedRemoteFolder(remoteName: string | null) {
    if (!remoteName) {
      set({ selectedRemoteFolder: null });
      return;
    }
    set({
      selectedRemoteFolder: remoteName,
      remoteSectionSelected: false,
      currentBranchRowSelected: false,
      selectedBranches: [],
      selectedTags: [],
      selectedCommitHashes: [],
      selectedCommitHash: null,
      lastSelectedBranch: null,
      lastSelectedTag: null,
      lastSelectedCommitHash: null,
      commitFiles: [],
      selectedFilePath: null,
      rangeOldest: null,
      rangeNewest: null,
    });
  },

  setCurrentBranchRowSelected(selected: boolean) {
    if (selected) {
      set({
        currentBranchRowSelected: true,
        remoteSectionSelected: false,
        selectedRemoteFolder: null,
        selectedBranches: [],
        selectedTags: [],
        selectedCommitHashes: [],
        selectedCommitHash: null,
        lastSelectedBranch: null,
        lastSelectedTag: null,
        lastSelectedCommitHash: null,
        commitFiles: [],
        selectedFilePath: null,
        rangeOldest: null,
        rangeNewest: null,
      });
    } else {
      set({ currentBranchRowSelected: false });
    }
  },

  setHoveredColumn(column: number | null) {
    set({ hoveredColumn: column });
  },

  toggleColumnVisibility(column: "author" | "date" | "hash") {
    set((state) => ({
      visibleColumns: {
        ...state.visibleColumns,
        [column]: !state.visibleColumns[column],
      },
    }));
  },

  toggleBranchGroupByDirectory() {
    set((state) => {
      const next = !state.branchGroupByDirectory;
      try {
        localStorage.setItem("branchGroupByDirectory", String(next));
      } catch {
        // ignore
      }
      return { branchGroupByDirectory: next };
    });
  },

  toggleTagsSectionVisible() {
    set((state) => ({ tagsSectionVisible: !state.tagsSectionVisible }));
  },

  toggleSequenceCollapse(sequenceId: string, intermediates: string[]) {
    const {
      commits,
      filter,
      collapsedSequenceIds,
      collapsedIntermediates,
      selectedCommitHashes,
      selectedCommitHash,
      lastSelectedCommitHash,
    } = get();
    const nextIds = new Set(collapsedSequenceIds);
    const nextMap = new Map(collapsedIntermediates);

    if (nextIds.has(sequenceId)) {
      nextIds.delete(sequenceId);
      nextMap.delete(sequenceId);
    } else {
      nextIds.add(sequenceId);
      nextMap.set(sequenceId, intermediates);
    }

    const nextVisible = filterCommits(commits, filter, nextMap);
    const nextSelection = deriveSelectionFromVisible(
      nextVisible,
      selectedCommitHashes,
      selectedCommitHash,
      lastSelectedCommitHash,
    );

    set({
      collapsedSequenceIds: nextIds,
      collapsedIntermediates: nextMap,
      visibleCommits: nextVisible,
      selectedCommitHash: nextSelection.selectedCommitHash,
      selectedCommitHashes: nextSelection.selectedCommitHashes,
      lastSelectedCommitHash: nextSelection.lastSelectedCommitHash,
      rangeOldest: nextSelection.rangeOldest,
      rangeNewest: nextSelection.rangeNewest,
      selectedFilePath: null,
      commitFiles: [],
    });

    const hashes = nextSelection.selectedCommitHashes;
    if (hashes.length > 0) {
      void (async () => {
        try {
          const files = (await bridge.request("getCommitRangeFiles", {
            hashes,
          })) as DiffFile[] | null;
          set({ commitFiles: files ?? [] });
        } catch (err) {
          await reportActionError(
            "toggleSequenceCollapse failed to load files",
            err,
          );
        }
      })();
    }
  },

  async refresh() {
    set({ collapsedSequenceIds: new Set(), collapsedIntermediates: new Map() });
    await get().fetchInitialData();
  },
}));

// Listen for git state changes
bridge.onEvent((event, data) => {
  if (event === "gitStateChanged") {
    // A full refresh resets the user's selection and collapsed sequences, so
    // it only runs for events that can actually move commits, branches or
    // tags. Saving a file broadcasts scope:"status" every time, a merge state
    // change broadcasts "mergeState", and "navigateToHead" is just a scroll
    // request — none of those should rebuild the graph.
    const { scope } = (data ?? {}) as { scope?: string };
    if (
      scope === "status" ||
      scope === "mergeState" ||
      scope === "navigateToHead"
    ) {
      return;
    }
    usePanelStore.getState().refresh();
  }
  if (event === "showFileHistory") {
    const { file } = data as { file: string };
    usePanelStore.getState().setFilter({ file });
  }
  if (event === "focusCommitInGraph") {
    const { hash } = data as { hash: string };
    void usePanelStore.getState().focusCommit(hash);
  }
  if (event === "operationStart") {
    usePanelStore.setState({ operationInProgress: true });
  }
  if (event === "operationEnd") {
    usePanelStore.setState({ operationInProgress: false });
  }
});
