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
} from "../../shared/components/icons";
import "../../shared/components/ContextMenu.css";
import { useShowDiffShortcutLabel } from "../../shared/shortcuts";

interface IdeaShelfFileContextMenuProps {
  x: number;
  y: number;
  filePath: string;
  shelfName: string;
  onClose: () => void;
}

export function IdeaShelfFileContextMenu({
  x,
  y,
  filePath,
  shelfName,
  onClose,
}: IdeaShelfFileContextMenuProps) {
  const showDiffLabel = useShowDiffShortcutLabel();

  const handleShowDiff = useCallback(() => {
    bridge.request("showIdeaShelfFileDiff", { shelfName, filePath });
    onClose();
  }, [shelfName, filePath, onClose]);

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
