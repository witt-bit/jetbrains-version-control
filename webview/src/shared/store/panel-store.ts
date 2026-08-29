import { create } from "zustand";
import { bridge } from "../bridge";
import type { SelectionMode } from "../hooks/useModifierClickSelection";
import type {
  BranchInfo,
  Commit,
  DiffFile,
  LaneInfo,
  LaneSnapshot,
  TagInfo,
} from "../types/git";

interface PanelFilter {
  searchQuery: string;
  branch: string;
  author: string;
  dateRange: string;
  file: string;
}

interface PanelStore {
  commits: Commit[];
  /** Commits filtered by search/author (client-side). Graph layout uses full `commits`. */
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
  branchGroupByDirectory: boolean;

  filter: PanelFilter;
  /** Hashes to restore after clearing a filter */
  pendingSelectionFromFilter: string[];
  /** Commit hash waiting to be scrolled into view by CommitList's virtualizer */
  pendingScrollToHash: string | null;
  /** Collapsed sequence IDs */
  collapsedSequenceIds: Set<string>;
  /** sequenceId → intermediate hashes that are hidden */
  collapsedIntermediates: Map<string, string[]>;

  loading: boolean;
  hasMore: boolean;
  operationInProgress: boolean;

  fetchInitialData: () => Promise<void>;
  loadMore: () => Promise<void>;
  selectCommit: (
    hash: string,
    mode?: SelectionMode,
    allVisibleCommits?: string[],
  ) => Promise<void>;
  /** Load/locate a commit from an external source (e.g. blame annotation click) and scroll it into view */
  focusCommit: (hash: string) => Promise<void>;
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
  setHoveredColumn: (column: number | null) => void;
  toggleColumnVisibility: (column: "author" | "date" | "hash") => void;
  toggleSequenceCollapse: (sequenceId: string, intermediates: string[]) => void;
  toggleBranchGroupByDirectory: () => void;
  refresh: () => Promise<void>;
}

