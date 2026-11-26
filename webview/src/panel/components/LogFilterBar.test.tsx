import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePanelStore } from "../../shared/store/panel-store";
import { LogGoToRef, LogTextFilter } from "./LogFilterBar";

vi.mock("../../shared/bridge", () => ({
  bridge: { request: () => Promise.resolve(null), onEvent: () => () => {} },
  reportActionError: () => Promise.resolve(),
}));

const initialState = usePanelStore.getState();
const setFilter = vi.fn();
const goToRef = vi.fn();

function textBox(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector("input");
  if (!input) throw new Error("no input rendered");
  return input;
}

beforeEach(() => {
  vi.useFakeTimers();
  setFilter.mockReset();
  goToRef.mockReset();
  usePanelStore.setState(initialState, true);
  usePanelStore.setState({ setFilter, goToRef });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("LogTextFilter", () => {
  it("sends the text after a pause, once", () => {
    const { container } = render(<LogTextFilter />);
    fireEvent.change(textBox(container), { target: { value: "fix" } });
    fireEvent.change(textBox(container), { target: { value: "fix bug" } });
    expect(setFilter).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(setFilter).toHaveBeenCalledTimes(1);
    expect(setFilter).toHaveBeenCalledWith({ searchQuery: "fix bug" });
  });

  it("sends immediately on Enter and drops the pending pause", () => {
    const { container } = render(<LogTextFilter />);
    fireEvent.change(textBox(container), { target: { value: "fix" } });
    fireEvent.keyDown(textBox(container), { key: "Enter" });
    expect(setFilter).toHaveBeenCalledWith({ searchQuery: "fix" });

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(setFilter).toHaveBeenCalledTimes(1);
  });

  it("shows a text the store changed behind its back and cancels the pause", () => {
    const { container } = render(<LogTextFilter />);
    fireEvent.change(textBox(container), { target: { value: "half typed" } });

    act(() => {
      usePanelStore.setState({
        filter: { ...usePanelStore.getState().filter, searchQuery: "other" },
      });
    });

    expect(textBox(container).value).toBe("other");
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(setFilter).not.toHaveBeenCalled();
  });

  it("toggles Match Case and Regex through the store", () => {
    const { getByLabelText } = render(<LogTextFilter />);
    expect(getByLabelText("Match Case").getAttribute("aria-pressed")).toBe(
      "false",
    );

    fireEvent.click(getByLabelText("Match Case"));
    expect(setFilter).toHaveBeenLastCalledWith({ matchCase: true });

    act(() => {
      usePanelStore.setState({
        filter: { ...usePanelStore.getState().filter, regex: true },
      });
    });
    expect(getByLabelText("Regex").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(getByLabelText("Regex"));
    expect(setFilter).toHaveBeenLastCalledWith({ regex: false });
  });

  it("flags a regex that does not compile", () => {
    act(() => {
      usePanelStore.setState({
        filter: { ...usePanelStore.getState().filter, regex: true },
      });
    });
    const { container } = render(<LogTextFilter />);
    fireEvent.change(textBox(container), { target: { value: "(" } });
    expect(textBox(container).title).toMatch(/Invalid regular expression/);

    fireEvent.change(textBox(container), { target: { value: "a|b" } });
    expect(textBox(container).title).not.toMatch(/Invalid/);
  });

  it("clears with the X button right away", () => {
    const { container, getByLabelText } = render(<LogTextFilter />);
    fireEvent.change(textBox(container), { target: { value: "fix" } });
    fireEvent.click(getByLabelText("Clear text filter"));
    expect(setFilter).toHaveBeenLastCalledWith({ searchQuery: "" });
    expect(textBox(container).value).toBe("");
  });
});

describe("LogGoToRef", () => {
  function openWithShortcut() {
    fireEvent.keyDown(document, {
      key: "L",
      ctrlKey: true,
      shiftKey: true,
    });
  }

  it("opens from the button, submits on Enter and closes when found", async () => {
    goToRef.mockResolvedValue(true);
    const { container, getByLabelText } = render(<LogGoToRef />);
    expect(container.querySelector("input")).toBeNull();

    fireEvent.click(getByLabelText("Go to Hash/Branch/Tag"));
    fireEvent.change(textBox(container), { target: { value: "abc123" } });
    await act(async () => {
      fireEvent.keyDown(textBox(container), { key: "Enter" });
    });

    expect(goToRef).toHaveBeenCalledWith("abc123");
    expect(container.querySelector("input")).toBeNull();
  });

  it("stays open for another try when the ref is not found", async () => {
    goToRef.mockResolvedValue(false);
    const { container, getByLabelText } = render(<LogGoToRef />);
    fireEvent.click(getByLabelText("Go to Hash/Branch/Tag"));
    fireEvent.change(textBox(container), { target: { value: "nope" } });
    await act(async () => {
      fireEvent.keyDown(textBox(container), { key: "Enter" });
    });

    expect(textBox(container).value).toBe("nope");
  });

  it("ignores an empty query", async () => {
    const { container, getByLabelText } = render(<LogGoToRef />);
    fireEvent.click(getByLabelText("Go to Hash/Branch/Tag"));
    await act(async () => {
      fireEvent.keyDown(textBox(container), { key: "Enter" });
    });
    expect(goToRef).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const { container, getByLabelText } = render(<LogGoToRef />);
    fireEvent.click(getByLabelText("Go to Hash/Branch/Tag"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(container.querySelector("input")).toBeNull();
  });

  it("opens from the keyboard shortcut", () => {
    const { container } = render(<LogGoToRef />);
    openWithShortcut();
    expect(container.querySelector("input")).not.toBeNull();
  });
});
