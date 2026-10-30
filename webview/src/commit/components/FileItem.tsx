import { useMultiClick } from "../../shared/hooks/useMultiClick";
import type { WorkingTreeFile } from "../../shared/store/commit-store";
import { getCommitFileIcon } from "../utils/file-icon";

export interface FileItemProps {
  file: WorkingTreeFile;
  selected: boolean;
  highlighted: boolean;
  onToggle: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onShowDiff: () => void;
  onJumpToSource: () => void;
  onClick: (e: React.MouseEvent) => void;
}

export function FileItem({
  file,
  selected,
  highlighted,
  onToggle,
  onContextMenu,
  onShowDiff,
  onJumpToSource,
  onClick,
}: FileItemProps) {
  const parts = file.path.split("/");
  const fileName = parts.pop() || parts.pop() || file.path;
  const dirPath = parts.length > 0 ? parts.join("/") : "";

  const statusLabel = getStatusLabel(file.status);
  const statusColor = getStatusColor(file.status);
  const FileIcon = getCommitFileIcon(file.path);

  const handleClick = useMultiClick<React.MouseEvent>({
    1: onClick,
    2: onShowDiff,
    3: onJumpToSource,
  });

  return (
    <div
      className={`commit-file-item ${highlighted ? "highlighted" : ""}`}
      tabIndex={0}
      onClick={handleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e);
      }}
      style={{ userSelect: "none" }}
    >
      <input
        type="checkbox"
        className="commit-file-checkbox"
        checked={selected}
        onChange={onToggle}
      />
      <span className="commit-file-icon">
        <FileIcon style={{ width: 16, height: 16 }} />
      </span>
      <span
        className="commit-file-name"
        title={file.path}
        style={{ color: statusColor }}
      >
        {fileName}
      </span>
      {dirPath && (
        <span className="commit-file-path" title={dirPath}>
          {dirPath}
        </span>
      )}
      <span className="commit-file-status" style={{ color: statusColor }}>
        {statusLabel}
      </span>
    </div>
  );
}

function getStatusLabel(status: WorkingTreeFile["status"]): string {
  switch (status) {
    case "added":
      return "A";
    case "modified":
      return "M";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "untracked":
      return "U";
    case "conflicted":
      return "C";
    default:
      return "?";
  }
}

function getStatusColor(status: WorkingTreeFile["status"]): string {
  switch (status) {
    case "added":
      return "#6a8759";
    case "untracked":
      return "#d1675a";
    case "modified":
      return "#6897bb";
    case "deleted":
      return "#6c6c6c";
    case "renamed":
      return "#b9b462";
    case "conflicted":
      return "#d1675a";
    default:
      return "inherit";
  }
}
