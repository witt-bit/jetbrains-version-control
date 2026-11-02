import { bridge, bridgeWithProgress, runMenuAction } from "../../shared/bridge";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
} from "../../shared/components/ContextMenu";
import "../../shared/components/ContextMenu.css";
import type { BranchInfo } from "../../shared/types/git";

interface HeadContextMenuProps {
  x: number;
  y: number;
  branch: BranchInfo;
  onClose: () => void;
  onCreateBranch: (startPoint: string, defaultName: string) => void;
  onPush: (branchName: string) => void;
}

export function HeadContextMenu({
  x,
  y,
  branch,
  onClose,
  onCreateBranch,
  onPush,
}: HeadContextMenuProps) {
  const handleNewBranch = () => {
    onCreateBranch(branch.name, `${branch.name}-new`);
    onClose();
  };

  const handleShowDiff = () =>
    runMenuAction(onClose, "Show diff with working tree", () =>
      bridge.request("showHeadDiff"),
    );

  const handleNewWorktree = async () => {
    onClose();
    const result = (await bridge.request("showInputBox", {
      prompt: `New worktree path for '${branch.name}':`,
      placeHolder: "../my-worktree",
    })) as { value: string | null };
    if (!result.value || !result.value.trim()) return;
    try {
      await bridgeWithProgress("addWorktree", {
        path: result.value.trim(),
        branch: branch.name,
      });
    } catch (err) {
      console.error("Create worktree failed:", err);
    }
  };

  const handleUpdate = () =>
    runMenuAction(onClose, "Update", () =>
      bridgeWithProgress("pullBranch", { branchName: branch.name }),
    );

  const handlePush = () => {
    onPush(branch.name);
  };

  const handleRename = async () => {
    onClose();
    const result = (await bridge.request("showInputBox", {
      prompt: `Rename branch '${branch.name}' to:`,
      value: branch.name,
    })) as { value: string | null };
    if (
      !result.value ||
      !result.value.trim() ||
      result.value.trim() === branch.name
    )
      return;
    try {
      await bridge.request("renameBranch", {
        oldName: branch.name,
        newName: result.value.trim(),
      });
    } catch (err) {
      console.error("Rename failed:", err);
    }
  };

  return (
    <ContextMenu x={x} y={y} minWidth={200} onClose={onClose}>
      <ContextMenuItem onClick={handleNewBranch}>
        New Branch from '{branch.name}'...
      </ContextMenuItem>
      <ContextMenuItem onClick={handleShowDiff}>
        Show Diff with Working Tree
      </ContextMenuItem>
      <ContextMenuItem onClick={handleNewWorktree}>
        New Worktree from '{branch.name}'...
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleUpdate}>Update</ContextMenuItem>
      <ContextMenuItem onClick={handlePush}>Push...</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleRename}>Rename...</ContextMenuItem>
    </ContextMenu>
  );
}
