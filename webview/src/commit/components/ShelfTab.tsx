import { useCallback, useEffect, useState } from "react";
import CodiconGitStash from "~icons/codicon/git-stash";
import CodiconTrash from "~icons/codicon/trash";
import { Tooltip } from "../../shared/components/Tooltip";
import "../../shared/components/Tooltip.css";
import {
  type ShelveEntry,
  useCommitStore,
} from "../../shared/store/commit-store";
import { getCommitFileIcon } from "../utils/file-icon";
import { ShelfContextMenu } from "./ShelfContextMenu";
import { ShelfFileContextMenu } from "./ShelfFileContextMenu";
import { StashChangesDialog } from "./StashChangesDialog";
import { UnstashDialog } from "./UnstashDialog";
import "./stashDialog.css";

export function ShelfTab() {
  const { shelves, fetchShelves, clearStashes } = useCommitStore();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [stashDialogOpen, setStashDialogOpen] = useState(false);
  const [unstashEntry, setUnstashEntry] = useState<ShelveEntry | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    entry: ShelveEntry;
  } | null>(null);
  const [fileContextMenu, setFileContextMenu] = useState<{
    x: number;
    y: number;
    filePath: string;
    stashId: string;
  } | null>(null);

  useEffect(() => {
    fetchShelves();
  }, [fetchShelves]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, entry: ShelveEntry) => {
      e.preventDefault();
      e.stopPropagation();
      setFileContextMenu(null);
      setContextMenu({ x: e.clientX, y: e.clientY, entry });
    },
    [],
  );

  const handleFileContextMenu = useCallback(
    (e: React.MouseEvent, filePath: string, stashId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu(null);
      setFileContextMenu({ x: e.clientX, y: e.clientY, filePath, stashId });
    },
    [],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const closeFileContextMenu = useCallback(() => {
    setFileContextMenu(null);
  }, []);

  return (
    <div className="stash-tab">
      <div className="stash-toolbar">
        <button
          type="button"
          className="stash-toolbar-btn"
          onClick={() => setStashDialogOpen(true)}
        >
          <CodiconGitStash />
          Stash Changes...
        </button>
        <span className="stash-toolbar-spacer" />
        <Tooltip text="Clear All Stashes...">
          <button
            type="button"
            className="stash-toolbar-btn"
            aria-label="Clear All Stashes"
            disabled={shelves.length === 0}
            onClick={() => void clearStashes()}
          >
            <CodiconTrash />
          </button>
        </Tooltip>
      </div>

      <div className="shelf-list">
        {shelves.length === 0 && (
          <div className="shelf-empty">
            <p>No stashed changes</p>
            <p style={{ fontSize: 11, marginTop: 8 }}>
              Use Stash Changes... to set local changes aside for later.
            </p>
          </div>
        )}
        {shelves.map((entry) => (
          <ShelfItem
            key={entry.id}
            entry={entry}
            expanded={expandedIds.has(entry.id)}
            onToggle={() => toggleExpand(entry.id)}
            onContextMenu={(e) => handleContextMenu(e, entry)}
            onFileContextMenu={handleFileContextMenu}
          />
        ))}
        {contextMenu && (
          <ShelfContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            entry={contextMenu.entry}
            onUnstashAs={setUnstashEntry}
            onClose={closeContextMenu}
          />
        )}
        {fileContextMenu && (
          <ShelfFileContextMenu
            x={fileContextMenu.x}
            y={fileContextMenu.y}
            filePath={fileContextMenu.filePath}
            stashId={fileContextMenu.stashId}
            onClose={closeFileContextMenu}
          />
        )}
      </div>

      {stashDialogOpen && (
        <StashChangesDialog onClose={() => setStashDialogOpen(false)} />
      )}
      {unstashEntry && (
        <UnstashDialog
          entry={unstashEntry}
          onClose={() => setUnstashEntry(null)}
        />
      )}
    </div>
  );
}

interface ShelfItemProps {
  entry: ShelveEntry;
  expanded: boolean;
  onToggle: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onFileContextMenu: (
    e: React.MouseEvent,
    filePath: string,
    stashId: string,
  ) => void;
}

function ShelfItem({
  entry,
  expanded,
  onToggle,
  onContextMenu,
  onFileContextMenu,
}: ShelfItemProps) {
  const dateStr = formatDate(entry.date);

  return (
    <div className="shelf-item-container" onContextMenu={onContextMenu}>
      <div className="shelf-item-row" onClick={onToggle}>
        <span className={`shelf-item-chevron ${expanded ? "" : "collapsed"}`}>
          <ChevronIcon />
        </span>
        <span className="shelf-item-title">{entry.message || "Changes"}</span>
        <span className="shelf-item-info">
          {entry.files.length} {entry.files.length === 1 ? "file" : "files"},{" "}
          {dateStr}
        </span>
      </div>

      {expanded && entry.files.length > 0 && (
        <div className="shelf-item-file-list">
          {entry.files.map((filePath) => (
            <ShelfFileRow
              key={filePath}
              filePath={filePath}
              onContextMenu={(e) => onFileContextMenu(e, filePath, entry.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ShelfFileRow({
  filePath,
  onContextMenu,
}: {
  filePath: string;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const parts = filePath.split("/");
  const fileName = parts.pop() || filePath;
  const dirPath = parts.length > 0 ? parts.join("/") : "";
  const FileIcon = getCommitFileIcon(filePath);

  return (
    <div
      className="shelf-file-row"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e);
      }}
    >
      <span className="shelf-file-icon">
        <FileIcon style={{ width: 16, height: 16 }} />
      </span>
      <span className="shelf-file-name">{fileName}</span>
      {dirPath && <span className="shelf-file-path">{dirPath}</span>}
    </div>
  );
}

function formatDate(isoDate: string): string {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffHr / 24);

  if (diffHr < 1) return "just now";
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  const d = date.getDate();
  const m = date.getMonth() + 1;
  const y = date.getFullYear() % 100;
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${d}/${m}/${y} ${hh}:${mm}`;
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
