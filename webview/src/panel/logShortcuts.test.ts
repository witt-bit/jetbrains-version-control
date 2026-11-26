import { describe, expect, it } from "vitest";
import { isFocusTextFilterKey, isGoToRefKey } from "./logShortcuts";

function key(init: KeyboardEventInit & { key: string }) {
  return new KeyboardEvent("keydown", init);
}

describe("isFocusTextFilterKey", () => {
  it("is Ctrl+L and nothing else", () => {
    expect(isFocusTextFilterKey(key({ key: "l", ctrlKey: true }))).toBe(true);
    expect(isFocusTextFilterKey(key({ key: "L", ctrlKey: true }))).toBe(true);
    expect(isFocusTextFilterKey(key({ key: "l" }))).toBe(false);
    expect(isFocusTextFilterKey(key({ key: "l", metaKey: true }))).toBe(false);
    expect(
      isFocusTextFilterKey(key({ key: "l", ctrlKey: true, shiftKey: true })),
    ).toBe(false);
  });
});

describe("isGoToRefKey", () => {
  it("is Cmd+Shift+L on macOS", () => {
    const e = key({ key: "L", metaKey: true, shiftKey: true });
    expect(isGoToRefKey(e, "macos")).toBe(true);
    expect(isGoToRefKey(e, "windows")).toBe(false);
  });

  it("is Ctrl+Shift+L elsewhere, and never needs both modifiers", () => {
    const e = key({ key: "L", ctrlKey: true, shiftKey: true });
    expect(isGoToRefKey(e, "windows")).toBe(true);
    expect(isGoToRefKey(e, "linux")).toBe(true);
    expect(isGoToRefKey(e, "macos")).toBe(false);
    expect(isGoToRefKey(key({ key: "L", ctrlKey: true }), "windows")).toBe(
      false,
    );
  });
});
