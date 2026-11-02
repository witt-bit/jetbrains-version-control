import {} from "react";
import { bridge, bridgeWithProgress, runMenuAction } from "../../shared/bridge";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
} from "../../shared/components/ContextMenu";
import {
  IconCherryPick,
  IconDiff,
  IconEdit,
} from "../../shared/components/icons";
import "../../shared/components/ContextMenu.css";
import { useJumpToSourceShortcutLabel } from "../../shared/shortcuts";
import { usePanelStore } from "../../shared/store/panel-store";
import type { DiffFile } from "../../shared/types/git";

interface FileContextMenuProps {
  x: number;
  y: number;
  file: DiffFile;
  onClose: () => void;
}

export function FileContextMenu({ x, y, file, onClose }: FileContextMenuProps) {
  const jumpToSourceLabel = useJumpToSourceShortcutLabel();
  const selectedCommitHash = usePanelStore((s) => s.selectedCommitHash);
  const openDiffEditor = usePanelStore((s) => s.openDiffEditor);

  const filePath = file.newPath || file.oldPath;

  const handleShowDiff = () => {
    onClose();
    if (selectedCommitHash) {
      openDiffEditor(selectedCommitHash, file);
    }
  };

  const handleEditSource = () =>
    runMenuAction(onClose, "Edit source", () =>
      bridge.request("openFile", { filePath }),
    );

  const handleOpenRepoVersion = () => {
    if (!selectedCommitHash) return;
    runMenuAction(onClose, "Open repository version", () =>
      bridge.request("openFileAtRevision", {
        filePath,
        ref: selectedCommitHash,
      }),
    );
  };

  const handleCopyPath = () =>
    runMenuAction(onClose, "Copy path", () =>
      bridge.request("copyToClipboard", { text: filePath }),
    );

  const handleCopyFileName = () => {
    const fileName = filePath.split("/").pop() ?? filePath;
    runMenuAction(onClose, "Copy file name", () =>
      bridge.request("copyToClipboard", { text: fileName }),
    );
  };

  const handleRevertFileChanges = async () => {
    onClose();
    if (!selectedCommitHash) return;
    const result = (await bridge.request("showConfirmMessage", {
      message: `Revert changes to '${filePath.split("/").pop()}' from this commit?`,
      confirmLabel: "Revert",
    })) as { confirmed: boolean };
    if (!result.confirmed) return;
    try {
      await bridgeWithProgress("revertFileChanges", {
        hash: selectedCommitHash,
        filePath,
        status: file.status,
      });
    } catch (err) {
      console.error("Revert file changes failed:", err);
    }
  };

  const handleCherryPickFileChanges = async () => {
    onClose();
    if (!selectedCommitHash) return;
    const result = (await bridge.request("showConfirmMessage", {
      message: `Apply changes to '${filePath.split("/").pop()}' from this commit to working tree?`,
      confirmLabel: "Apply",
    })) as { confirmed: boolean };
    if (!result.confirmed) return;
    try {
      await bridgeWithProgress("cherryPickFileChanges", {
        hash: selectedCommitHash,
        filePath,
      });
    } catch (err) {
      console.error("Cherry-pick file changes failed:", err);
    }
  };

  const handleHistoryUpToHere = () => {
    onClose();
    usePanelStore.getState().setFilter({ file: filePath });
  };

  return (
    <ContextMenu x={x} y={y} minWidth={200} onClose={onClose}>
      <ContextMenuItem onClick={handleShowDiff} icon={<IconDiff />}>
        Show Diff
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onClick={handleEditSource}
        icon={<IconEdit />}
        shortcut={jumpToSourceLabel}
      >
        Edit Source
      </ContextMenuItem>
      <ContextMenuItem onClick={handleOpenRepoVersion}>
        Open Repository Version
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleRevertFileChanges} icon={<IconRevert />}>
        Revert Selected Changes
      </ContextMenuItem>
      <ContextMenuItem
        onClick={handleCherryPickFileChanges}
        icon={<IconCherryPick />}
      >
        Cherry-Pick Selected Changes
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleCopyPath} icon={<IconCopy />}>
        Copy Path
      </ContextMenuItem>
      <ContextMenuItem onClick={handleCopyFileName} icon={<IconCopy />}>
        Copy File Name
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleHistoryUpToHere}>
        History Up to Here
      </ContextMenuItem>
    </ContextMenu>
  );
}

/** Original File-menu Copy icon (4 rects; the Commit menu has a different one). */
export function IconCopy() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="2.5"
        y="3.5"
        width="9"
        height="10"
        rx="1.5"
        stroke="currentColor"
      />
      <rect x="5" y="6" width="4" height="1" rx="0.5" fill="currentColor" />
      <rect x="5" y="8" width="4" height="1" rx="0.5" fill="currentColor" />
      <rect x="5" y="10" width="4" height="1" rx="0.5" fill="currentColor" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11.0017 2H11.5998C12.373 2 12.9998 2.6268 12.9998 3.4V3.91081C13.0011 3.94038 13.0017 3.97011 13.0017 4V11.5482C13.6063 11.1124 13.9998 10.4021 13.9998 9.6V3.4C13.9998 2.07452 12.9253 1 11.5998 1H6.39978C5.59677 1 4.88587 1.39437 4.4502 2H6.39978H11.0017Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Original File-menu Revert icon (full-precision path). */
export function IconRevert() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.85363 1.85355C6.04889 1.65829 6.04889 1.34171 5.85363 1.14645C5.65837 0.951184 5.34178 0.951184 5.14652 1.14645L1.64652 4.64645L1.29297 5L1.64652 5.35355L5.14652 8.85355C5.34178 9.04882 5.65837 9.04882 5.85363 8.85355C6.04889 8.65829 6.04889 8.34171 5.85363 8.14645L3.20718 5.5H10.5001C12.4331 5.5 14.0001 7.067 14.0001 9C14.0001 10.933 12.4331 12.5 10.5001 12.5H5.50008C5.22393 12.5 5.00008 12.7239 5.00008 13C5.00008 13.2761 5.22393 13.5 5.50008 13.5H10.5001C12.9854 13.5 15.0001 11.4853 15.0001 9C15.0001 6.51472 12.9854 4.5 10.5001 4.5H3.20718L5.85363 1.85355Z"
        fill="currentColor"
      />
    </svg>
  );
}
