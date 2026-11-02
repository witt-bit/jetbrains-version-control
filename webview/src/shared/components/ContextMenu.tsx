import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/**
 * Shared context-menu primitives. Every menu in the app (Git Log panel and
 * Commit panel) must render through these so behaviour and styling stay
 * identical:
 *
 * - `useContextMenuPosition(x, y)` — clamps the menu into the viewport
 *   after first render; returns the ref to attach plus the clamped position.
 * - `useContextMenuDismiss(ref, onClose)` — closes on outside mousedown,
 *   Escape, window blur, outside scroll and resize.
 * - `<ContextMenu>` — the fixed-position portal container.
 * - `<ContextMenuHeader>` — a non-interactive group title (e.g. "Columns").
 * - `<ContextMenuItem>` — one row: optional icon, label, optional shortcut.
 *   Items are `<button>`s so disabled state is native.
 * - `<ContextMenuSeparator>` — the 1px divider.
 * - `<ContextMenuCheck>` — the check mark used by option toggles.
 *
 * Styles live in shared/components/ContextMenu.css (global stylesheet).
 *
 * Menu items that run a git operation should go through `runMenuAction`
 * (shared/bridge/errors.ts) so failures surface to the user instead of
 * vanishing into the webview console.
 */

export interface ContextMenuPosition {
  top: number;
  left: number;
}

/**
 * Clamp a menu opened at (x, y) so it stays fully inside the viewport.
 * Returns the clamped position (null until measured — render the menu
 * off-screen/hidden until then) and the ref to attach to the menu element.
 */
export function useContextMenuPosition(
  x: number,
  y: number,
): {
  ref: RefObject<HTMLDivElement | null>;
  position: ContextMenuPosition | null;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<ContextMenuPosition | null>(null);

  useEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      const viewportH = window.innerHeight;
      const viewportW = window.innerWidth;
      let top = y;
      let left = x;
      if (top + rect.height > viewportH) {
        const above = y - rect.height;
        top = above >= 4 ? above : Math.max(4, viewportH - rect.height - 4);
      }
      if (left + rect.width > viewportW) {
        left = Math.max(4, viewportW - rect.width - 4);
      }
      setPosition({ top, left });
    });
  }, [x, y]);

  return { ref, position };
}

/**
 * Close the menu on any of the standard triggers: outside mousedown
 * (capture), Escape, window blur, outside scroll (capture) and resize.
 */
export function useContextMenuDismiss(
  menuRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleBlur = () => onClose();
    const handleScroll = (e: Event) => {
      if (
        menuRef.current &&
        e.target instanceof Node &&
        !menuRef.current.contains(e.target)
      ) {
        onClose();
      }
    };
    const handleContextMenu = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("contextmenu", handleContextMenu, true);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleBlur);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("contextmenu", handleContextMenu, true);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleBlur);
    };
  }, [menuRef, onClose]);
}

interface ContextMenuProps {
  /** Raw click coordinates — clamping happens inside. */
  x: number;
  y: number;
  /** Container min-width in px (menus without icons: 160–180, with icons: 200). */
  minWidth?: number;
  /** Close the menu (unmount) — called on outside click / Escape / blur / scroll / resize. */
  onClose: () => void;
  children: ReactNode;
}

export function ContextMenu({
  x,
  y,
  minWidth = 200,
  onClose,
  children,
}: ContextMenuProps) {
  const { ref, position } = useContextMenuPosition(x, y);
  useContextMenuDismiss(ref, onClose);
  const style: CSSProperties = {
    position: "fixed",
    top: position ? position.top : -9999,
    left: position ? position.left : -9999,
    visibility: position ? "visible" : "hidden",
  };
  return createPortal(
    <div ref={ref} className="jgc-context-menu" style={{ ...style, minWidth }}>
      {children}
    </div>,
    document.body,
  );
}

export function ContextMenuHeader({ children }: { children: ReactNode }) {
  return <div className="jgc-context-menu-header">{children}</div>;
}

interface ContextMenuItemProps {
  onClick: () => void;
  icon?: ReactNode;
  /** Right-aligned platform shortcut label, e.g. `F4 · ⌘↓`. */
  shortcut?: string;
  disabled?: boolean;
  /** Left check mark area for toggle-style menu items. */
  checked?: boolean;
  children: ReactNode;
}

export function ContextMenuItem({
  onClick,
  icon,
  shortcut,
  disabled = false,
  checked,
  children,
}: ContextMenuItemProps) {
  return (
    <button
      type="button"
      className="jgc-context-menu-item"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {checked !== undefined && (
        <span className="jgc-context-menu-check">{checked ? "✓" : ""}</span>
      )}
      <span className="jgc-context-menu-icon">{icon ?? null}</span>
      <span>{children}</span>
      {shortcut && (
        <span className="jgc-context-menu-shortcut">{shortcut}</span>
      )}
    </button>
  );
}

export function ContextMenuSeparator() {
  return <div className="jgc-context-menu-separator" />;
}
