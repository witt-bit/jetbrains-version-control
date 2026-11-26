import { usePlatform } from "../shared/hooks/usePlatform";

type Platform = ReturnType<typeof usePlatform>;

/** Rider `Vcs.Log.FocusTextFilter` — `control L` on every platform. */
export function isFocusTextFilterKey(e: KeyboardEvent): boolean {
  return (
    e.ctrlKey &&
    !e.metaKey &&
    !e.shiftKey &&
    !e.altKey &&
    e.key.toLowerCase() === "l"
  );
}

/**
 * Go To Hash/Branch/Tag (Rider `Vcs.Log.GoToRef` ships without a default
 * binding) — `shift+cmd+L` on macOS, `shift+ctrl+L` elsewhere.
 */
export function isGoToRefKey(e: KeyboardEvent, platform: Platform): boolean {
  const primary = platform === "macos" ? e.metaKey : e.ctrlKey;
  const other = platform === "macos" ? e.ctrlKey : e.metaKey;
  return (
    primary && !other && e.shiftKey && !e.altKey && e.key.toLowerCase() === "l"
  );
}

export function useFocusTextFilterShortcutLabel(): string {
  const platform = usePlatform();
  return platform === "macos" ? "⌃L" : "Ctrl + L";
}

export function useGoToRefShortcutLabel(): string {
  const platform = usePlatform();
  return platform === "macos" ? "⇧⌘L" : "Shift + Ctrl + L";
}
