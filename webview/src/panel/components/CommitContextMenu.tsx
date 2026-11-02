import { useEffect, useState } from "react";
import { bridge, bridgeWithProgress, runMenuAction } from "../../shared/bridge";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
} from "../../shared/components/ContextMenu";
import {
  IconBranch,
  IconCherryPick,
  IconDelete,
  IconTag,
} from "../../shared/components/icons";
import "../../shared/components/ContextMenu.css";
import { usePanelStore } from "../../shared/store/panel-store";
import type { Commit } from "../../shared/types/git";

interface CommitContextMenuProps {
  x: number;
  y: number;
  commit: Commit;
  onClose: () => void;
  onCreateBranch?: (hash: string, defaultName: string) => void;
}

export function CommitContextMenu({
  x,
  y,
  commit,
  onClose,
  onCreateBranch,
}: CommitContextMenuProps) {
  const currentBranch = usePanelStore((s) => s.currentBranch);
  const [isRebasing, setIsRebasing] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [isCherryPicking, setIsCherryPicking] = useState(false);

  // Query rebase/merge/cherry-pick state to determine if Drop Commit should be disabled
  useEffect(() => {
    const fetchRepoState = async () => {
      try {
        const [rebaseState, mergeState, cherryPickState] = await Promise.all([
          bridge.request("getRebaseState") as Promise<{ isRebasing: boolean }>,
          bridge.request("getMergeState") as Promise<{ isMerging: boolean }>,
          bridge.request("getCherryPickState") as Promise<{
            isCherryPicking: boolean;
          }>,
        ]);
        setIsRebasing(rebaseState?.isRebasing ?? false);
        setIsMerging(mergeState?.isMerging ?? false);
        setIsCherryPicking(cherryPickState?.isCherryPicking ?? false);
      } catch {
        // If we can't determine state, leave as not disabled
      }
    };
    fetchRepoState();
  }, []);

  const shortHash = commit.shortHash || commit.hash.slice(0, 8);

  const handleCopyHash = () =>
    runMenuAction(onClose, "Copy revision number", () =>
      bridge.request("copyToClipboard", { text: commit.hash }),
    );

  const handleCherryPick = () =>
    runMenuAction(onClose, "Cherry-pick", () =>
      bridgeWithProgress("cherryPick", { hash: commit.hash }),
    );

  const handleCheckoutRevision = () =>
    runMenuAction(onClose, "Checkout revision", () =>
      bridgeWithProgress("checkoutCommit", { hash: commit.hash }),
    );

  const handleResetMixed = () =>
    runMenuAction(onClose, "Reset (mixed)", () =>
      bridgeWithProgress("resetToCommit", {
        hash: commit.hash,
        mode: "mixed",
      }),
    );

  const handleResetSoft = () =>
    runMenuAction(onClose, "Reset (soft)", () =>
      bridgeWithProgress("resetToCommit", { hash: commit.hash, mode: "soft" }),
    );

  const handleResetHard = async () => {
    onClose();
    const result = (await bridge.request("showConfirmMessage", {
      message: `Reset '${currentBranch}' to ${shortHash} (hard)? This will discard all uncommitted changes.`,
      confirmLabel: "Reset",
    })) as { confirmed: boolean };
    if (!result.confirmed) return;
    try {
      await bridgeWithProgress("resetToCommit", {
        hash: commit.hash,
        mode: "hard",
      });
    } catch (err) {
      console.error("Reset failed:", err);
    }
  };

  const handleRevert = () =>
    runMenuAction(onClose, "Revert commit", () =>
      bridgeWithProgress("revertCommit", { hash: commit.hash }),
    );

  const handleDropCommit = async () => {
    onClose();
    try {
      const result = (await bridge.request("showConfirmMessage", {
        message: `Drop commit ${shortHash} "${commit.subject}"?\n\nThis will remove the commit from history but keep its changes as unstaged modifications.\n\nThis operation cannot be undone.`,
        confirmLabel: "Drop Commit",
      })) as { confirmed: boolean };
      if (!result.confirmed) return;
      await bridgeWithProgress("dropCommit", { hash: commit.hash });
    } catch (err) {
      console.error("Drop commit failed:", err);
    }
  };

  const handleNewBranch = async () => {
    onClose();
    if (onCreateBranch) {
      onCreateBranch(commit.hash, "");
      return;
    }
    // Fallback to showInputBox if no dialog handler provided
    const result = (await bridge.request("showInputBox", {
      prompt: `Create new branch from ${shortHash}:`,
      placeHolder: "branch-name",
    })) as { value: string | null };
    if (!result.value || !result.value.trim()) return;
    try {
      await bridge.request("createBranchFromCommit", {
        branchName: result.value.trim(),
        hash: commit.hash,
      });
    } catch (err) {
      console.error("Create branch failed:", err);
    }
  };

  const handleNewTag = async () => {
    onClose();
    const result = (await bridge.request("showInputBox", {
      prompt: `Create tag at ${shortHash}:`,
      placeHolder: "tag-name",
    })) as { value: string | null };
    if (!result.value || !result.value.trim()) return;
    try {
      await bridge.request("createTag", {
        tagName: result.value.trim(),
        hash: commit.hash,
      });
    } catch (err) {
      console.error("Create tag failed:", err);
    }
  };

  const filter = usePanelStore((s) => s.filter);
  const selectCommit = usePanelStore((s) => s.selectCommit);

  const handleShowInGitLog = () => {
    onClose();
    // Clear file filter and select this commit in the full log
    usePanelStore.getState().setFilter({ file: "" });
    // After refresh, select this commit
    setTimeout(() => {
      selectCommit(commit.hash);
    }, 500);
  };

  // Drop Commit is disabled when in detached HEAD, rebasing, merging, or cherry-picking
  const isDropCommitDisabled =
    !currentBranch || isRebasing || isMerging || isCherryPicking;

  return (
    <ContextMenu x={x} y={y} minWidth={200} onClose={onClose}>
      <ContextMenuItem onClick={handleCopyHash} icon={<IconCopy />}>
        Copy Revision Number
      </ContextMenuItem>
      <ContextMenuItem onClick={handleCherryPick} icon={<IconCherryPick />}>
        Cherry-Pick
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleCheckoutRevision}>
        Checkout Revision
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleResetMixed} icon={<IconRevert />}>
        Reset Current Branch to Here (Mixed)...
      </ContextMenuItem>
      <ContextMenuItem onClick={handleResetSoft} icon={<IconRevert />}>
        Reset Current Branch to Here (Soft)...
      </ContextMenuItem>
      <ContextMenuItem onClick={handleResetHard} icon={<IconRevert />}>
        Reset Current Branch to Here (Hard)...
      </ContextMenuItem>
      <ContextMenuItem onClick={handleRevert} icon={<IconRevert />}>
        Revert Commit
      </ContextMenuItem>
      <ContextMenuItem
        onClick={handleDropCommit}
        icon={<IconDelete />}
        disabled={isDropCommitDisabled}
      >
        Drop Commit
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleNewBranch} icon={<IconBranch />}>
        New Branch...
      </ContextMenuItem>
      <ContextMenuItem onClick={handleNewTag} icon={<IconTag />}>
        New Tag...
      </ContextMenuItem>
      {filter.file && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleShowInGitLog} icon={<IconBranch />}>
            Show in Git Log
          </ContextMenuItem>
        </>
      )}
    </ContextMenu>
  );
}

/** Original Commit-menu Copy icon (1 rect variant; the File menu has a different one). */
export function IconCopy() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect
        x="2.5"
        y="3.5"
        width="9"
        height="10"
        rx="1.5"
        stroke="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11 2h.6C12.37 2 13 2.63 13 3.4v.51c0 .03 0 .06 0 .09v7.55c.6-.44 1-1.15 1-1.95V3.4C14 2.07 12.93 1 11.6 1H6.4c-.8 0-1.51.39-1.95 1H6.4H11z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Original Commit-menu Revert icon (compact-decimal variant). */
export function IconRevert() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.85 1.85a.5.5 0 00-.7-.7L1.65 4.65 1.3 5l.35.35 3.5 3.5a.5.5 0 00.7-.7L3.21 5.5H10.5a3.5 3.5 0 010 7H5.5a.5.5 0 000 1h5a4.5 4.5 0 000-9H3.21l2.64-2.65z"
        fill="currentColor"
      />
    </svg>
  );
}
