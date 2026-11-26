import { IconFolder, IconFolderOpen } from "../panel/utils/file-icons";
import { IconChevronDown, IconChevronRight } from "../shared/components/icons";

/** A changelist header: the folder-row look plus the file count and an "Active" badge. */
export function ChangelistRow({
  depth,
  label,
  count,
  active,
  collapsed,
  onToggle,
}: {
  depth: number;
  label: string;
  count: number;
  active: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`changes-row changes-row-dir${active ? " changes-row-active" : ""}`}
      style={{ paddingLeft: 6 + depth * 12 }}
      onClick={onToggle}
      title={`${label} — ${count} ${count === 1 ? "file" : "files"}`}
    >
      <span className="changes-chevron">
        {collapsed ? <IconChevronRight /> : <IconChevronDown />}
      </span>
      <span className="changes-icon">
        {collapsed ? <IconFolder /> : <IconFolderOpen />}
      </span>
      <span className="changes-dir-name">{label}</span>
      <span className="changes-count">{count}</span>
      {active && <span className="changes-badge">Active</span>}
    </div>
  );
}
