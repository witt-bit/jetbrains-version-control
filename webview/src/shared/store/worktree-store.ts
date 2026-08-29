import { create } from "zustand";
import { bridge } from "../bridge";
import type { WorktreeInfo } from "../types/git";

interface WorktreeStore {
  worktrees: WorktreeInfo[];
  loading: boolean;
  selectedPath: string | null;

  fetchWorktrees: () => Promise<void>;
  selectWorktree: (path: string | null) => void;
  addWorktree: (
    path: string,
    branch: string,
    newBranch?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  removeWorktree: (
    path: string,
  ) => Promise<{ success: boolean; error?: string }>;
  pruneWorktrees: () => Promise<{ success: boolean; error?: string }>;
}

export const useWorktreeStore = create<WorktreeStore>((set, _get) => ({
  worktrees: [],
  loading: false,
  selectedPath: null,

  fetchWorktrees: async () => {
    set({ loading: true });
    try {
      const result = (await bridge.request("getWorktrees")) as {
        success: boolean;
        data?: WorktreeInfo[];
      };
      if (result.success && result.data) {
        set({ worktrees: result.data });
      }
    } finally {
      set({ loading: false });
    }
  },

  selectWorktree: (path) => {
    set({ selectedPath: path });
  },

  addWorktree: async (path, branch, newBranch) => {
    const result = (await bridge.request("addWorktree", {
      path,
      branch,
      newBranch,
    })) as { success: boolean; error?: string };
    if (result.success) {
      await _get().fetchWorktrees();
    }
    return result;
  },

  removeWorktree: async (path) => {
    const result = (await bridge.request("removeWorktree", {
      path,
    })) as { success: boolean; error?: string };
    if (result.success) {
      await _get().fetchWorktrees();
    }
    return result;
  },

  pruneWorktrees: async () => {
    const result = (await bridge.request("pruneWorktrees")) as {
      success: boolean;
      error?: string;
    };
    if (result.success) {
      await _get().fetchWorktrees();
    }
    return result;
  },
}));
