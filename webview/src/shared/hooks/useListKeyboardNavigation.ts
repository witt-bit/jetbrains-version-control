import { useCallback } from "react";

export type SelectionMode = "single" | "toggle" | "range";

/**
 * Shared keyboard navigation for list-style multi-select.
 *
 * Used by branches, tags, files, and commits so all four lists behave
 * identically:
 *
 * - Arrow Down / Up (no modifier): move highlight, single-select.
 * - Shift + Arrow Down / Up: extend selection from the anchor (range).
 *
 * Navigation position = the last selected item.
 * Range anchor = the first selected item (doesn't move during Shift+Arrow).
 */
export function useListKeyboardNavigation<T>(
  items: T[],
  getSelected: () => T[],
  getAnchor: () => T | null,
  onSelect: (item: T, mode: "single" | "range") => void,
) {
  return useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();

      if (items.length === 0) return;

      // Find the current position = last selected item.
      let currentIdx = -1;
      const selected = getSelected();
      if (selected.length > 0) {
        currentIdx = items.indexOf(selected[selected.length - 1]);
      }
      if (currentIdx === -1) {
        // No selection yet: start from anchor or from top/bottom.
        const anchor = getAnchor();
        currentIdx = anchor
          ? items.indexOf(anchor)
          : e.key === "ArrowDown"
            ? 0
            : items.length - 1;
        if (currentIdx === -1) {
          currentIdx = e.key === "ArrowDown" ? 0 : items.length - 1;
        }
      }

      const nextIdx =
        e.key === "ArrowDown"
          ? Math.min(currentIdx + 1, items.length - 1)
          : Math.max(currentIdx - 1, 0);

      const target = items[nextIdx];
      const mode = e.shiftKey ? "range" : "single";
      onSelect(target, mode);
    },
    [items, getSelected, getAnchor, onSelect],
  );
}
