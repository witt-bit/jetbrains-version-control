import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { bridge, bridgeWithProgress } from "../../shared/bridge";
import { usePanelStore } from "../../shared/store/panel-store";
import type { TagInfo } from "../../shared/types/git";

interface TagContextMenuProps {
  x: number;
  y: number;
  tag: TagInfo;
  selectedTags: string[];
  onClose: () => void;
}

export function TagContextMenu({
  x,
  y,
  tag,
  selectedTags,
  onClose,
}: TagContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const { currentBranch } = usePanelStore();

  // Adjust position after first render to keep menu within viewport
  useEffect(() => {
    const menu = menuRef.current;
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

  // Close on outside click, Escape, blur, scroll
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
  }, [onClose]);

  const isMultiSelect = selectedTags.length > 1;

  const handleCheckout = useCallback(async () => {
    onClose();
    try {
      await bridgeWithProgress("checkoutTag", { tagName: tag.name });
    } catch (err) {
      console.error("Checkout tag failed:", err);
    }
  }, [tag.name, onClose]);

  const handleShowDiff = useCallback(async () => {
    onClose();
    try {
      await bridge.request("showTagDiff", { tagName: tag.name });
    } catch (err) {
      console.error("Show tag diff failed:", err);
    }
  }, [tag.name, onClose]);

  const handleMerge = useCallback(async () => {
    onClose();
    const result = (await bridge.request("showConfirmMessage", {
      message: `Merge '${tag.name}' into '${currentBranch}'?`,
      confirmLabel: "Merge",
    })) as { confirmed: boolean };
    if (!result.confirmed) return;
    try {
      await bridgeWithProgress("mergeTag", { tagName: tag.name });
    } catch (err) {
      console.error("Merge tag failed:", err);
    }
  }, [tag.name, currentBranch, onClose]);

  const handleNewWorktree = useCallback(async () => {
    onClose();
    const result = (await bridge.request("showInputBox", {
      prompt: `New worktree path for tag '${tag.name}':`,
      placeHolder: "../my-worktree",
    })) as { value: string | null };
    if (!result.value || !result.value.trim()) return;
    try {
      await bridgeWithProgress("addWorktree", {
        path: result.value.trim(),
        branch: tag.name,
      });
    } catch (err) {
      console.error("Create worktree from tag failed:", err);
    }
  }, [tag.name, onClose]);

  const handlePush = useCallback(async () => {
    onClose();
    try {
      await bridgeWithProgress("pushTag", {
        tagName: tag.name,
        remote: "origin",
      });
    } catch (err) {
      console.error("Push tag failed:", err);
    }
  }, [tag.name, onClose]);

  const handleDelete = useCallback(async () => {
    onClose();
    const tagsToDelete = isMultiSelect ? selectedTags : [tag.name];
    const result = (await bridge.request("showConfirmMessage", {
      message:
        tagsToDelete.length > 1
          ? `Delete ${tagsToDelete.length} tags?`
          : `Delete tag '${tagsToDelete[0]}'?`,
      confirmLabel: "Delete",
    })) as { confirmed: boolean };
    if (!result.confirmed) return;
    try {
      for (const t of tagsToDelete) {
        await bridgeWithProgress("deleteTag", { tagName: t });
      }
    } catch (err) {
      console.error("Delete tag failed:", err);
    }
  }, [tag.name, selectedTags, isMultiSelect, onClose]);

  // Multi-select: only Delete
  if (isMultiSelect) {
    return createPortal(
      <div
        ref={menuRef}
        style={{
          position: "fixed",
          top: position ? position.top : -9999,
          left: position ? position.left : -9999,
          zIndex: 9999,
          background: "var(--vscode-menu-background, #1e1e1e)",
          border: "1px solid var(--vscode-menu-border, #454545)",
          borderRadius: 4,
          padding: "4px 0",
          minWidth: 160,
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          visibility: position ? "visible" : "hidden",
        }}
      >
        <div
          onClick={handleDelete}
          style={{
            padding: "6px 16px",
            cursor: "pointer",
            color: "var(--vscode-menu-foreground, #ccc)",
            fontSize: "13px",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background =
              "var(--vscode-list-hoverBackground, #2a2d2e)";
            (e.currentTarget as HTMLElement).style.color =
              "var(--vscode-menu-selectionForeground, #fff)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color =
              "var(--vscode-menu-foreground, #ccc)";
          }}
        >
          Delete
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: position ? position.top : -9999,
        left: position ? position.left : -9999,
        zIndex: 9999,
        background: "var(--vscode-menu-background, #1e1e1e)",
        border: "1px solid var(--vscode-menu-border, #454545)",
        borderRadius: 4,
        padding: "4px 0",
        minWidth: 200,
        maxHeight: "calc(100vh - 8px)",
        overflowY: "auto",
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        visibility: position ? "visible" : "hidden",
      }}
    >
      <MenuItem label="Checkout" onClick={handleCheckout} />
      <MenuItem label="Show Diff with Working Tree" onClick={handleShowDiff} />
      <MenuItem
        label={`Merge '${tag.name}' into '${currentBranch}'`}
        onClick={handleMerge}
      />
      <MenuItem
        label={`New Worktree from '${tag.name}'...`}
        onClick={handleNewWorktree}
      />
      <MenuItem label="Push to origin" onClick={handlePush} />
      <MenuSeparator />
      <MenuItem label="Delete" onClick={handleDelete} />
    </div>,
    document.body,
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "6px 16px",
        cursor: "pointer",
        color: "var(--vscode-menu-foreground, #ccc)",
        fontSize: "13px",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background =
          "var(--vscode-list-hoverBackground, #2a2d2e)";
        (e.currentTarget as HTMLElement).style.color =
          "var(--vscode-menu-selectionForeground, #fff)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
        (e.currentTarget as HTMLElement).style.color =
          "var(--vscode-menu-foreground, #ccc)";
      }}
    >
      {label}
    </div>
  );
}

function MenuSeparator() {
  return (
    <div
      style={{
        height: 1,
        background: "var(--vscode-menu-separatorBackground, #454545)",
        margin: "4px 0",
      }}
    />
  );
}
