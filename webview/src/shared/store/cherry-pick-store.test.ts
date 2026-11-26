import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePanelStore } from "./panel-store";

const mockBridgeRequest = vi.fn();
vi.mock("../bridge", () => ({
  bridge: {
    request: (...args: unknown[]) => mockBridgeRequest(...args),
    onEvent: () => () => {},
  },
  reportActionError: vi.fn(),
}));

import {
  type CherrySelection,
  chooseCherryRef,
  selectionRef,
  useCherryPickStore,
} from "./cherry-pick-store";

const selection = (patch: Partial<CherrySelection> = {}): CherrySelection => ({
  selectedBranches: [],
  selectedTags: [],
  selectedCommitHash: null,
  currentBranchRowSelected: false,
  filter: { branch: "" },
  ...patch,
});

describe("selectionRef", () => {
  it("prefers the last selected branch, then tag, then commit, then the branch filter", () => {
    expect(
      selectionRef(
        selection({
          selectedBranches: ["a", "b"],
          selectedTags: ["v1"],
          selectedCommitHash: "abc",
        }),
      ),
    ).toBe("b");
    expect(
      selectionRef(
        selection({ selectedTags: ["v1"], selectedCommitHash: "abc" }),
      ),
    ).toBe("v1");
    expect(selectionRef(selection({ selectedCommitHash: "abc" }))).toBe("abc");
    expect(selectionRef(selection({ filter: { branch: "dev" } }))).toBe("dev");
    expect(selectionRef(selection())).toBeNull();
  });

  it("has nothing to compare when the current branch row is selected", () => {
    expect(
      selectionRef(
        selection({
          currentBranchRowSelected: true,
          selectedCommitHash: "abc",
        }),
      ),
    ).toBeNull();
  });
});

describe("chooseCherryRef", () => {
  const known = new Set(["c1", "c2"]);

  it("keeps the picked branch while clicking commits the comparison covers", () => {
    expect(chooseCherryRef("c1", { ref: "feature", known })).toBe("feature");
  });

  it("follows the selection when it is outside the current comparison", () => {
    expect(chooseCherryRef("other", { ref: "feature", known })).toBe("other");
    expect(chooseCherryRef("feature2", { ref: "feature", known })).toBe(
      "feature2",
    );
    expect(chooseCherryRef("c1", { ref: null, known })).toBe("c1");
  });

  it("clears when nothing is selected", () => {
    expect(chooseCherryRef(null, { ref: "feature", known })).toBeNull();
  });
});

describe("cherry-pick store", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    mockBridgeRequest.mockReset();
    useCherryPickStore.getState().setEnabled(false);
    usePanelStore.setState({
      selectedBranches: [],
      selectedTags: [],
      selectedCommitHash: null,
      currentBranchRowSelected: false,
    });
  });

  it("asks the host for the selected branch and keeps the answer", async () => {
    mockBridgeRequest.mockResolvedValue({
      notCherryPicked: ["n1"],
      cherryPicked: ["c1", "c2"],
    });
    useCherryPickStore.getState().setEnabled(true);
    usePanelStore.setState({ selectedBranches: ["feature"] });
    await vi.advanceTimersByTimeAsync(200);

    expect(mockBridgeRequest).toHaveBeenCalledTimes(1);
    expect(mockBridgeRequest).toHaveBeenCalledWith(
      "getNotCherryPickedCommits",
      { ref: "feature" },
    );
    const state = useCherryPickStore.getState();
    expect(state.ref).toBe("feature");
    expect(state.cherryPicked).toEqual(new Set(["c1", "c2"]));
    expect(state.notCherryPicked).toEqual(new Set(["n1"]));
  });

  it("does not ask while disabled, and clears when turned off", async () => {
    usePanelStore.setState({ selectedBranches: ["feature"] });
    await vi.advanceTimersByTimeAsync(200);
    expect(mockBridgeRequest).not.toHaveBeenCalled();

    useCherryPickStore.setState({ cherryPicked: new Set(["c1"]) });
    useCherryPickStore.getState().setEnabled(false);
    expect(useCherryPickStore.getState().cherryPicked.size).toBe(0);
  });

  it("drops a stale answer that arrives after a newer selection", async () => {
    let releaseFirst: (value: unknown) => void = () => {};
    mockBridgeRequest
      .mockImplementationOnce(
        () => new Promise((resolve) => (releaseFirst = resolve)),
      )
      .mockResolvedValueOnce({ notCherryPicked: [], cherryPicked: ["new"] });

    useCherryPickStore.getState().setEnabled(true);
    usePanelStore.setState({ selectedBranches: ["old"] });
    await vi.advanceTimersByTimeAsync(200);
    usePanelStore.setState({ selectedBranches: ["new-branch"] });
    await vi.advanceTimersByTimeAsync(200);
    releaseFirst({ notCherryPicked: [], cherryPicked: ["stale"] });
    await vi.advanceTimersByTimeAsync(0);

    expect(useCherryPickStore.getState().ref).toBe("new-branch");
    expect(useCherryPickStore.getState().cherryPicked).toEqual(
      new Set(["new"]),
    );
  });
});
