import { useCallback } from "react";
import { bridge } from "../../shared/bridge";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
} from "../../shared/components/ContextMenu";
import {
  IconAdd,
  IconDelete,
  IconDiff,
  IconFolderOpen,
  IconJump,
  IconRemove,
  IconRollback,
  IconShelve,
} from "../../shared/components/icons";
import "../../shared/components/ContextMenu.css";
import {
  useDeleteShortcutLabel,
  useJumpToSourceShortcutLabel,
  useRollbackShortcutLabel,
  useShowDiffShortcutLabel,
  useStageFileShortcutLabel,
} from "../../shared/shortcuts";
import type { WorkingTreeFile } from "../../shared/store/commit-store";
import { useCommitStore } from "../../shared/store/commit-store";

interface CommitFileContextMenuProps {
  x: number;
  y: number;
  file: WorkingTreeFile;
  onClose: () => void;
}

export function CommitFileContextMenu({
  x,
  y,
  file,
  onClose,
}: CommitFileContextMenuProps) {
  const jumpToSourceLabel = useJumpToSourceShortcutLabel();
  const showDiffLabel = useShowDiffShortcutLabel();
  const stageFileLabel = useStageFileShortcutLabel();
  const rollbackLabel = useRollbackShortcutLabel();
  const deleteLabel = useDeleteShortcutLabel();
  const {
    stageFile,
    unstageFile,
    rollbackFile,
    showDiff,
    shelveChanges,
    highlightedFiles,
    changes,
  } = useCommitStore();

  const handleShowDiff = useCallback(() => {
    showDiff(file.path, file.staged);
    onClose();
  }, [file, showDiff, onClose]);

  const handleStage = useCallback(() => {
    stageFile(file.path);
    onClose();
  }, [file, stageFile, onClose]);

  const handleUnstage = useCallback(() => {
    unstageFile(file.path);
    onClose();
  }, [file, unstageFile, onClose]);

  const handleRollback = useCallback(() => {
    rollbackFile(file.path);
    onClose();
  }, [file, rollbackFile, onClose]);

  const handleShelve = useCallback(() => {
    // If multiple files are highlighted, shelve all of them; otherwise just this file
    const fileKey = `${file.path}:${file.staged}`;
    if (highlightedFiles.size > 1 && highlightedFiles.has(fileKey)) {
      // Shelve all highlighted files
      const paths = changes
        .filter((f) => highlightedFiles.has(`${f.path}:${f.staged}`))
        .map((f) => f.path);
      shelveChanges("Shelved changes", [...new Set(paths)]);
    } else {
      // Shelve only this file
      shelveChanges("Shelved changes", [file.path]);
    }
    onClose();
  }, [file, shelveChanges, highlightedFiles, changes, onClose]);

  const handleDelete = useCallback(() => {
    const fileKey = `${file.path}:${file.staged}`;
    if (highlightedFiles.size > 1 && highlightedFiles.has(fileKey)) {
      const paths = changes
        .filter((f) => highlightedFiles.has(`${f.path}:${f.staged}`))
        .map((f) => f.path);
      bridge.request("deleteFiles", { filePaths: [...new Set(paths)] });
    } else {
      bridge.request("deleteFiles", { filePaths: [file.path] });
    }
    onClose();
  }, [file, highlightedFiles, changes, onClose]);

  const handleJumpToSource = useCallback(() => {
    bridge.request("openFile", { filePath: file.path });
    onClose();
  }, [file, onClose]);

  const handleOpenInSystemFolder = useCallback(() => {
    bridge.request("revealInSystemExplorer", { filePath: file.path });
    onClose();
  }, [file, onClose]);

  return (
    <ContextMenu x={x} y={y} minWidth={200} onClose={onClose}>
      <ContextMenuItem
        onClick={handleShowDiff}
        icon={<IconDiff />}
        shortcut={showDiffLabel}
      >
        Show Diff
      </ContextMenuItem>

      <ContextMenuItem
        onClick={handleJumpToSource}
        icon={<IconJump />}
        shortcut={jumpToSourceLabel}
      >
        Jump to Source
      </ContextMenuItem>

      <ContextMenuItem
        onClick={handleOpenInSystemFolder}
        icon={<IconFolderOpen />}
      >
        Open in System Folder
      </ContextMenuItem>

      <ContextMenuSeparator />

      {file.staged ? (
        <ContextMenuItem onClick={handleUnstage} icon={<IconRemove />}>
          Unstage
        </ContextMenuItem>
      ) : (
        <ContextMenuItem
          onClick={handleStage}
          icon={<IconAdd />}
          shortcut={stageFileLabel}
        >
          Add to VCS
        </ContextMenuItem>
      )}

      <ContextMenuItem
        onClick={handleRollback}
        icon={<IconRollback />}
        shortcut={rollbackLabel}
      >
        Rollback...
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem onClick={handleShelve} icon={<IconShelve />}>
        Shelve Changes...
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