interface SelectionSnapshot {
  selectedCommitHash: string | null;
  selectedCommitHashes: string[];
  lastSelectedCommitHash: string | null;
  rangeOldest: string | null;
  rangeNewest: string | null;
}

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

    if (filter.searchQuery) {
      const q = filter.searchQuery.toLowerCase();
      if (
        !c.subject.toLowerCase().includes(q) &&
        !c.body.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
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
  branchGroupByDirectory: (() => {
    try {
      return localStorage.getItem("branchGroupByDirectory") === "true";
    } catch {
      return false;
    }
  })(),

  filter: { searchQuery: "", branch: "", author: "", dateRange: "", file: "" },
  pendingSelectionFromFilter: [],
  pendingScrollToHash: null,
  collapsedSequenceIds: new Set(),
  collapsedIntermediates: new Map(),

  loading: false,
  hasMore: true,
  operationInProgress: false,

  async fetchInitialData() {
    set({ loading: true });
    const start = Date.now();
    try {
      const { filter } = get();
      const [graphResult, branches, tags] = await Promise.all([
        bridge.request("getGraphData", {
          maxCount: 200,
          branch: filter.branch || undefined,
          file: filter.file || undefined,
        }) as Promise<{
          graphData: { commits: Commit[]; lanes: Record<string, LaneInfo> };
          snapshot: LaneSnapshot;
        } | null>,
        bridge.request("getBranches") as Promise<BranchInfo[] | null>,
        bridge.request("getTags") as Promise<TagInfo[] | null>,
      ]);

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

            hasMore: commits.length >= 200,
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

        hasMore: commits.length >= 200,
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
      console.error("fetchInitialData failed:", err);
    } finally {
      const elapsed = Date.now() - start;
      if (elapsed < 1000) {
        await new Promise((r) => setTimeout(r, 1000 - elapsed));
      }
      set({ loading: false });
    }
  },

  async loadMore() {
    const { commits, laneSnapshot, hasMore, loading, filter } = get();
    if (!hasMore || loading) return;

    set({ loading: true });
    try {
      const result = (await bridge.request("loadMoreLog", {
        skip: commits.length,
        count: 200,
        snapshot: laneSnapshot,
        branch: filter.branch || undefined,
      })) as {
        graphData: { commits: Commit[]; lanes: Record<string, LaneInfo> };
        snapshot: LaneSnapshot;
      } | null;

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
          hasMore: newCommits.length >= 200,
          loading: false,
        });
      } else {
        set({ hasMore: false, loading: false });
      }
    } catch (err) {
      console.error("loadMore failed:", err);
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
    });
    try {
      const files = (await bridge.request("getCommitRangeFiles", {
        hashes: orderedHashes,
      })) as DiffFile[] | null;
      set({ commitFiles: files ?? [] });
    } catch (err) {
      console.error("selectCommit failed:", err);
    }
  },

  async focusCommit(hash: string) {
    const { filter, collapsedSequenceIds } = get();

    // Drop client-side filters / collapsed sequences that would hide the target.
    // Note: branch="" → backend --all (already maximal); a file filter still
    // contains the commit because blame commits touched this very file.
    if (
      filter.searchQuery ||
      filter.author ||
      filter.dateRange ||
      collapsedSequenceIds.size > 0
    ) {
      const nextFilter = {
        ...filter,
        searchQuery: "",
        author: "",
        dateRange: "",
      };
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

    // Page in more commits until the target is loaded (blame commits may sit
    // deep in history; lane continuity is preserved by loadMore's snapshot).
    let pages = 0;
    while (
      !get().commits.some((c) => c.hash === hash) &&
      get().hasMore &&
      pages < 25
    ) {
      await get().loadMore();
      pages++;
    }

    const visible = get().visibleCommits;
    const idx = visible.findIndex((c) => c.hash === hash);
    if (idx === -1) {
      console.warn("focusCommit: commit not reachable in current view:", hash);
      return;
    }

    await get().selectCommit(
      hash,
      "single",
      visible.map((c) => c.hash),
    );
    set({ pendingScrollToHash: hash });
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
      console.error("openDiffEditor failed:", err);
    }
  },

  setFilter(partial: Partial<PanelFilter>) {
    const { filter: current, selectedCommitHashes, commits } = get();
    const next = { ...current, ...partial };

    // Branch or file filter changes require a backend re-fetch
    if (
      (partial.branch !== undefined && partial.branch !== current.branch) ||
      (partial.file !== undefined && partial.file !== current.file)
    ) {
      set({
        filter: next,
        pendingSelectionFromFilter: [],
        collapsedSequenceIds: new Set(),
        collapsedIntermediates: new Map(),
      });
      get().fetchInitialData();
      return;
    }

    // Search/author filter: client-side only
    const wasFiltered = !!(
      current.searchQuery ||
      current.author ||
      current.dateRange
    );
    const isNowFiltered = !!(next.searchQuery || next.author || next.dateRange);
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
    if (mode === "single") {
      set({ selectedBranches: [name], lastSelectedBranch: name });
    } else if (mode === "toggle") {
      const current = get().selectedBranches;
      if (current.includes(name)) {
        set({
          selectedBranches: current.filter((b) => b !== name),
          lastSelectedBranch: name,
        });
      } else {
        set({ selectedBranches: [...current, name], lastSelectedBranch: name });
      }
    } else {
      // range
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
      set({ selectedBranches: allVisibleBranches.slice(start, end + 1) });
    }
  },

  selectTag(
    name: string,
    mode: "single" | "toggle" | "range",
    allVisibleTags: string[],
  ) {
    if (mode === "single") {
      set({ selectedTags: [name], lastSelectedTag: name });
    } else if (mode === "toggle") {
      const current = get().selectedTags;
      if (current.includes(name)) {
        set({
          selectedTags: current.filter((t) => t !== name),
          lastSelectedTag: name,
        });
      } else {
        set({ selectedTags: [...current, name], lastSelectedTag: name });
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
      set({ selectedTags: allVisibleTags.slice(start, end + 1) });
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
          console.error("toggleSequenceCollapse failed to load files:", err);
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
