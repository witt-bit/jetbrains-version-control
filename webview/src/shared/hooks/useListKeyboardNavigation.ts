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
 * The `items` array is the single source of truth — the same array that
 * Shift+click range selection uses — so keyboard and mouse never drift.
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

      // Find the anchor index: the last selected item, or the anchor ref.
      let anchorIdx = -1;
      const anchor = getAnchor();
      if (anchor !== null && anchor !== undefined) {
        anchorIdx = items.indexOf(anchor);
      }
      if (anchorIdx === -1) {
        const selected = getSelected();
        if (selected.length > 0) {
          anchorIdx = items.indexOf(selected[selected.length - 1]);
        }
      }
      if (anchorIdx === -1) {
        anchorIdx = e.key === "ArrowDown" ? 0 : items.length - 1;
      }

      const nextIdx =
        e.key === "ArrowDown"
          ? Math.min(anchorIdx + 1, items.length - 1)
          : Math.max(anchorIdx - 1, 0);

      const target = items[nextIdx];
      const mode = e.shiftKey ? "range" : "single";
      onSelect(target, mode);
    },
    [items, getSelected, getAnchor, onSelect],
  );
}
