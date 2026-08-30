import { useCallback, useRef, useState } from "react";
import CodiconAdd from "~icons/codicon/add";
import CodiconChevronLeft from "~icons/codicon/chevron-left";
import CodiconChevronRight from "~icons/codicon/chevron-right";
import CodiconRefresh from "~icons/codicon/refresh";
import CodiconTrash from "~icons/codicon/trash";
import { bridge } from "../shared/bridge";
import { Tooltip } from "../shared/components/Tooltip";
import { t, tpl } from "../shared/i18n";
import { useWorktreeStore } from "../shared/store/worktree-store";
import type { WorktreeInfo } from "../shared/types/git";
import { NewWorktreeDialog } from "./NewWorktreeDialog";

export function WorktreeList() {
  const { worktrees, loading, removeWorktree, pruneWorktrees, fetchWorktrees } =
    useWorktreeStore();
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    worktree: WorktreeInfo;
  } | null>(null);
  const lastClickedPath = useRef<string | null>(null);

  const hasMainSelected = useCallback(() => {
    for (const p of selectedPaths) {
      const wt = worktrees.find((w) => w.path === p);
      if (wt?.isMain) return true;
    }
    return false;
  }, [selectedPaths, worktrees]);

  const handleRowClick = useCallback(
    (e: React.MouseEvent, wt: WorktreeInfo) => {
      const paths = worktrees.map((w) => w.path);

      if (e.metaKey || e.ctrlKey) {
        // Toggle selection
        setSelectedPaths((prev) => {
          const next = new Set(prev);
          if (next.has(wt.path)) {
            next.delete(wt.path);
          } else {
            next.add(wt.path);
          }
          return next;
        });
      } else if (e.shiftKey && lastClickedPath.current) {
        // Range selection
        const startIdx = paths.indexOf(lastClickedPath.current);
        const endIdx = paths.indexOf(wt.path);
        if (startIdx !== -1 && endIdx !== -1) {
          const from = Math.min(startIdx, endIdx);
          const to = Math.max(startIdx, endIdx);
          setSelectedPaths((prev) => {
            const next = new Set(prev);
            for (let i = from; i <= to; i++) {
              next.add(paths[i]);
            }
            return next;
          });
        }
      } else {
        // Single selection
        setSelectedPaths(new Set([wt.path]));
      }
      lastClickedPath.current = wt.path;
    },
    [worktrees],
  );

  const handleContextMenu = (e: React.MouseEvent, wt: WorktreeInfo) => {
    e.preventDefault();
    if (!selectedPaths.has(wt.path)) {
      setSelectedPaths(new Set([wt.path]));
    }
    setContextMenu({ x: e.clientX, y: e.clientY, worktree: wt });
  };

  const handleOpenRequest = useCallback((wt: WorktreeInfo) => {
    bridge.request("openWorktree", { path: wt.path });
  }, []);

  const handleDeleteSelected = async () => {
    if (selectedPaths.size === 0 || hasMainSelected()) return;
    const confirmed = await bridge.request("showConfirmMessage", {
      message: tpl("worktree.deleteConfirmMany", selectedPaths.size),
      detail: t("worktree.deleteDetailMany"),
    });
    if (confirmed) {
      for (const path of selectedPaths) {
        await removeWorktree(path);
      }
      setSelectedPaths(new Set());
    }
  };

  const handleDeleteSingle = async (wt: WorktreeInfo) => {
    setContextMenu(null);
    if (wt.isMain) {
      await bridge.request("showWarningMessage", {
        message: t("worktree.cannotDeleteMain"),
      });
      return;
    }
    const confirmed = await bridge.request("showConfirmMessage", {
      message: t("worktree.deleteConfirmSingle", { path: wt.path }),
      detail: t("worktree.deleteDetailSingle"),
    });
    if (confirmed) {
      await removeWorktree(wt.path);
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        next.delete(wt.path);
        return next;
      });
    }
  };

  const handleRefresh = () => {
    fetchWorktrees();
  };

  const handlePrune = async () => {
    await pruneWorktrees();
  };

  return (
    <div className="worktree-list">
      <div className="worktree-content">
        {/* Left sidebar toolbar */}
        <div className={`worktree-sidebar ${sidebarOpen ? "open" : "closed"}`}>
          <div className="worktree-sidebar-btns">
            <Tooltip text={t("worktree.newWorktree")}>
              <button
                className="worktree-sidebar-btn"
                onClick={() => setShowNewDialog(true)}
              >
                <CodiconAdd />
              </button>
            </Tooltip>
            <Tooltip text={t("worktree.delete")}>
              <button
                className="worktree-sidebar-btn"
                disabled={selectedPaths.size === 0 || hasMainSelected()}
                onClick={handleDeleteSelected}
              >
                <CodiconTrash />
              </button>
            </Tooltip>
            <Tooltip text={t("worktree.refresh")}>
              <button className="worktree-sidebar-btn" onClick={handleRefresh}>
                <CodiconRefresh />
              </button>
            </Tooltip>
            <Tooltip text={t("worktree.prune")}>
              <button className="worktree-sidebar-btn" onClick={handlePrune}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8.93527 10.1424L7.63107 14.4897C4.33497 14.3053 1.69472 11.665 1.51029 8.36893L5.85762 7.06473L8.93527 10.1424Z"
                    stroke="currentColor"
                  />
                  <path
                    d="M14.5 1.5L10 6"
                    stroke="currentColor"
                    strokeLinecap="round"
                  />
                  <path
                    d="M6.85742 6.35742L6.96289 6.25195C7.73307 5.48178 8.98178 5.48178 9.75195 6.25195V6.25195C10.5221 7.02213 10.5221 8.27084 9.75195 9.04102L9.64648 9.14648"
                    stroke="currentColor"
                  />
                </svg>
              </button>
            </Tooltip>
          </div>
          <button
            className="worktree-sidebar-toggle"
            title={
              sidebarOpen
                ? t("worktree.collapseSidebar")
                : t("worktree.expandSidebar")
            }
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <CodiconChevronLeft /> : <CodiconChevronRight />}
          </button>
        </div>

        {/* Main content */}
        <div className="worktree-main">
          {/* Table header */}
          <div className="worktree-table-header">
            <span className="worktree-col-name">
              {t("worktree.colWorktree")}
            </span>
            <span className="worktree-col-branch">
              {t("worktree.colBranch")}
            </span>
            <span className="worktree-col-path">{t("worktree.colPath")}</span>
          </div>

          {/* List */}
          <div className="worktree-table-body">
            {worktrees.map((wt) => (
              <div
                key={wt.path}
                className={`worktree-row ${selectedPaths.has(wt.path) ? "row-selected" : ""} ${wt.isMain ? "main" : ""}`}
                onClick={(e) => handleRowClick(e, wt)}
                onDoubleClick={() => handleOpenRequest(wt)}
                onContextMenu={(e) => handleContextMenu(e, wt)}
              >
                <span className="worktree-col-name">
                  {wt.isMain && (
                    <span className="worktree-check">&#10003;</span>
                  )}
                  {wt.path.split("/").pop()}
                </span>
                <span className="worktree-col-branch">{wt.branch}</span>
                <span className="worktree-col-path" title={wt.path}>
                  {wt.path}
                </span>
              </div>
            ))}
            {worktrees.length === 0 && !loading && (
              <div className="worktree-empty">{t("worktree.noWorktrees")}</div>
            )}
          </div>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div
            className="worktree-context-overlay"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="worktree-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="worktree-context-item"
              onClick={() => {
                setContextMenu(null);
                handleOpenRequest(contextMenu.worktree);
              }}
            >
              {t("worktree.openAsProject")}
            </button>
            <button
              className="worktree-context-item danger"
              onClick={() => handleDeleteSingle(contextMenu.worktree)}
            >
              {t("worktree.delete")}
            </button>
          </div>
        </>
      )}

      {/* New Worktree dialog */}
      {showNewDialog && (
        <NewWorktreeDialog onClose={() => setShowNewDialog(false)} />
      )}
    </div>
  );
}
