import { useEffect } from "react";

/**
 * Suppress the native webview context menu. Rows and items carry their own
 * custom menus, and the native menu that otherwise leaks through on blank
 * areas is meaningless. Editable elements keep the native menu so copy/paste
 * still works in text fields.
 */
export function useSuppressContextMenu(): void {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) {
        return;
      }
      e.preventDefault();
    };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);
}
