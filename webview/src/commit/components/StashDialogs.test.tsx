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
}));

import type { ShelveEntry } from "../../shared/store/commit-store";
import { StashChangesDialog } from "./StashChangesDialog";
import { branchNameProblem, UnstashDialog } from "./UnstashDialog";

const ENTRY: ShelveEntry = {
  id: "stash@{1}",
  message: "half-done refactor",
  date: "2024-01-01T00:00:00Z",
  branch: "main",
  files: ["a.txt"],
};

function bridgeCalls(command: string): unknown[] {
  return request.mock.calls
    .filter(([name]) => name === command)
    .map(([, params]) => params);
}

beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async (command: string) => {
    if (command === "stashChanges") return { success: true, stashed: true };
    return [];
  });
});

afterEach(cleanup);

describe("StashChangesDialog", () => {
  it("stashes untracked files by default and sends exactly what was chosen", async () => {
    const onClose = vi.fn();
    render(<StashChangesDialog onClose={onClose} />);

    expect(
      (screen.getByLabelText(/Untracked/) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByLabelText(/Keep index/) as HTMLInputElement).checked,
    ).toBe(false);

    fireEvent.change(screen.getByLabelText("Message:"), {
      target: { value: "  wip  " },
    });
    fireEvent.click(screen.getByLabelText(/Keep index/));
    fireEvent.click(screen.getByLabelText(/Untracked/));
    fireEvent.click(screen.getByText("Stash"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(bridgeCalls("stashChanges")).toEqual([
      { message: "wip", keepIndex: true, includeUntracked: false },
    ]);
  });

  it("stays open when git refuses so the options can be adjusted", async () => {
    request.mockImplementation(async (command: string) => {
      if (command === "stashChanges") throw new Error("git said no");
      return [];
    });
    const onClose = vi.fn();
    render(<StashChangesDialog onClose={onClose} />);

    fireEvent.click(screen.getByText("Stash"));

    await waitFor(() => expect(bridgeCalls("stashChanges")).toHaveLength(1));
    await waitFor(() =>
      expect((screen.getByText("Stash") as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape and on Cancel without touching git", () => {
    const onClose = vi.fn();
    render(<StashChangesDialog onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByText("Cancel"));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(bridgeCalls("stashChanges")).toHaveLength(0);
  });
});

describe("UnstashDialog", () => {
  it("pops without reinstating the index by default", async () => {
    const onClose = vi.fn();
    render(<UnstashDialog entry={ENTRY} onClose={onClose} />);

    fireEvent.click(screen.getByText("Unstash"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(bridgeCalls("unshelveChanges")).toEqual([
      { stashId: "stash@{1}", drop: true, reinstateIndex: false },
    ]);
    expect(bridgeCalls("unstashAsBranch")).toHaveLength(0);
  });

  it("applies and reinstates the index when asked", async () => {
    const onClose = vi.fn();
    render(<UnstashDialog entry={ENTRY} onClose={onClose} />);

    fireEvent.click(screen.getByLabelText(/Pop stash/));
    fireEvent.click(screen.getByLabelText(/Reinstate index/));
    fireEvent.click(screen.getByText("Unstash"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(bridgeCalls("unshelveChanges")).toEqual([
      { stashId: "stash@{1}", drop: false, reinstateIndex: true },
    ]);
  });

  it("switches to a new branch and locks the options a branch makes moot", async () => {
    const onClose = vi.fn();
    render(<UnstashDialog entry={ENTRY} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText("As new branch:"), {
      target: { value: " topic/x " },
    });

    expect(
      (screen.getByLabelText(/Pop stash/) as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText(/Reinstate index/) as HTMLInputElement).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByText("Create Branch"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(bridgeCalls("unstashAsBranch")).toEqual([
      { stashId: "stash@{1}", branchName: "topic/x" },
    ]);
    expect(bridgeCalls("unshelveChanges")).toHaveLength(0);
  });

  it("refuses an invalid branch name before asking git", () => {
    render(<UnstashDialog entry={ENTRY} onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText("As new branch:"), {
      target: { value: "two words" },
    });

    expect(screen.getByText(/cannot contain spaces/)).toBeTruthy();
    expect(
      (screen.getByText("Create Branch") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("keeps the dialog open when the branch cannot be created", async () => {
    request.mockImplementation(async (command: string) => {
      if (command === "unstashAsBranch") throw new Error("already exists");
      return [];
    });
    const onClose = vi.fn();
    render(<UnstashDialog entry={ENTRY} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText("As new branch:"), {
      target: { value: "taken" },
    });
    fireEvent.click(screen.getByText("Create Branch"));

    await waitFor(() => expect(bridgeCalls("unstashAsBranch")).toHaveLength(1));
    await waitFor(() =>
      expect(
        (screen.getByText("Create Branch") as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("branchNameProblem", () => {
  it("accepts ordinary names and rejects what git would", () => {
    for (const ok of ["topic", "feature/x-1", "v1.2"]) {
      expect(branchNameProblem(ok)).toBeNull();
    }
    for (const bad of ["a b", "-x", "a..b", "a~1", "a:b", "x/", "x.lock"]) {
      expect(branchNameProblem(bad)).not.toBeNull();
    }
  });
});
