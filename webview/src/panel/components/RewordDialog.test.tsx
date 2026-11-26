import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Commit } from "../../shared/types/git";
import { RewordDialog } from "./RewordDialog";

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

const COMMIT = {
  hash: "a".repeat(40),
  shortHash: "aaaaaaa",
  parents: ["b".repeat(40)],
  subject: "old subject",
  body: "old body",
  authorName: "A",
} as Commit;

beforeEach(() => {
  mocks.request.mockReset().mockResolvedValue(undefined);
  mocks.withProgress.mockReset().mockResolvedValue(undefined);
  mocks.report.mockReset();
});

afterEach(cleanup);

describe("RewordDialog", () => {
  it("starts from the full message and stays disabled until it changes", () => {
    render(<RewordDialog commit={COMMIT} onClose={vi.fn()} />);
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(box.value).toBe("old subject\n\nold body");
    const button = screen.getByRole("button", { name: "Reword" });
    expect((button as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(box, { target: { value: "   " } });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("rewords with the new message and closes", () => {
    const onClose = vi.fn();
    render(<RewordDialog commit={COMMIT} onClose={onClose} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "new subject\n\nnew body" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reword" }));
    expect(onClose).toHaveBeenCalled();
    expect(mocks.withProgress).toHaveBeenCalledWith("rewordCommit", {
      hash: "a".repeat(40),
      message: "new subject\n\nnew body",
    });
  });

  it("submits with Cmd+Enter", () => {
    render(<RewordDialog commit={COMMIT} onClose={vi.fn()} />);
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "changed" } });
    fireEvent.keyDown(box, { key: "Enter", metaKey: true });
    expect(mocks.withProgress).toHaveBeenCalledTimes(1);
  });
});
