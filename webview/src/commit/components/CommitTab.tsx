import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodiconDiscard from "~icons/codicon/discard";
import CodiconFolderActive from "~icons/codicon/folder-active";
import CodiconTrash from "~icons/codicon/trash";
import { bridge } from "../../shared/bridge";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
  useContextMenuDismiss,
} from "../../shared/components/ContextMenu";
import "../../shared/components/ContextMenu.css";
import { useFocusContextKey } from "../../shared/hooks/useFocusContextKey";
import {
  type SelectionMode,
  useModifierClickSelection,
} from "../../shared/hooks/useModifierClickSelection";
import { useDeleteShortcutLabel } from "../../shared/shortcuts";
import {
  useCommitStore,
  type WorkingTreeFile,
} from "../../shared/store/commit-store";
import { CommitFileContextMenu } from "./CommitFileContextMenu";
import { CommitMessageArea } from "./CommitMessageArea";
import { FileItem } from "./FileItem";
import { Toolbar } from "./Toolbar";

export function CommitTab() {
  const {
    changes,
    selectedFiles,
    highlightedFiles,
    expandedGroups,
    groupByDirectory,
    showUnversioned,
    collapsedDirs,
    toggleGroup,
    toggleFileSelection,
    setFileKeys,
    highlightFile,
    showDiff,
    openSourceFile,
    fetchChanges,
    ideaShelveChanges,
  } = useCommitStore();

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    file: WorkingTreeFile;
  } | null>(null);

  const [dirContextMenu, setDirContextMenu] = useState<{
    x: number;
    y: number;
    files: WorkingTreeFile[];
    dirName: string;
  } | null>(null);

  // Group files: staged (Changes) vs unstaged/untracked (Unversioned Files)
  const { stagedFiles, changedFiles, untrackedFiles, conflictedFiles } =
    useMemo(() => {
      const staged: WorkingTreeFile[] = [];
      const changed: WorkingTreeFile[] = [];
      const untracked: WorkingTreeFile[] = [];
      const conflicted: WorkingTreeFile[] = [];

      for (const file of changes) {
        if (file.status === "conflicted") {
          conflicted.push(file);
        } else if (file.staged) {
          staged.push(file);
        } else if (file.status === "untracked") {
          untracked.push(file);
        } else {
          changed.push(file);
        }
      }
      return {
        stagedFiles: staged,
        changedFiles: changed,
        untrackedFiles: untracked,
        conflictedFiles: conflicted,
      };
    }, [changes]);

  // Flat list of every visible file key, in the exact order the rows render.
  // Shared by Shift range selection and (via FileGroup) keyboard navigation so
  // the two can never drift apart.
  const orderedKeys = useMemo(() => {
    const base = { groupByDirectory, collapsedDirs };
    return [
      ...collectVisibleKeys(conflictedFiles, {
        ...base,
        expanded: expandedGroups.has("conflicts"),
      }),
      ...collectVisibleKeys(changedFiles, {
        ...base,
        expanded: expandedGroups.has("changes"),
      }),
      ...collectVisibleKeys(stagedFiles, {
        ...base,
        expanded: expandedGroups.has("staged"),
      }),
      ...(showUnversioned
        ? collectVisibleKeys(untrackedFiles, {
            ...base,
            expanded: expandedGroups.has("unversioned"),
          })
        : []),
    ];
  }, [
    conflictedFiles,
    changedFiles,
    stagedFiles,
    untrackedFiles,
    expandedGroups,
    groupByDirectory,
    showUnversioned,
    collapsedDirs,
  ]);

  const handleHighlightFile = useCallback(
    (key: string, mode: SelectionMode) => {
      highlightFile(key, mode, orderedKeys);
    },
    [highlightFile, orderedKeys],
  );

  const handleFileClick =
    useModifierClickSelection<string>(handleHighlightFile);

  const handleJumpToSource = useCallback(
    (filePath: string) => {
      void openSourceFile(filePath);
    },
    [openSourceFile],
  );

  // Jump to Source (F4 / Cmd+Down). Subscribed from a component rather than at
  // store module scope so the listener only exists in the Commit webview —
  // a module-level listener would also fire in the Git Log and Worktree
  // webviews and open the file three times.
  useFocusContextKey("jgc.commitPanelFocused");
  useEffect(() => {
    return bridge.onEvent((event) => {
      // The broadcast reaches every webview, so only act if this one is the one
      // the shortcut was pressed in.
      if (!document.hasFocus()) return;
      const store = useCommitStore.getState();
      if (event === "jumpToSourceRequested") {
        store.jumpToHighlightedSource();
      } else if (event === "showDiffRequested") {
        void store.showDiffHighlighted();
      } else if (event === "stageFileRequested") {
        void store.stageHighlighted();
      } else if (event === "rollbackFileRequested") {
        void store.rollbackHighlighted();
      } else if (event === "deleteFileRequested") {
        void store.deleteHighlighted();
      } else if (event === "unshelveChangesRequested") {
        void store.unshelveHighlighted();
      } else if (event === "toggleGroupByDirectoryRequested") {
        store.toggleGroupByDirectory();
      }
    });
  }, []);

  const handleShelveSelected = useCallback(async () => {
    const selectedPaths = changes
      .filter((f) => selectedFiles.has(`${f.path}:${f.staged}`))
      .map((f) => f.path);
    if (selectedPaths.length === 0) return;
    await ideaShelveChanges("Shelved changes", [...new Set(selectedPaths)]);
  }, [changes, selectedFiles, ideaShelveChanges]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, file: WorkingTreeFile) => {
      setContextMenu({ x: e.clientX, y: e.clientY, file });
      setDirContextMenu(null);
    },
    [],
  );

  const handleDirContextMenu = useCallback(
    (e: React.MouseEvent, files: WorkingTreeFile[], dirName: string) => {
      e.preventDefault();
      e.stopPropagation();
      setDirContextMenu({ x: e.clientX, y: e.clientY, files, dirName });
      setContextMenu(null);
    },
    [],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const closeDirContextMenu = useCallback(() => {
    setDirContextMenu(null);
  }, []);

  return (
    <div
      className="commit-tab-content"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      <Toolbar
        onRefresh={() => {
          fetchChanges();
          bridge.request("refreshGitState");
        }}
        onShelve={handleShelveSelected}
        onRollback={() => {
          // Use highlighted files (click/focus selection), not checkbox selection
          const highlightedPaths = changes
            .filter((f) => highlightedFiles.has(`${f.path}:${f.staged}`))
            .map((f) => ({ path: f.path, status: f.status, staged: f.staged }));

          if (highlightedPaths.length > 0) {
            bridge.request("openRollbackPanel", { files: highlightedPaths });
          } else {
            // No highlighted files: fall back to all working tree change files
            const allFiles = changes.map((f) => ({
              path: f.path,
              status: f.status,
              staged: f.staged,
            }));
            bridge.request("openRollbackPanel", { files: allFiles });
          }
        }}
        hasChanges={changes.length > 0}
      />

      <div className="commit-file-list">
        {/* Merge Conflicts */}
        {conflictedFiles.length > 0 && (
          <FileGroup
            label="Merge Conflicts"
            files={conflictedFiles}
            count={conflictedFiles.length}
            expanded={expandedGroups.has("conflicts")}
            groupByDirectory={groupByDirectory}
            onToggle={() => toggleGroup("conflicts")}
            selectedFiles={selectedFiles}
            highlightedFiles={highlightedFiles}
            onToggleFile={toggleFileSelection}
            onSetFileKeys={setFileKeys}
            onHighlightFile={handleHighlightFile}
            onFileClick={handleFileClick}
            onJumpToSource={handleJumpToSource}
            onShowDiff={showDiff}
            onContextMenu={handleContextMenu}
            onDirContextMenu={handleDirContextMenu}
            action={
              <span
                className="commit-group-resolve-link"
                onClick={(e) => {
                  e.stopPropagation();
                  bridge.request("openConflictsPanel");
                }}
                onKeyDown={() => {}}
                role="button"
                tabIndex={0}
              >
                Resolve
              </span>
            }
          />
        )}

        {/* Changes (tracked, modified) */}
        {changedFiles.length > 0 && (
          <FileGroup
            label="Changes"
            files={changedFiles}
            count={changedFiles.length}
            expanded={expandedGroups.has("changes")}
            groupByDirectory={groupByDirectory}
            onToggle={() => toggleGroup("changes")}
            selectedFiles={selectedFiles}
            highlightedFiles={highlightedFiles}
            onToggleFile={toggleFileSelection}
            onSetFileKeys={setFileKeys}
            onHighlightFile={handleHighlightFile}
            onFileClick={handleFileClick}
            onJumpToSource={handleJumpToSource}
            onShowDiff={showDiff}
            onContextMenu={handleContextMenu}
            onDirContextMenu={handleDirContextMenu}
          />
        )}

        {/* Staged files */}
        {stagedFiles.length > 0 && (
          <FileGroup
            label="Staged"
            files={stagedFiles}
            count={stagedFiles.length}
            expanded={expandedGroups.has("staged")}
            groupByDirectory={groupByDirectory}
            onToggle={() => toggleGroup("staged")}
            selectedFiles={selectedFiles}
            highlightedFiles={highlightedFiles}
            onToggleFile={toggleFileSelection}
            onSetFileKeys={setFileKeys}
            onHighlightFile={handleHighlightFile}
            onFileClick={handleFileClick}
            onJumpToSource={handleJumpToSource}
            onShowDiff={showDiff}
            onContextMenu={handleContextMenu}
            onDirContextMenu={handleDirContextMenu}
          />
        )}

        {/* Unversioned Files */}
        {showUnversioned && untrackedFiles.length > 0 && (
          <FileGroup
            label="Unversioned Files"
            files={untrackedFiles}
            count={untrackedFiles.length}
            expanded={expandedGroups.has("unversioned")}
            groupByDirectory={groupByDirectory}
            onToggle={() => toggleGroup("unversioned")}
            selectedFiles={selectedFiles}
            highlightedFiles={highlightedFiles}
            onToggleFile={toggleFileSelection}
            onSetFileKeys={setFileKeys}
            onHighlightFile={handleHighlightFile}
            onFileClick={handleFileClick}
            onJumpToSource={handleJumpToSource}
            onShowDiff={showDiff}
            onContextMenu={handleContextMenu}
            onDirContextMenu={handleDirContextMenu}
          />
        )}

        {changes.length === 0 && (
          <div className="shelf-empty">No changes detected</div>
        )}
      </div>

      <CommitMessageArea />

      {contextMenu && (
        <CommitFileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          file={contextMenu.file}
          onClose={closeContextMenu}
        />
      )}
      {dirContextMenu && (
        <DirContextMenu
          x={dirContextMenu.x}
          y={dirContextMenu.y}
          files={dirContextMenu.files}
          dirName={dirContextMenu.dirName}
          onClose={closeDirContextMenu}
        />
      )}
    </div>
  );
}

