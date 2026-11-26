import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCommitStore, type WorkingTreeFile } from "./commit-store";

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

describe("commit-store changelists", () => {
  const lists = [
    { id: "default", name: "Changes" },
    { id: "fix", name: "Bug fix" },
  ];
  const info = {
    enabled: true,
    activeId: "default",
    offerMoveOnPartialCommit: true,
    lists,
  };
  const tracked = (path: string, changelist: string): WorkingTreeFile => ({
    path,
    status: "modified",
    staged: false,
    changelist,
  });

  /** Route each bridge command to a canned answer; `calls` records every request. */
  function routeBridge(answers: Record<string, unknown>) {
    const calls: { command: string; params: unknown }[] = [];
    mockBridgeRequest.mockImplementation(
      async (command: string, params: unknown) => {
        calls.push({ command, params });
        const answer = answers[command];
        return typeof answer === "function"
          ? (answer as (p: unknown) => unknown)(params)
          : answer;
      },
    );
    return calls;
  }

  beforeEach(() => {
    mockBridgeRequest.mockReset();
    useCommitStore.setState({
      commitMessage: "",
      amend: false,
      changes: [tracked("a.ts", "fix"), tracked("b.ts", "fix")],
      changelists: info,
      selectedFiles: new Set(),
      highlightedFiles: new Set(),
      collapsedChangelists: new Set(),
      loading: false,
    });
  });

  it("loads the changelist info together with the working tree", async () => {
    routeBridge({
      getWorkingTreeChanges: [tracked("a.ts", "fix")],
      getChangelists: info,
    });
    await useCommitStore.getState().fetchChanges();
    expect(useCommitStore.getState().changelists).toEqual(info);
    expect(useCommitStore.getState().changes[0].changelist).toBe("fix");
  });

  it("treats a malformed or failed getChangelists answer as changelists off", async () => {
    routeBridge({
      getWorkingTreeChanges: [tracked("a.ts", "fix")],
      getChangelists: { status: "not_git_repo", data: null },
    });
    await useCommitStore.getState().fetchChanges();
    expect(useCommitStore.getState().changelists).toBeNull();
  });

  it("shelves a changelist with its own files, never the whole worktree", async () => {
    useCommitStore.setState({
      changes: [
        tracked("a.ts", "fix"),
        tracked("b.ts", "default"),
        tracked("c.ts", "fix"),
      ],
    });
    const calls = routeBridge({
      getWorkingTreeChanges: [],
      getChangelists: info,
    });
    await useCommitStore.getState().shelveChangelist("fix");
    expect(
      calls.find((c) => c.command === "ideaShelveChanges")?.params,
    ).toEqual({
      message: "Bug fix",
      filePaths: ["a.ts", "c.ts"],
    });
  });

  it("does not shelve an empty changelist", async () => {
    useCommitStore.setState({ changes: [tracked("b.ts", "default")] });
    const calls = routeBridge({});
    await useCommitStore.getState().shelveChangelist("fix");
    expect(calls).toEqual([]);
  });

  describe("deleteChangelist", () => {
    it("asks before deleting a list that still has files", async () => {
      const calls = routeBridge({
        showConfirmMessage: { confirmed: false },
        getWorkingTreeChanges: [],
        getChangelists: info,
      });
      await useCommitStore.getState().deleteChangelist("fix");
      expect(calls.map((c) => c.command)).toEqual(["showConfirmMessage"]);
    });

    it("deletes once confirmed", async () => {
      const calls = routeBridge({
        showConfirmMessage: { confirmed: true },
        deleteChangelist: { success: true },
        getWorkingTreeChanges: [],
        getChangelists: info,
      });
      await useCommitStore.getState().deleteChangelist("fix");
      expect(
        calls.find((c) => c.command === "deleteChangelist")?.params,
      ).toEqual({ id: "fix" });
    });

    it("deletes an empty list without asking", async () => {
      useCommitStore.setState({ changes: [tracked("b.ts", "default")] });
      const calls = routeBridge({
        deleteChangelist: { success: true },
        getWorkingTreeChanges: [],
        getChangelists: info,
      });
      await useCommitStore.getState().deleteChangelist("fix");
      expect(calls.map((c) => c.command)).not.toContain("showConfirmMessage");
      expect(calls.map((c) => c.command)).toContain("deleteChangelist");
    });

    it("never deletes the default list", async () => {
      const calls = routeBridge({});
      await useCommitStore.getState().deleteChangelist("default");
      expect(calls).toEqual([]);
    });
  });

  describe("promptMoveToChangelist", () => {
    it("moves the files to the list the user picks", async () => {
      const calls = routeBridge({
        showQuickPick: { value: "Bug fix" },
        moveToChangelist: { success: true },
        getWorkingTreeChanges: [],
        getChangelists: info,
      });
      await useCommitStore.getState().promptMoveToChangelist(["a.ts"]);
      expect(
        calls.find((c) => c.command === "moveToChangelist")?.params,
      ).toEqual({ id: "fix", filePaths: ["a.ts"] });
    });

    it("moves nothing when the picker is dismissed", async () => {
      const calls = routeBridge({ showQuickPick: { value: null } });
      await useCommitStore.getState().promptMoveToChangelist(["a.ts"]);
      expect(calls.map((c) => c.command)).toEqual(["showQuickPick"]);
    });

    it("creates a list holding the files when New Changelist is picked", async () => {
      const calls = routeBridge({
        showQuickPick: (params: unknown) => ({
          value: (params as { items: string[] }).items.at(-1),
        }),
        showInputBox: { value: "Refactor" },
        createChangelist: { success: true, id: "refactor" },
        getWorkingTreeChanges: [],
        getChangelists: info,
      });
      await useCommitStore.getState().promptMoveToChangelist(["a.ts", "b.ts"]);
      expect(
        calls.find((c) => c.command === "createChangelist")?.params,
      ).toEqual({ name: "Refactor", filePaths: ["a.ts", "b.ts"] });
    });
  });

  it("does not create a changelist when the name prompt is left blank", async () => {
    const calls = routeBridge({ showInputBox: { value: "   " } });
    expect(await useCommitStore.getState().createChangelist()).toBeNull();
    expect(calls.map((c) => c.command)).toEqual(["showInputBox"]);
  });

  describe("partial commit offer", () => {
    beforeEach(() => {
      useCommitStore.setState({
        commitMessage: "Fix a",
        selectedFiles: new Set(["a.ts:false"]),
      });
    });

    it("offers to move the files left behind after committing part of a list", async () => {
      const calls = routeBridge({
        commitChanges: { success: true },
        getWorkingTreeChanges: [tracked("b.ts", "fix")],
        getChangelists: info,
        showQuickPick: (params: unknown) => ({
          value: (params as { items: string[] }).items[0],
        }),
        showInputBox: { value: "Leftovers" },
        createChangelist: { success: true, id: "leftovers" },
      });
      expect(await useCommitStore.getState().commit()).toBe(true);
      await vi.waitFor(() =>
        expect(
          calls.find((c) => c.command === "createChangelist")?.params,
        ).toEqual({ name: "Leftovers", filePaths: ["b.ts"] }),
      );
    });

    it("leaves the files where they are when the user keeps them", async () => {
      const calls = routeBridge({
        commitChanges: { success: true },
        getWorkingTreeChanges: [tracked("b.ts", "fix")],
        getChangelists: info,
        showQuickPick: (params: unknown) => ({
          value: (params as { items: string[] }).items[1],
        }),
      });
      await useCommitStore.getState().commit();
      await vi.waitFor(() =>
        expect(calls.map((c) => c.command)).toContain("showQuickPick"),
      );
      expect(calls.map((c) => c.command)).not.toContain("createChangelist");
    });

    it("stays quiet when the whole list was committed", async () => {
      useCommitStore.setState({
        selectedFiles: new Set(["a.ts:false", "b.ts:false"]),
      });
      const calls = routeBridge({
        commitChanges: { success: true },
        getWorkingTreeChanges: [],
        getChangelists: info,
      });
      await useCommitStore.getState().commit();
      expect(calls.map((c) => c.command)).not.toContain("showQuickPick");
    });

    it("does not ask when the commit was cancelled", async () => {
      const calls = routeBridge({ commitChanges: { cancelled: true } });
      expect(await useCommitStore.getState().commit()).toBe(false);
      expect(calls.map((c) => c.command)).not.toContain("showQuickPick");
    });
  });

  it("collapses and expands every changelist group", () => {
    const store = useCommitStore.getState();
    store.collapseAllChangelists(["default", "fix"]);
    expect([...useCommitStore.getState().collapsedChangelists]).toEqual([
      "default",
      "fix",
    ]);
    store.toggleChangelistGroup("fix");
    expect([...useCommitStore.getState().collapsedChangelists]).toEqual([
      "default",
    ]);
    store.expandAllChangelists();
    expect(useCommitStore.getState().collapsedChangelists.size).toBe(0);
  });
});
