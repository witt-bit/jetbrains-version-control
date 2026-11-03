import { beforeEach, describe, expect, it } from "vitest";
import { usePanelStore } from "./panel-store";

// Mock bridge.request to avoid network calls in tests
const mockBridgeRequest = vi.fn().mockResolvedValue([]);
vi.mock("../bridge", () => ({
  bridge: {
    request: (...args: unknown[]) => mockBridgeRequest(...args),
    onEvent: () => () => {},
  },
}));

function getState() {
  return usePanelStore.getState();
}

describe("PanelStore mutual exclusion", () => {
  beforeEach(() => {
    usePanelStore.setState({
      selectedBranches: [],
      selectedTags: [],
      selectedCommitHashes: [],
      selectedCommitHash: null,
      lastSelectedBranch: null,
      lastSelectedTag: null,
      lastSelectedCommitHash: null,
      remoteSectionSelected: false,
      selectedRemoteFolder: null,
      currentBranchRowSelected: false,
      commitFiles: [],
      selectedFilePath: null,
      rangeOldest: null,
      rangeNewest: null,
    });
  });

  describe("setCurrentBranchRowSelected(true)", () => {
    it("clears all other selections", () => {
      getState().setCurrentBranchRowSelected(true);
      const state = getState();
      expect(state.currentBranchRowSelected).toBe(true);
      expect(state.selectedBranches).toEqual([]);
      expect(state.selectedTags).toEqual([]);
      expect(state.selectedCommitHashes).toEqual([]);
      expect(state.remoteSectionSelected).toBe(false);
    });

    it("does not clear when set to false", () => {
      getState().setCurrentBranchRowSelected(true);
      getState().setCurrentBranchRowSelected(false);
      const state = getState();
      expect(state.currentBranchRowSelected).toBe(false);
    });
  });

  describe("setRemoteSectionSelected(true)", () => {
    it("clears HEAD and all list selections", () => {
      getState().setCurrentBranchRowSelected(true);
      getState().setRemoteSectionSelected(true);
      const state = getState();
      expect(state.remoteSectionSelected).toBe(true);
      expect(state.currentBranchRowSelected).toBe(false);
      expect(state.selectedBranches).toEqual([]);
      expect(state.selectedTags).toEqual([]);
      expect(state.selectedCommitHashes).toEqual([]);
    });

    it("does not clear when set to false", () => {
      getState().setRemoteSectionSelected(true);
      getState().setRemoteSectionSelected(false);
      expect(getState().remoteSectionSelected).toBe(false);
    });
  });

  describe("setSelectedRemoteFolder", () => {
    it("clears the remote section row, HEAD and all list selections", () => {
      getState().setRemoteSectionSelected(true);
      getState().setCurrentBranchRowSelected(true);
      getState().selectBranch("main", "single", ["main"]);
      getState().setSelectedRemoteFolder("origin");
      const state = getState();
      expect(state.selectedRemoteFolder).toBe("origin");
      expect(state.remoteSectionSelected).toBe(false);
      expect(state.currentBranchRowSelected).toBe(false);
      expect(state.selectedBranches).toEqual([]);
      expect(state.selectedTags).toEqual([]);
      expect(state.selectedCommitHashes).toEqual([]);
    });

    it("is cleared when another list takes the selection", () => {
      getState().setSelectedRemoteFolder("origin");
      getState().selectBranch("main", "single", ["main"]);
      expect(getState().selectedRemoteFolder).toBeNull();
    });

    it("is cleared by the HEAD row and the Remote section row", () => {
      getState().setSelectedRemoteFolder("origin");
      getState().setCurrentBranchRowSelected(true);
      expect(getState().selectedRemoteFolder).toBeNull();

      getState().setSelectedRemoteFolder("origin");
      getState().setRemoteSectionSelected(true);
      expect(getState().selectedRemoteFolder).toBeNull();
    });

    it("clears only itself when passed null", () => {
      getState().setSelectedRemoteFolder("origin");
      getState().setSelectedRemoteFolder(null);
      expect(getState().selectedRemoteFolder).toBeNull();
    });
  });

  describe("selectBranch", () => {
    it("clears HEAD, Remote, Tags, and Commits", () => {
      getState().setCurrentBranchRowSelected(true);
      getState().setRemoteSectionSelected(true);
      getState().selectBranch("main", "single", ["main", "dev"]);
      const state = getState();
      expect(state.selectedBranches).toEqual(["main"]);
      expect(state.currentBranchRowSelected).toBe(false);
      expect(state.remoteSectionSelected).toBe(false);
      expect(state.selectedTags).toEqual([]);
      expect(state.selectedCommitHashes).toEqual([]);
    });
  });

  describe("selectTag", () => {
    it("clears HEAD, Remote, Branches, and Commits", () => {
      getState().setCurrentBranchRowSelected(true);
      getState().setRemoteSectionSelected(true);
      getState().selectTag("v1.0", "single", ["v1.0", "v2.0"]);
      const state = getState();
      expect(state.selectedTags).toEqual(["v1.0"]);
      expect(state.currentBranchRowSelected).toBe(false);
      expect(state.remoteSectionSelected).toBe(false);
      expect(state.selectedBranches).toEqual([]);
      expect(state.selectedCommitHashes).toEqual([]);
    });
  });

  describe("clearAllSelections", () => {
    it("clears everything", () => {
      getState().setRemoteSectionSelected(true);
      getState().selectBranch("main", "single", ["main"]);
      getState().selectTag("v1", "single", ["v1"]);
      // HEAD last: any earlier step would clear it for us and mask a
      // clearAllSelections() that forgets the HEAD row.
      getState().setCurrentBranchRowSelected(true);
      getState().clearAllSelections();
      const state = getState();
      expect(state.currentBranchRowSelected).toBe(false);
      expect(state.remoteSectionSelected).toBe(false);
      expect(state.selectedBranches).toEqual([]);
      expect(state.selectedTags).toEqual([]);
      expect(state.selectedCommitHashes).toEqual([]);
    });
  });
});
