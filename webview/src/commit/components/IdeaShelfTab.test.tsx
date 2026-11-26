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

import { useCommitStore } from "../../shared/store/commit-store";
import { IdeaShelfTab } from "./IdeaShelfTab";

const shelf = (name: string) => ({
  name,
  description: `Shelf ${name}`,
  date: "2024-01-01T00:00:00Z",
  files: ["a.ts"],
});

describe("IdeaShelfTab toolbar", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockImplementation(async (command: string) =>
      command === "getIdeaShelves" ? [shelf("one"), shelf("two")] : undefined,
    );
    useCommitStore.setState({
      ideaShelves: [shelf("one"), shelf("two")],
      highlightedIdeaShelfName: null,
    });
  });

  afterEach(cleanup);

  it("disables shelf actions until a shelf is selected, but not import", () => {
    render(<IdeaShelfTab />);
    for (const name of [
      "Unshelve",
      "Restore",
      "Create Patch",
      "Copy as Patch to Clipboard",
      "Delete",
    ]) {
      expect(
        (screen.getByRole("button", { name }) as HTMLButtonElement).disabled,
      ).toBe(true);
    }
    expect(
      (
        screen.getByRole("button", {
          name: "Import Patches",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("unshelves the selected shelf and drops it", async () => {
    render(<IdeaShelfTab />);
    fireEvent.click(screen.getByText("Shelf two"));
    fireEvent.click(screen.getByRole("button", { name: "Unshelve" }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith("ideaUnshelveChanges", {
        shelfName: "two",
        drop: true,
      }),
    );
  });

  it("restores the selected shelf without dropping it", async () => {
    render(<IdeaShelfTab />);
    fireEvent.click(screen.getByText("Shelf one"));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith("ideaUnshelveChanges", {
        shelfName: "one",
        drop: false,
      }),
    );
  });

  it("clears the selection when the shelf disappears", async () => {
    useCommitStore.setState({ highlightedIdeaShelfName: "gone" });
    render(<IdeaShelfTab />);
    await waitFor(() => expect(request).toHaveBeenCalledWith("getIdeaShelves"));
    await waitFor(() =>
      expect(useCommitStore.getState().highlightedIdeaShelfName).toBeNull(),
    );
  });
});