interface FileGroupProps {
  label: string;
  files: WorkingTreeFile[];
  count: number;
  expanded: boolean;
  groupByDirectory: boolean;
  onToggle: () => void;
  selectedFiles: Set<string>;
  highlightedFiles: Set<string>;
  onToggleFile: (key: string) => void;
  onSetFileKeys: (keys: string[], selected: boolean) => void;
  onHighlightFile: (key: string, mode: SelectionMode) => void;
  onFileClick: (e: React.MouseEvent, key: string) => void;
  onJumpToSource: (filePath: string) => void;
  onShowDiff: (path: string, staged?: boolean) => Promise<void>;
  onContextMenu: (e: React.MouseEvent, file: WorkingTreeFile) => void;
  onDirContextMenu: (
    e: React.MouseEvent,
    files: WorkingTreeFile[],
    dirName: string,
  ) => void;
  action?: React.ReactNode;
}

function FileGroup({
  label,
  files,
  count,
  expanded,
  groupByDirectory,
  onToggle,
  selectedFiles,
  highlightedFiles,
  onToggleFile,
  onSetFileKeys,
  onHighlightFile,
  onFileClick,
  onJumpToSource,
  onShowDiff,
  onContextMenu,
  onDirContextMenu,
  action,
}: FileGroupProps) {
  const allKeys = useMemo(
    () => files.map((f) => `${f.path}:${f.staged}`),
    [files],
  );
  const allSelected = allKeys.every((k) => selectedFiles.has(k));
  const someSelected = allKeys.some((k) => selectedFiles.has(k));

  const handleGroupCheckbox = () => {
    if (allSelected) {
      onSetFileKeys(allKeys, false);
    } else {
      onSetFileKeys(allKeys, true);
    }
  };

  // Flat ordered list of visible file keys for keyboard navigation
  const { collapsedDirs } = useCommitStore();
  const visibleKeys = useMemo(
    () =>
      collectVisibleKeys(files, { expanded, groupByDirectory, collapsedDirs }),
    [expanded, groupByDirectory, files, collapsedDirs],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();

      if (visibleKeys.length === 0) return;

      // Find LAST highlighted index (for correct Shift+Arrow extension)
      let currentIdx = -1;
      for (let i = visibleKeys.length - 1; i >= 0; i--) {
        if (highlightedFiles.has(visibleKeys[i])) {
          currentIdx = i;
          break;
        }
      }

      let nextIdx: number;
      if (e.key === "ArrowDown") {
        nextIdx =
          currentIdx < visibleKeys.length - 1 ? currentIdx + 1 : currentIdx;
      } else {
        nextIdx = currentIdx > 0 ? currentIdx - 1 : 0;
      }

      const mode = e.shiftKey ? "range" : "single";
      onHighlightFile(visibleKeys[nextIdx], mode);
    },
    [visibleKeys, highlightedFiles, onHighlightFile],
  );

  return (
    <div className="commit-group">
      <div className="commit-group-header" onClick={onToggle}>
        <input
          type="checkbox"
          className="commit-group-checkbox"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected && !allSelected;
          }}
          onChange={(e) => {
            e.stopPropagation();
            handleGroupCheckbox();
          }}
          onClick={(e) => e.stopPropagation()}
        />
        <span className={`commit-group-chevron ${expanded ? "" : "collapsed"}`}>
          <ChevronIcon />
        </span>
        {label}
        <span className="commit-group-count">
          {count} {count === 1 ? "file" : "files"}
        </span>
        {action}
      </div>
      {expanded && (
        <div
          className="commit-group-files"
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          {groupByDirectory ? (
            <DirectoryTree
              files={files}
              selectedFiles={selectedFiles}
              highlightedFiles={highlightedFiles}
              onToggleFile={onToggleFile}
              onSetFileKeys={onSetFileKeys}
              onHighlightFile={onHighlightFile}
              onFileClick={onFileClick}
              onJumpToSource={onJumpToSource}
              onShowDiff={onShowDiff}
              onContextMenu={onContextMenu}
              onDirContextMenu={onDirContextMenu}
            />
          ) : (
            files.map((file) => {
              const key = `${file.path}:${file.staged}`;
              return (
                <FileItem
                  key={key}
                  file={file}
                  selected={selectedFiles.has(key)}
                  highlighted={highlightedFiles.has(key)}
                  onToggle={() => onToggleFile(key)}
                  onShowDiff={() => onShowDiff(file.path, file.staged)}
                  onJumpToSource={() => onJumpToSource(file.path)}
                  onContextMenu={(e) => onContextMenu(e, file)}
                  onClick={(e) => onFileClick(e, key)}
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/**
 * File keys in render order for one group: directories (sorted, skipping
 * collapsed ones) first, then this directory's files. Kept in lockstep with
 * `DirNodeView` so Shift ranges always match what the user sees.
 */
function collectVisibleKeys(
  files: WorkingTreeFile[],
  options: {
    expanded: boolean;
    groupByDirectory: boolean;
    collapsedDirs: Set<string>;
  },
): string[] {
  const { expanded, groupByDirectory, collapsedDirs } = options;
  if (!expanded) return [];
  if (!groupByDirectory) {
    return files.map((f) => `${f.path}:${f.staged}`);
  }
  const keys: string[] = [];
  const walk = (node: DirNode) => {
    for (const child of [...node.children].sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (!collapsedDirs.has(child.fullPath)) {
        walk(child);
      }
    }
    for (const file of node.files) {
      keys.push(`${file.path}:${file.staged}`);
    }
  };
  walk(buildDirTree(files));
  return keys;
}

/* ─── Directory Tree View ────────────────────────────────────────── */

interface DirNode {
  name: string;
  fullPath: string;
  children: DirNode[];
  files: WorkingTreeFile[];
}

function buildDirTree(files: WorkingTreeFile[]): DirNode {
  const root: DirNode = { name: "", fullPath: "", children: [], files: [] };

  for (const file of files) {
    const parts = file.path.split("/");
    parts.pop(); // remove filename, we only need directory parts
    let current = root;

    for (const part of parts) {
      let child = current.children.find((c) => c.name === part);
      if (!child) {
        child = {
          name: part,
          fullPath: current.fullPath ? `${current.fullPath}/${part}` : part,
          children: [],
          files: [],
        };
        current.children.push(child);
      }
      current = child;
    }
    current.files.push(file);
  }

  // Compact single-child directories (src/git → src/git)
  compactDirNode(root);
  return root;
}

function compactDirNode(node: DirNode) {
  for (const child of node.children) {
    while (child.children.length === 1 && child.files.length === 0) {
      const grandchild = child.children[0];
      child.name = `${child.name}/${grandchild.name}`;
      child.fullPath = grandchild.fullPath;
      child.children = grandchild.children;
      child.files = grandchild.files;
    }
    compactDirNode(child);
  }
}

/** Collect all file keys recursively under a DirNode */
function collectFileKeys(node: DirNode): string[] {
  const keys: string[] = [];
  for (const file of node.files) {
    keys.push(`${file.path}:${file.staged}`);
  }
  for (const child of node.children) {
    keys.push(...collectFileKeys(child));
  }
  return keys;
}

function DirectoryTree({
  files,
  selectedFiles,
  highlightedFiles,
  onToggleFile,
  onSetFileKeys,
  onHighlightFile,
  onFileClick,
  onJumpToSource,
  onShowDiff,
  onContextMenu,
  onDirContextMenu,
}: {
  files: WorkingTreeFile[];
  selectedFiles: Set<string>;
  highlightedFiles: Set<string>;
  onToggleFile: (key: string) => void;
  onSetFileKeys: (keys: string[], selected: boolean) => void;
  onHighlightFile: (key: string, mode: SelectionMode) => void;
  onFileClick: (e: React.MouseEvent, key: string) => void;
  onJumpToSource: (filePath: string) => void;
  onShowDiff: (path: string, staged?: boolean) => Promise<void>;
  onContextMenu: (e: React.MouseEvent, file: WorkingTreeFile) => void;
  onDirContextMenu: (
    e: React.MouseEvent,
    files: WorkingTreeFile[],
    dirName: string,
  ) => void;
}) {
  const { collapsedDirs, toggleDir } = useCommitStore();
  const tree = useMemo(() => buildDirTree(files), [files]);

  return (
    <DirNodeView
      node={tree}
      depth={0}
      collapsed={collapsedDirs}
      toggleDir={toggleDir}
      selectedFiles={selectedFiles}
      highlightedFiles={highlightedFiles}
      onToggleFile={onToggleFile}
      onSetFileKeys={onSetFileKeys}
      onHighlightFile={onHighlightFile}
      onFileClick={onFileClick}
      onJumpToSource={onJumpToSource}
      onShowDiff={onShowDiff}
      onContextMenu={onContextMenu}
      onDirContextMenu={onDirContextMenu}
    />
  );
}

function DirNodeView({
  node,
  depth,
  collapsed,
  toggleDir,
  selectedFiles,
  highlightedFiles,
  onToggleFile,
  onSetFileKeys,
  onHighlightFile,
  onFileClick,
  onJumpToSource,
  onShowDiff,
  onContextMenu,
  onDirContextMenu,
}: {
  node: DirNode;
  depth: number;
  collapsed: Set<string>;
  toggleDir: (path: string) => void;
  selectedFiles: Set<string>;
  highlightedFiles: Set<string>;
  onToggleFile: (key: string) => void;
  onSetFileKeys: (keys: string[], selected: boolean) => void;
  onHighlightFile: (key: string, mode: SelectionMode) => void;
  onFileClick: (e: React.MouseEvent, key: string) => void;
  onJumpToSource: (filePath: string) => void;
  onShowDiff: (path: string, staged?: boolean) => Promise<void>;
  onContextMenu: (e: React.MouseEvent, file: WorkingTreeFile) => void;
  onDirContextMenu: (
    e: React.MouseEvent,
    files: WorkingTreeFile[],
    dirName: string,
  ) => void;
}) {
  return (
    <>
      {/* Render subdirectories */}
      {node.children
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((child) => {
          const isCollapsed = collapsed.has(child.fullPath);
          const childKeys = collectFileKeys(child);
          const allChecked =
            childKeys.length > 0 &&
            childKeys.every((k) => selectedFiles.has(k));
          const someChecked = childKeys.some((k) => selectedFiles.has(k));

          return (
            <div key={child.fullPath}>
              <div
                className="commit-dir-row"
                style={{ paddingLeft: `${12 + depth * 16}px` }}
                onClick={() => toggleDir(child.fullPath)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const allFiles = collectDirFiles(child);
                  onDirContextMenu(e, allFiles, child.name);
                }}
              >
                <span
                  className={`commit-group-chevron ${isCollapsed ? "collapsed" : ""}`}
                >
                  <ChevronIcon />
                </span>
                <input
                  type="checkbox"
                  className="commit-dir-checkbox"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked && !allChecked;
                  }}
                  onChange={(e) => {
                    e.stopPropagation();
                    if (allChecked) {
                      onSetFileKeys(childKeys, false);
                    } else {
                      onSetFileKeys(childKeys, true);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <FolderIcon />
                <span className="commit-dir-name">{child.name}</span>
                <span className="commit-dir-count">
                  {countFiles(child)}{" "}
                  {countFiles(child) === 1 ? "file" : "files"}
                </span>
              </div>
              {!isCollapsed && (
                <DirNodeView
                  node={child}
                  depth={depth + 1}
                  collapsed={collapsed}
                  toggleDir={toggleDir}
                  selectedFiles={selectedFiles}
                  highlightedFiles={highlightedFiles}
                  onToggleFile={onToggleFile}
                  onSetFileKeys={onSetFileKeys}
                  onHighlightFile={onHighlightFile}
                  onFileClick={onFileClick}
                  onJumpToSource={onJumpToSource}
                  onShowDiff={onShowDiff}
                  onContextMenu={onContextMenu}
                  onDirContextMenu={onDirContextMenu}
                />
              )}
            </div>
          );
        })}
      {/* Render files in this directory */}
      {node.files.map((file) => {
        const key = `${file.path}:${file.staged}`;
        return (
          <div key={key} style={{ paddingLeft: `${(depth + 1) * 16}px` }}>
            <FileItem
              file={{ ...file, path: file.path.split("/").pop() || file.path }}
              selected={selectedFiles.has(key)}
              highlighted={highlightedFiles.has(key)}
              onToggle={() => onToggleFile(key)}
              onShowDiff={() => onShowDiff(file.path, file.staged)}
              onJumpToSource={() => onJumpToSource(file.path)}
              onContextMenu={(e) => onContextMenu(e, file)}
              onClick={(e) => onFileClick(e, key)}
            />
          </div>
        );
      })}
    </>
  );
}

function countFiles(node: DirNode): number {
  let count = node.files.length;
  for (const child of node.children) {
    count += countFiles(child);
  }
  return count;
}

function collectDirFiles(node: DirNode): WorkingTreeFile[] {
  const result: WorkingTreeFile[] = [...node.files];
  for (const child of node.children) {
    result.push(...collectDirFiles(child));
  }
  return result;
}

/* ─── Directory Context Menu ─────────────────────────────────────── */

function DirContextMenu({
  x,
  y,
  files,
  dirName,
  onClose,
}: {
  x: number;
  y: number;
  files: WorkingTreeFile[];
  dirName: string;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useContextMenuDismiss(menuRef, onClose);
  const deleteLabel = useDeleteShortcutLabel();

  const handleDelete = useCallback(() => {
    const paths = files.map((f) => f.path);
    bridge.request("deleteFiles", { filePaths: paths });
    onClose();
  }, [files, onClose]);

  const handleRollback = useCallback(() => {
    const paths = files.map((f) => f.path);
    bridge.request("rollbackFiles", { filePaths: paths });
    onClose();
  }, [files, onClose]);

  const handleOpenInSystemFolder = useCallback(() => {
    const firstFile = files[0];
    if (firstFile) {
      bridge.request("revealInSystemExplorer", { filePath: firstFile.path });
    }
    onClose();
  }, [files, onClose]);

  return (
    <ContextMenu x={x} y={y} minWidth={200}>
      <ContextMenuItem onClick={handleRollback} icon={<CodiconDiscard />}>
        Rollback...
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem
        onClick={handleOpenInSystemFolder}
        icon={<CodiconFolderActive />}
      >
        Open in System Folder
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem
        onClick={handleDelete}
        icon={<CodiconTrash />}
        shortcut={deleteLabel}
      >
        Delete "{dirName}"...
      </ContextMenuItem>
    </ContextMenu>
  );
}

/** expui/vcs/revert.svg */
function FolderIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M8.10584 4.34613L8.25344 4.5H8.46667H13C13.8284 4.5 14.5 5.17157 14.5 6V12.1333C14.5 12.9529 13.932 13.5 13.3667 13.5H2.63333C2.06804 13.5 1.5 12.9529 1.5 12.1333V3.86667C1.5 3.04707 2.06804 2.5 2.63333 2.5H6.1217C6.25792 2.5 6.38824 2.55557 6.48253 2.65387L8.10584 4.34613Z"
        fill="currentColor"
        fillOpacity={0.15}
        stroke="currentColor"
      />
    </svg>
  );
}
function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M6 11.5L9.5 8L6 4.5"
        stroke="currentColor"
        strokeLinecap="round"
      />
    </svg>
  );
}
