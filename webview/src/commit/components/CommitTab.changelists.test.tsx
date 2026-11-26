import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.fn();

vi.mock("../../shared/bridge", () => ({
  bridge: {
    request: (...args: unknown[]) => request(...args),
    onEvent: () => () => {},
  },
  reportActionError: vi.fn(async () => {}),
  runMenuAction: async (
    onClose: () => void,
    _what: string,
    fn: () => Promise<unknown>,
  ) => {
    onClose();
    await fn();
  },
}));

import { CHANGELIST_DRAG_TYPE } from "../../shared/changelists";
import {
  useCommitStore,
  type WorkingTreeFile,
} from "../../shared/store/commit-store";
import type { ChangelistsInfo } from "../../shared/types/git";
import { CommitTab } from "./CommitTab";

const file = (
  path: string,
  changelist: string | undefined,
  overrides: Partial<WorkingTreeFile> = {},
): WorkingTreeFile => ({
  path,
  status: "modified",
  staged: false,
  changelist,
  ...overrides,
});

const INFO: ChangelistsInfo = {
  enabled: true,
  activeId: "default",
  offerMoveOnPartialCommit: true,
  lists: [
    { id: "default", name: "Changes" },
    { id: "fix", name: "Bug fix" },
    { id: "empty", name: "Someday" },
  ],
};

/** jsdom has no DataTransfer; this is the part of it the component touches. */
function dataTransfer(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get types() {
      return [...data.keys()];
    },
    setData: (type: string, value: string) => void data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
    effectAllowed: "",
    dropEffect: "",
  };
}

const rowOf = (name: string) =>
  screen.getByText(name).closest(".commit-file-item") as HTMLElement;
const groupOf = (label: string) =>
  screen.getByText(label).closest(".commit-group") as HTMLElement;
const bridgeCalls = (command: string) =>
  request.mock.calls
    .filter(([name]) => name === command)
    .map(([, params]) => params);

function seed(
  changes: WorkingTreeFile[],
  changelists: ChangelistsInfo | null = INFO,
) {
  useCommitStore.setState({
    changes,
    changelists,
    selectedFiles: new Set(),
    highlightedFiles: new Set(),
    collapsedChangelists: new Set(),
    expandedGroups: new Set(["changes", "unversioned", "staged"]),
    groupByDirectory: false,
    loading: false,
  });
}

beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async (command: string) => {
    if (command === "getWorkingTreeChanges") return [];
    return {};
  });
});

afterEach(cleanup);

