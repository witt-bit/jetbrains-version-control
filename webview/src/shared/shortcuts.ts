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

/** Show Diff — `cmd+d` / `ctrl+d` */
export function useShowDiffShortcutLabel(): string {
  const platform = usePlatform();
  return platform === "macos" ? "⌘D" : "Ctrl + D";
}

/** Add to VCS (Stage) — `alt+cmd+a` / `alt+ctrl+a` */
export function useStageFileShortcutLabel(): string {
  const platform = usePlatform();
  return platform === "macos" ? "⌥⌘A" : "Alt + Ctrl + A";
}

/** Rollback — `alt+cmd+z` / `alt+ctrl+z` */
export function useRollbackShortcutLabel(): string {
  const platform = usePlatform();
  return platform === "macos" ? "⌥⌘Z" : "Alt + Ctrl + Z";
}

/** Delete — `cmd+backspace` / `ctrl+backspace` */
export function useDeleteShortcutLabel(): string {
  const platform = usePlatform();
  return platform === "macos" ? "⌘⌫" : "Ctrl + ⌫";
}

/** Unshelve — `shift+cmd+u` / `shift+ctrl+u` */
export function useUnshelveShortcutLabel(): string {
  const platform = usePlatform();
  return platform === "macos" ? "⇧⌘U" : "Shift + Ctrl + U";
}

/** Directory toggle — `cmd+p` / `ctrl+p` */
export function useToggleGroupByDirectoryShortcutLabel(): string {
  const platform = usePlatform();
  return platform === "macos" ? "⌘P" : "Ctrl + P";
}
