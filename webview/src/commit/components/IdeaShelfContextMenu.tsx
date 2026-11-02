import { useCallback, useRef } from "react";
import { bridge } from "../../shared/bridge";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
  useContextMenuDismiss,
} from "../../shared/components/ContextMenu";
import {
  IconApply,
  IconClipboardImport,
  IconCopyPath,
  IconDelete,
  IconImport,
  IconPatch,
  IconUnshelve,
} from "../../shared/components/icons";
import "../../shared/components/ContextMenu.css";
import {
  useDeleteShortcutLabel,
  useUnshelveShortcutLabel,
} from "../../shared/shortcuts";
import type { IdeaShelfEntry } from "../../shared/store/commit-store";
import { useCommitStore } from "../../shared/store/commit-store";

interface IdeaShelfContextMenuProps {
  x: number;
  y: number;
  entry: IdeaShelfEntry;
  onClose: () => void;
}

export function IdeaShelfContextMenu({
  x,
  y,
  entry,
  onClose,
}: IdeaShelfContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  useContextMenuDismiss(menuRef, onClose);
  const unshelveLabel = useUnshelveShortcutLabel();
  const deleteLabel = useDeleteShortcutLabel();
  const { ideaUnshelveChanges, deleteIdeaShelf } = useCommitStore();

  const handleUnshelve = useCallback(() => {
    ideaUnshelveChanges(entry.name, true);
    onClose();
  }, [entry, ideaUnshelveChanges, onClose]);

  const handleApply = useCallback(() => {
    ideaUnshelveChanges(entry.name, false);
    onClose();
  }, [entry, ideaUnshelveChanges, onClose]);

  const handleCreatePatch = useCallback(() => {
    bridge.request("createPatchFromShelf", { shelfName: entry.name });
    onClose();
  }, [entry, onClose]);

  const handleCopyPatch = useCallback(() => {
    bridge.request("copyShelfPatchToClipboard", { shelfName: entry.name });
    onClose();
  }, [entry, onClose]);

  const handleImportPatches = useCallback(() => {
    bridge.request("importPatches");
    onClose();
  }, [onClose]);

  const handleImportFromClipboard = useCallback(() => {
    bridge.request("importPatchFromClipboard");
    onClose();
  }, [onClose]);

  const handleDelete = useCallback(() => {
    deleteIdeaShelf(entry.name);
    onClose();
  }, [entry, deleteIdeaShelf, onClose]);

  return (
    <ContextMenu x={x} y={y} minWidth={220}>
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

      <ContextMenuItem onClick={handleCreatePatch} icon={<IconPatch />}>
        Create Patch...
      </ContextMenuItem>

      <ContextMenuItem onClick={handleCopyPatch} icon={<IconCopyPath />}>
        Copy as Patch to Clipboard
      </ContextMenuItem>

      <ContextMenuItem onClick={handleImportPatches} icon={<IconImport />}>
        Import Patches...
      </ContextMenuItem>

      <ContextMenuItem
        onClick={handleImportFromClipboard}
        icon={<IconClipboardImport />}
      >
        Import Patches from Clipboard
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
