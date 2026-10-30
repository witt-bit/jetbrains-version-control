import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { bridge, bridgeWithProgress } from "../../shared/bridge";
import type { BranchInfo } from "../../shared/types/git";

interface HeadContextMenuProps {
  x: number;
  y: number;
  branch: BranchInfo;
  onClose: () => void;
  onCreateBranch: (startPoint: string, defaultName: string) => void;
  onPush: (branchName: string) => void;
}

export function HeadContextMenu({
  x,
  y,
  branch,
  onClose,
  onCreateBranch,
  onPush,
}: HeadContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

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

  const handleNewBranch = () => {
    onCreateBranch(branch.name, `${branch.name}-new`);
    onClose();
  };

  const handleShowDiff = async () => {
    onClose();
    try {
      await bridge.request("showHeadDiff");
    } catch (err) {
      console.error("Show head diff failed:", err);
    }
  };

  const handleNewWorktree = async () => {
    onClose();
    const result = (await bridge.request("showInputBox", {
      prompt: `New worktree path for '${branch.name}':`,
      placeHolder: "../my-worktree",
    })) as { value: string | null };
    if (!result.value || !result.value.trim()) return;
    try {
      await bridgeWithProgress("addWorktree", {
        path: result.value.trim(),
        branch: branch.name,
      });
    } catch (err) {
      console.error("Create worktree failed:", err);
    }
  };

  const handleUpdate = async () => {
    onClose();
    try {
      await bridgeWithProgress("pullBranch", { branchName: branch.name });
    } catch (err) {
      console.error("Update failed:", err);
    }
  };

  const handlePush = () => {
    onPush(branch.name);
  };

  const handleRename = async () => {
    onClose();
    const result = (await bridge.request("showInputBox", {
      prompt: `Rename branch '${branch.name}' to:`,
      value: branch.name,
    })) as { value: string | null };
    if (
      !result.value ||
      !result.value.trim() ||
      result.value.trim() === branch.name
    )
      return;
    try {
      await bridge.request("renameBranch", {
        oldName: branch.name,
        newName: result.value.trim(),
      });
    } catch (err) {
      console.error("Rename failed:", err);
    }
  };

  const items: {
    label: string;
    action: () => void;
    separator?: boolean;
  }[] = [
    { label: `New Branch from '${branch.name}'...`, action: handleNewBranch },
    { label: "Show Diff with Working Tree", action: handleShowDiff },
    {
      label: `New Worktree from '${branch.name}'...`,
      action: handleNewWorktree,
    },
    { label: "", action: () => {}, separator: true },
    { label: "Update", action: handleUpdate },
    { label: "Push...", action: handlePush },
    { label: "", action: () => {}, separator: true },
    { label: "Rename...", action: handleRename },
  ];

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
      {items.map((item, i) =>
        item.separator ? (
          <div
            key={`sep-${i}`}
            style={{
              height: 1,
              background: "var(--vscode-menu-separatorBackground, #454545)",
              margin: "4px 0",
            }}
          />
        ) : (
          <div
            key={item.label}
            onClick={item.action}
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
            {item.label}
          </div>
        ),
      )}
    </div>,
    document.body,
  );
}
