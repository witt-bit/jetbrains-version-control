import { usePlatform } from "./hooks/usePlatform";

/**
 * Shortcut label for Jump to Source / Edit Source in context menus.
 *
 * The command has two default bindings: `f4` and `ctrl+down` / `cmd+down`.
 * The second one is platform-specific, so the label reflects the current
 * platform instead of showing both at once.
 */
export function useJumpToSourceShortcutLabel(): string {
  const platform = usePlatform();
  const downKey = platform === "macos" ? "⌘ ↓" : "Ctrl + ↓";
  return `F4 · ${downKey}`;
}
