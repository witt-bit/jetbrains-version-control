import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCommitStore } from "./commit-store";

const mockBridgeRequest = vi.fn();
vi.mock("../bridge", () => ({
  bridge: {
    request: (...args: unknown[]) => mockBridgeRequest(...args),
    onEvent: () => () => {},
  },
  reportActionError: vi.fn(),
}));

describe("commit-store when the user backs out of a pre-commit warning", () => {
  beforeEach(() => {
    mockBridgeRequest.mockReset();
    useCommitStore.setState({
      commitMessage: "Fix the thing",
      amend: true,
      changes: [],
      selectedFiles: new Set(),
      loading: false,
    });
  });

  it("keeps the message and the amend flag, and reports no commit", async () => {
    mockBridgeRequest.mockResolvedValue({ success: false, cancelled: true });
    expect(await useCommitStore.getState().commit()).toBe(false);
    const state = useCommitStore.getState();
    expect(state.commitMessage).toBe("Fix the thing");
    expect(state.amend).toBe(true);
    expect(state.loading).toBe(false);
  });

  it("clears the message after a commit that went through", async () => {
    mockBridgeRequest.mockResolvedValue({ success: true });
    expect(await useCommitStore.getState().commit()).toBe(true);
    expect(useCommitStore.getState().commitMessage).toBe("");
    expect(useCommitStore.getState().amend).toBe(false);
  });

  it("applies the same rule to commit and push", async () => {
    mockBridgeRequest.mockResolvedValue({ cancelled: true });
    expect(await useCommitStore.getState().commitAndPush()).toBe(false);
    expect(useCommitStore.getState().commitMessage).toBe("Fix the thing");
  });
});
