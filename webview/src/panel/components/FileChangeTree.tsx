import { useCallback, useEffect, useState } from "react";
import CodiconListFlat from "~icons/codicon/list-flat";
import CodiconListTree from "~icons/codicon/list-tree";
import { bridge } from "../../shared/bridge";
import { FileTree } from "../../shared/components/FileTree";
import { Tooltip } from "../../shared/components/Tooltip";
import "../../shared/components/Tooltip.css";
import { useFocusContextKey } from "../../shared/hooks/useFocusContextKey";
import { t } from "../../shared/i18n";
import { usePanelStore } from "../../shared/store/panel-store";
import type { DiffFile } from "../../shared/types/git";
import { FileContextMenu } from "./FileContextMenu";

export function FileChangeTree() {
  const commitFiles = usePanelStore((s) => s.commitFiles);
  const selectedFilePath = usePanelStore((s) => s.selectedFilePath);
  const selectedCommitHash = usePanelStore((s) => s.selectedCommitHash);
  const selectFile = usePanelStore((s) => s.selectFile);
  const openDiffEditor = usePanelStore((s) => s.openDiffEditor);

  const [viewMode, setViewMode] = useState<"tree" | "flat">("tree");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    file: DiffFile;
  } | null>(null);

  // Single click only selects. Double / triple click are handled by FileTree via
  // its own multi-click sequence, so no timing state is kept here.
  const handleFileClick = useCallback(
    (_e: React.MouseEvent, file: DiffFile) => {
      selectFile(file.newPath || file.oldPath);
    },
    [selectFile],
  );

  const handleOpenDiff = useCallback(
    (file: DiffFile) => {
      if (selectedCommitHash) {
        openDiffEditor(selectedCommitHash, file);
      }
    },
    [selectedCommitHash, openDiffEditor],
  );

  const handleJumpToSource = useCallback((file: DiffFile) => {
    void bridge.request("openFile", {
      filePath: file.newPath || file.oldPath,
    });
  }, []);

  // Jump to Source (F4 / Cmd+Down) for the row selected in this list.
  useFocusContextKey("jgc.gitLogPanelFocused");
  useEffect(() => {
    return bridge.onEvent((event) => {
      // The broadcast reaches every webview, so only act if this one has focus.
      if (event !== "jumpToSourceRequested" || !document.hasFocus()) return;
      const file = commitFiles.find(
        (f) => (f.newPath || f.oldPath) === selectedFilePath,
      );
      if (file) handleJumpToSource(file);
    });
  }, [commitFiles, selectedFilePath, handleJumpToSource]);

  const handleFileContextMenu = useCallback(
    (e: React.MouseEvent, file: DiffFile) => {
      setContextMenu({ x: e.clientX, y: e.clientY, file });
    },
    [],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const filter = usePanelStore((s) => s.filter);

  // When file filter is active, only show that file
  const displayFiles = filter.file
    ? commitFiles.filter((f) => (f.newPath || f.oldPath) === filter.file)
    : commitFiles;

  if (displayFiles.length === 0 && commitFiles.length === 0) {
    return (
      <div style={{ padding: 12, opacity: 0.5 }}>
        {t("panel.files.selectCommit")}
      </div>
    );
  }

  if (displayFiles.length === 0 && filter.file) {
    return (
      <div style={{ padding: 12, opacity: 0.5 }}>
        {t("panel.files.noChangesInCommit", {
          file: filter.file.split("/").pop() ?? filter.file,
        })}
      </div>
    );
  }

  const selectedFiles = selectedFilePath ? [selectedFilePath] : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Fixed header — does not scroll */}
      <div
        style={{
          padding: "6px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontWeight: 600,
            fontSize: "0.8em",
            opacity: 0.6,
          }}
        >
          {t("panel.files.changed")}
        </span>
        <span style={{ display: "flex", gap: 2 }}>
          <Tooltip text={t("push.treeView")}>
            <button
              type="button"
              onClick={() => setViewMode("tree")}
              style={{
                background:
                  viewMode === "tree" ? "var(--selected-bg)" : "transparent",
                border: "none",
                borderRadius: 3,
                cursor: "pointer",
                padding: "2px 4px",
                display: "flex",
                alignItems: "center",
                color: "inherit",
              }}
            >
              <CodiconListTree />
            </button>
          </Tooltip>
          <Tooltip text={t("push.flatList")}>
            <button
              type="button"
              onClick={() => setViewMode("flat")}
              style={{
                background:
                  viewMode === "flat" ? "var(--selected-bg)" : "transparent",
                border: "none",
                borderRadius: 3,
                cursor: "pointer",
                padding: "2px 4px",
                display: "flex",
                alignItems: "center",
                color: "inherit",
              }}
            >
              <CodiconListFlat />
            </button>
          </Tooltip>
        </span>
      </div>

      {/* Scrollable content area */}
      <div style={{ flex: 1, overflow: "auto", overflowX: "hidden" }}>
        <FileTree
          files={displayFiles}
          viewMode={viewMode}
          selectedFiles={selectedFiles}
          onFileClick={handleFileClick}
          onFileDoubleClick={handleOpenDiff}
          onFileTripleClick={handleJumpToSource}
          onFileContextMenu={handleFileContextMenu}
          collapsed={collapsed}
          onToggle={toggleCollapse}
        />
      </div>
      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          file={contextMenu.file}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}