describe("CommitTab with changelists on", () => {
  it("renders one group per changelist, including an empty one, and marks the active list", () => {
    seed([file("a.ts", "default"), file("b.ts", "fix")]);
    render(<CommitTab />);

    for (const name of ["Changes", "Bug fix", "Someday"]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    expect(groupOf("Changes").textContent).toContain("Active");
    expect(groupOf("Bug fix").textContent).not.toContain("Active");
    expect(groupOf("Someday").textContent).toContain(
      "Drag files here to move them to this changelist",
    );
    expect(
      groupOf("Someday").querySelector<HTMLInputElement>(
        ".commit-group-checkbox",
      )?.checked,
    ).toBe(false);
  });

  it("collapses a changelist group from its header", () => {
    seed([file("a.ts", "default"), file("b.ts", "fix")]);
    render(<CommitTab />);

    fireEvent.click(screen.getByText("Bug fix"));
    expect(screen.queryByText("b.ts")).toBeNull();
    expect(screen.getByText("a.ts")).toBeTruthy();
  });

  it("falls back to a single Changes group when changelists are off", () => {
    seed([file("a.ts", undefined)], null);
    render(<CommitTab />);

    expect(screen.getByText("Changes")).toBeTruthy();
    expect(screen.queryByText("Bug fix")).toBeNull();
    expect(rowOf("a.ts").getAttribute("draggable")).not.toBe("true");
  });

  describe("drag and drop", () => {
    it("moves a dragged file into the changelist it is dropped on", async () => {
      seed([file("a.ts", "default"), file("b.ts", "fix")]);
      render(<CommitTab />);

      const dt = dataTransfer();
      fireEvent.dragStart(rowOf("a.ts"), { dataTransfer: dt });
      expect(dt.getData(CHANGELIST_DRAG_TYPE)).toBe(JSON.stringify(["a.ts"]));

      const target = groupOf("Bug fix");
      fireEvent.dragOver(target, { dataTransfer: dt });
      expect(target.className).toContain("drop-target");
      fireEvent.drop(target, { dataTransfer: dt });

      await waitFor(() =>
        expect(bridgeCalls("moveToChangelist")).toEqual([
          { id: "fix", filePaths: ["a.ts"] },
        ]),
      );
      expect(target.className).not.toContain("drop-target");
    });

    it("can drop onto an empty changelist", async () => {
      seed([file("a.ts", "default")]);
      render(<CommitTab />);

      const dt = dataTransfer();
      fireEvent.dragStart(rowOf("a.ts"), { dataTransfer: dt });
      fireEvent.drop(groupOf("Someday"), { dataTransfer: dt });

      await waitFor(() =>
        expect(bridgeCalls("moveToChangelist")).toEqual([
          { id: "empty", filePaths: ["a.ts"] },
        ]),
      );
    });

    it("drags every highlighted file when the row is part of the highlight", () => {
      seed([file("a.ts", "default"), file("b.ts", "fix"), file("c.ts", "fix")]);
      useCommitStore.setState({
        highlightedFiles: new Set(["a.ts:false", "b.ts:false"]),
      });
      render(<CommitTab />);

      const dt = dataTransfer();
      fireEvent.dragStart(rowOf("b.ts"), { dataTransfer: dt });
      expect(JSON.parse(dt.getData(CHANGELIST_DRAG_TYPE))).toEqual([
        "a.ts",
        "b.ts",
      ]);
    });

    it("sends nothing when files are dropped on the list they are already in", () => {
      seed([file("a.ts", "default"), file("b.ts", "fix")]);
      render(<CommitTab />);

      const dt = dataTransfer();
      fireEvent.dragStart(rowOf("b.ts"), { dataTransfer: dt });
      fireEvent.drop(groupOf("Bug fix"), { dataTransfer: dt });

      expect(bridgeCalls("moveToChangelist")).toEqual([]);
    });

    it("ignores drags that are not changelist files", () => {
      seed([file("a.ts", "default"), file("b.ts", "fix")]);
      render(<CommitTab />);

      const dt = dataTransfer({ "text/plain": "hello" });
      const target = groupOf("Bug fix");
      expect(fireEvent.dragOver(target, { dataTransfer: dt })).toBe(true);
      fireEvent.drop(target, { dataTransfer: dt });
      expect(target.className).not.toContain("drop-target");
      expect(bridgeCalls("moveToChangelist")).toEqual([]);
    });

    it("does not make staged or unversioned rows draggable", () => {
      seed([
        file("a.ts", "default"),
        file("s.ts", "default", { staged: true }),
        file("u.ts", undefined, { status: "untracked" }),
      ]);
      render(<CommitTab />);

      expect(rowOf("a.ts").getAttribute("draggable")).toBe("true");
      expect(rowOf("s.ts").getAttribute("draggable")).not.toBe("true");
      expect(rowOf("u.ts").getAttribute("draggable")).not.toBe("true");
    });
  });

  describe("header menu", () => {
    it("offers the changelist actions and disables the ones that do not apply", () => {
      seed([file("a.ts", "default")]);
      render(<CommitTab />);

      fireEvent.contextMenu(screen.getByText("Changes"));
      const item = (label: string) =>
        screen.getByText(label).closest("button") as HTMLButtonElement;

      expect(item("Set Active Changelist").disabled).toBe(true);
      expect(item("Delete Changelist").disabled).toBe(true);
      expect(item("Shelve Changelist...").disabled).toBe(false);
      expect(item("Rename...").disabled).toBe(false);
      expect(item("New Changelist...").disabled).toBe(false);
    });

    it("makes another list active and cannot shelve an empty one", async () => {
      seed([file("a.ts", "default")]);
      render(<CommitTab />);

      fireEvent.contextMenu(screen.getByText("Someday"));
      expect(
        (
          screen
            .getByText("Shelve Changelist...")
            .closest("button") as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      fireEvent.click(screen.getByText("Set Active Changelist"));

      await waitFor(() =>
        expect(bridgeCalls("setActiveChangelist")).toEqual([{ id: "empty" }]),
      );
    });
  });

  it("offers Move to Another Changelist only for rows that can move", async () => {
    seed([file("a.ts", "default"), file("s.ts", "default", { staged: true })]);
    render(<CommitTab />);

    fireEvent.contextMenu(rowOf("s.ts"));
    expect(screen.queryByText("Move to Another Changelist...")).toBeNull();
    cleanup();

    seed([file("a.ts", "default")]);
    render(<CommitTab />);
    fireEvent.contextMenu(rowOf("a.ts"));
    request.mockImplementation(async (command: string) =>
      command === "showQuickPick" ? { value: "Bug fix" } : {},
    );
    fireEvent.click(screen.getByText("Move to Another Changelist..."));

    await waitFor(() =>
      expect(bridgeCalls("moveToChangelist")).toEqual([
        { id: "fix", filePaths: ["a.ts"] },
      ]),
    );
  });
});
