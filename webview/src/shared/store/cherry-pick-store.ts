import { create } from "zustand";
import { bridge, reportActionError } from "../bridge";
import { usePanelStore } from "./panel-store";

const STORAGE_KEY = "highlightNotCherryPicked";
const DEBOUNCE_MS = 150;

let timer: ReturnType<typeof setTimeout> | undefined;
/** Bumped per request so a slow, stale response never overwrites a newer one. */
let sequence = 0;

interface CherryMarksResult {
  notCherryPicked: string[];
  cherryPicked: string[];
}

interface CherryPickStore {
  /** "Highlight Not Cherry-Picked Commits": dim what is already in HEAD. */
  enabled: boolean;
  /** The ref HEAD is currently compared against. */
  ref: string | null;
  /** Commits (either side of a pair) that have a patch-equivalent in HEAD. */
  cherryPicked: Set<string>;
  /** Commits of `ref` with no patch-equivalent in HEAD. */
  notCherryPicked: Set<string>;
  setEnabled: (enabled: boolean) => void;
}

export interface CherrySelection {
  selectedBranches: string[];
  selectedTags: string[];
  selectedCommitHash: string | null;
  currentBranchRowSelected: boolean;
  filter: { branch: string };
}

/** What the selection points at: a branch, a tag or a commit. Null means nothing to compare. */
export function selectionRef(selection: CherrySelection): string | null {
  if (selection.currentBranchRowSelected) return null;
  return (
    selection.selectedBranches[selection.selectedBranches.length - 1] ??
    selection.selectedTags[selection.selectedTags.length - 1] ??
    selection.selectedCommitHash ??
    (selection.filter.branch || null)
  );
}

/**
 * The ref to compare against. Clicking a commit that the current comparison
 * already covers keeps the branch the user picked, instead of narrowing the
 * comparison to that one commit's ancestors.
 */
export function chooseCherryRef(
  selected: string | null,
  current: { ref: string | null; known: ReadonlySet<string> },
): string | null {
  if (selected === null) return null;
  if (current.ref !== null && current.known.has(selected)) return current.ref;
  return selected;
}

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export const useCherryPickStore = create<CherryPickStore>((set) => ({
  enabled: readEnabled(),
  ref: null,
  cherryPicked: new Set(),
  notCherryPicked: new Set(),
  setEnabled(enabled) {
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {
      // Storage can be unavailable; the choice then lasts for this session.
    }
    set({ enabled });
    if (enabled) schedule();
    else clearMarks();
  },
}));

function clearMarks(): void {
  clearTimeout(timer);
  sequence++;
  useCherryPickStore.setState({
    ref: null,
    cherryPicked: new Set(),
    notCherryPicked: new Set(),
  });
}

async function recompute(): Promise<void> {
  const state = useCherryPickStore.getState();
  if (!state.enabled) return;

  const known = new Set([...state.cherryPicked, ...state.notCherryPicked]);
  const ref = chooseCherryRef(selectionRef(usePanelStore.getState()), {
    ref: state.ref,
    known,
  });
  if (ref === null) {
    clearMarks();
    return;
  }

  const mine = ++sequence;
  try {
    const result = (await bridge.request("getNotCherryPickedCommits", {
      ref,
    })) as CherryMarksResult;
    if (mine !== sequence || !useCherryPickStore.getState().enabled) return;
    useCherryPickStore.setState({
      ref,
      cherryPicked: new Set(result.cherryPicked),
      notCherryPicked: new Set(result.notCherryPicked),
    });
  } catch (err) {
    if (mine !== sequence) return;
    void reportActionError("Highlight not cherry-picked commits", err);
  }
}

function schedule(): void {
  clearTimeout(timer);
  timer = setTimeout(() => void recompute(), DEBOUNCE_MS);
}

usePanelStore.subscribe((state, prev) => {
  if (!useCherryPickStore.getState().enabled) return;
  if (
    state.selectedBranches !== prev.selectedBranches ||
    state.selectedTags !== prev.selectedTags ||
    state.selectedCommitHash !== prev.selectedCommitHash ||
    state.currentBranchRowSelected !== prev.currentBranchRowSelected ||
    state.filter.branch !== prev.filter.branch
  ) {
    schedule();
  }
});

bridge.onEvent((event, data) => {
  if (event !== "gitStateChanged") return;
  // Same filter as the panel's own refresh: these scopes cannot move commits.
  const { scope } = (data ?? {}) as { scope?: string };
  if (
    scope === "status" ||
    scope === "mergeState" ||
    scope === "navigateToHead"
  ) {
    return;
  }
  if (useCherryPickStore.getState().enabled) schedule();
});
