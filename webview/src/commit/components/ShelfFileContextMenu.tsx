import { useCallback } from "react";
import { bridge } from "../../shared/bridge";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
} from "../../shared/components/ContextMenu";
import {
  IconCopyPath,
  IconDiff,
  IconJump,
  IconUnshelve,
} from "../../shared/components/icons";
import "../../shared/components/ContextMenu.css";
import { useShowDiffShortcutLabel } from "../../shared/shortcuts";

interface ShelfFileContextMenuProps {
  x: number;
  y: number;
  filePath: string;
  stashId: string;
  onClose: () => void;
}

export function ShelfFileContextMenu({
  x,
  y,
  filePath,
  stashId,
  onClose,
}: ShelfFileContextMenuProps) {
  const showDiffLabel = useShowDiffShortcutLabel();

  const handleShowDiff = useCallback(() => {
    bridge.request("showShelfFileDiff", { stashId, filePath });
    onClose();
  }, [stashId, filePath, onClose]);

  const handleUnshelveFile = useCallback(() => {
    bridge.request("unshelveFile", { stashId, filePath });
    onClose();
  }, [stashId, filePath, onClose]);

  const handleJumpToSource = useCallback(() => {
    bridge.request("openFile", { filePath });
    onClose();
  }, [filePath, onClose]);

  const handleCopyPath = useCallback(() => {
    bridge.request("copyToClipboard", { text: filePath });
    onClose();
  }, [filePath, onClose]);

  return (
    <ContextMenu x={x} y={y} minWidth={200} onClose={onClose}>
      <ContextMenuItem onClick={handleUnshelveFile} icon={<IconUnshelve />}>
        Unshelve This File
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem
        onClick={handleShowDiff}
        icon={<IconDiff />}
        shortcut={showDiffLabel}
      >
        Show Diff
      </ContextMenuItem>

      <ContextMenuItem onClick={handleJumpToSource} icon={<IconJump />}>
        Jump to Source
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem onClick={handleCopyPath} icon={<IconCopyPath />}>
        Copy Path
      </ContextMenuItem>
    </ContextMenu>
  );
}
