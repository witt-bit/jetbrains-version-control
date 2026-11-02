import { useCallback, useRef } from "react";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
  useContextMenuDismiss,
} from "../../shared/components/ContextMenu";
import {
  IconApply,
  IconDelete,
  IconUnshelve,
} from "../../shared/components/icons";
import "../../shared/components/ContextMenu.css";
import {
  useDeleteShortcutLabel,
  useUnshelveShortcutLabel,
} from "../../shared/shortcuts";
import type { ShelveEntry } from "../../shared/store/commit-store";
import { useCommitStore } from "../../shared/store/commit-store";

interface ShelfContextMenuProps {
  x: number;
  y: number;
  entry: ShelveEntry;
  onClose: () => void;
}

export function ShelfContextMenu({
  x,
  y,
  entry,
  onClose,
}: ShelfContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  useContextMenuDismiss(menuRef, onClose);
  const unshelveLabel = useUnshelveShortcutLabel();
  const deleteLabel = useDeleteShortcutLabel();
  const { unshelveChanges, deleteShelve } = useCommitStore();

  const handleUnshelve = useCallback(() => {
    unshelveChanges(entry.id, true);
    onClose();
  }, [entry, unshelveChanges, onClose]);

  const handleApply = useCallback(() => {
    unshelveChanges(entry.id, false);
    onClose();
  }, [entry, unshelveChanges, onClose]);

  const handleDelete = useCallback(() => {
    deleteShelve(entry.id);
    onClose();
  }, [entry, deleteShelve, onClose]);

  return (
    <ContextMenu x={x} y={y} minWidth={200}>
      <ContextMenuItem
        onClick={handleUnshelve}
        icon={<IconUnshelve />}
        shortcut={unshelveLabel}
      >
        Unshelve...
      </ContextMenuItem>

      <ContextMenuItem onClick={handleApply} icon={<IconApply />}>
        Restore
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem
        onClick={handleDelete}
        icon={<IconDelete />}
        shortcut={deleteLabel}
      >
        Delete...
      </ContextMenuItem>
    </ContextMenu>
  );
}
