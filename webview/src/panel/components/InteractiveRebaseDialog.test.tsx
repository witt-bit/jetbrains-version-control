import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Commit } from "../../shared/types/git";
import type { RebaseCommitInfo } from "../rebaseDialogLogic";
import { InteractiveRebaseDialog } from "./InteractiveRebaseDialog";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  withProgress: vi.fn(),
  report: vi.fn(),
}));

vi.mock("../../shared/bridge", () => ({
  bridge: { request: mocks.request },
  bridgeWithProgress: mocks.withProgress,
  reportActionError: mocks.report,
}));

function info(n: number): RebaseCommitInfo {
  return {
    hash: String(n).repeat(40),
    shortHash: String(n).repeat(7),
    subject: `commit ${n}`,
    body: "",
    authorName: "A",
    authorDate: "2024-01-01",
    action: "pick",
  };
}

const COMMIT = {
  hash: "1".repeat(40),
  shortHash: "1111111",
  parents: ["0".repeat(40)],
  subject: "commit 1",
  body: "",
  authorName: "A",
} as Commit;

function serve(commits: RebaseCommitInfo[], hasMerges = false) {
  mocks.request.mockImplementation(async (command: string) =>
    command === "getRebaseCommits" ? { commits, hasMerges } : undefined,
  );
}

async function open(onClose = vi.fn()) {
  render(<InteractiveRebaseDialog commit={COMMIT} onClose={onClose} />);
  await screen.findByText("commit 3");
  return onClose;
}

function actionSelects(): HTMLSelectElement[] {
  return screen
    .getAllByRole("combobox")
    .filter(
      (el): el is HTMLSelectElement =>
        el instanceof HTMLSelectElement && el.className === "irb-action",
    );
}

function startButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "Rebase" }) as HTMLButtonElement;
}

beforeEach(() => {
  mocks.request.mockReset();
  mocks.withProgress.mockReset().mockResolvedValue(undefined);
  mocks.report.mockReset();
  serve([info(1), info(2), info(3)]);
});

afterEach(cleanup);

describe("InteractiveRebaseDialog", () => {
  it("lists the commits newest first and starts from the parent", async () => {
    await open();
    expect(
      Array.from(document.querySelectorAll(".irb-subject")).map(
        (el) => el.textContent,
      ),
    ).toEqual(["commit 3", "commit 2", "commit 1"]);
    expect(mocks.request).toHaveBeenCalledWith("getRebaseCommits", {
      base: "0".repeat(40),
      root: false,
      autosquash: false,
    });
  });

  it("leaves an untouched list to git", async () => {
    const onClose = await open();
    fireEvent.click(startButton());
    expect(onClose).toHaveBeenCalled();
    const [command, payload] = mocks.withProgress.mock.calls[0];
    expect(command).toBe("interactiveRebase");
    expect(payload).toMatchObject({
      base: "0".repeat(40),
      keepEmpty: true,
      rebaseMerges: false,
    });
    expect(payload).not.toHaveProperty("entries");
  });

  it("sends the edited todo oldest first, with a reworded message", async () => {
    await open();
    const selects = actionSelects();
    fireEvent.change(selects[0], { target: { value: "reword" } });
    fireEvent.change(selects[1], { target: { value: "drop" } });
    fireEvent.change(screen.getByLabelText("New message for 3333333"), {
      target: { value: "renamed" },
    });
    fireEvent.click(startButton());

    const payload = mocks.withProgress.mock.calls[0][1];
    expect(payload.entries).toEqual([
      { action: "pick", hash: "1".repeat(40), subject: "commit 1" },
      { action: "drop", hash: "2".repeat(40), subject: "commit 2" },
      {
        action: "reword",
        hash: "3".repeat(40),
        subject: "commit 3",
        message: "renamed",
      },
    ]);
  });

  it("moves a row and refuses a squash with nothing before it", async () => {
    await open();
    fireEvent.click(screen.getAllByRole("button", { name: "Move down" })[0]);
    expect(
      Array.from(document.querySelectorAll(".irb-subject")).map(
        (el) => el.textContent,
      ),
    ).toEqual(["commit 2", "commit 3", "commit 1"]);

    fireEvent.change(actionSelects()[2], { target: { value: "squash" } });
    expect(startButton().disabled).toBe(true);
    expect(screen.getByText(/no earlier commit/)).toBeTruthy();

    fireEvent.change(actionSelects()[2], { target: { value: "pick" } });
    expect(startButton().disabled).toBe(false);
  });

  it("reloads the list when autosquash is switched on", async () => {
    await open();
    fireEvent.click(screen.getByLabelText("Autosquash"));
    await waitFor(() =>
      expect(mocks.request).toHaveBeenLastCalledWith("getRebaseCommits", {
        base: "0".repeat(40),
        root: false,
        autosquash: true,
      }),
    );
    await screen.findByText("commit 3");
  });

  it("locks the list and rebases merges when the range has merges", async () => {
    serve([info(1), info(2), info(3)], true);
    await open();
    for (const select of actionSelects()) expect(select.disabled).toBe(true);
    fireEvent.click(startButton());
    const payload = mocks.withProgress.mock.calls[0][1];
    expect(payload.rebaseMerges).toBe(true);
    expect(payload).not.toHaveProperty("entries");
  });

  it("refuses a commit that is not on the current branch", async () => {
    serve([info(2), info(3)]);
    render(<InteractiveRebaseDialog commit={COMMIT} onClose={vi.fn()} />);
    await screen.findByText("commit 3");
    expect(screen.getByText(/not part of the current branch/)).toBeTruthy();
    expect(startButton().disabled).toBe(true);
  });

  it("reports a failed rebase instead of swallowing it", async () => {
    mocks.withProgress.mockRejectedValue(new Error("boom"));
    await open();
    fireEvent.click(startButton());
    await waitFor(() =>
      expect(mocks.report).toHaveBeenCalledWith(
        "Interactive rebase",
        expect.any(Error),
      ),
    );
  });
});
