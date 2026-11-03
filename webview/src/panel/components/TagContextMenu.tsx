import { useCallback } from "react";
import {
  bridge,
  bridgeWithProgress,
  reportActionError,
  runMenuAction,
} from "../../shared/bridge";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
} from "../../shared/components/ContextMenu";
import "../../shared/components/ContextMenu.css";
import { usePanelStore } from "../../shared/store/panel-store";
import type { TagInfo } from "../../shared/types/git";

interface TagContextMenuProps {
  x: number;
  y: number;
  tag: TagInfo;
  selectedTags: string[];
  onClose: () => void;
}

export function TagContextMenu({
  x,
  y,
  tag,
  selectedTags,
  onClose,
}: TagContextMenuProps) {
  const { currentBranch } = usePanelStore();

  const isMultiSelect = selectedTags.length > 1;

  const handleCheckout = useCallback(
    () =>
      runMenuAction(onClose, "Checkout tag", () =>
        bridgeWithProgress("checkoutTag", { tagName: tag.name }),
      ),
    [tag.name, onClose],
  );

  const handleShowDiff = useCallback(
    () =>
      runMenuAction(onClose, "Show tag diff", () =>
        bridge.request("showTagDiff", { tagName: tag.name }),
      ),
    [tag.name, onClose],
  );

  const handleMerge = useCallback(async () => {
    onClose();
    const result = (await bridge.request("showConfirmMessage", {
      message: `Merge '${tag.name}' into '${currentBranch}'?`,
      confirmLabel: "Merge",
    })) as { confirmed: boolean };
    if (!result.confirmed) return;
    try {
      await bridgeWithProgress("mergeTag", { tagName: tag.name });
    } catch (err) {
      await reportActionError("Merge tag", err);
    }
  }, [tag.name, currentBranch, onClose]);

  const handleNewWorktree = useCallback(async () => {
    onClose();
    const result = (await bridge.request("showInputBox", {
      prompt: `New worktree path for tag '${tag.name}':`,
      placeHolder: "../my-worktree",
    })) as { value: string | null };
    if (!result.value || !result.value.trim()) return;
    try {
      await bridgeWithProgress("addWorktree", {
        path: result.value.trim(),
        branch: tag.name,
      });
    } catch (err) {
      await reportActionError("Create worktree from tag", err);
    }
  }, [tag.name, onClose]);

  const handlePush = useCallback(async () => {
    onClose();
    // Let the user pick the remote instead of hardcoding origin — repos can
    // have several remotes, and "origin" may not exist at all.
    const result = (await bridge.request("getRemoteUrls")) as {
      remotes: { name: string; url: string }[];
    };
    const names = (result.remotes ?? []).map((r) => r.name);
    if (names.length === 0) {
      // Nothing to push to — tell the user where remotes are managed.
      await bridge
        .request("showErrorNotification", {
          message: "No remotes configured — add one under Manage Remotes.",
        })
        .catch(() => undefined);
      return;
    }
    const pick = (await bridge.request("showQuickPick", {
      items: names,
      placeHolder: `Push tag '${tag.name}' to which remote?`,
    })) as { value: string | null };
    if (!pick.value) return;
    try {
      await bridgeWithProgress("pushTag", {
        tagName: tag.name,
        remote: pick.value,
      });
    } catch (err) {
      await reportActionError("Push tag", err);
    }
  }, [tag.name, onClose]);

  const handleDelete = useCallback(async () => {
    onClose();
    const tagsToDelete = isMultiSelect ? selectedTags : [tag.name];
    const result = (await bridge.request("showConfirmMessage", {
      message:
        tagsToDelete.length > 1
          ? `Delete ${tagsToDelete.length} tags?`
          : `Delete tag '${tagsToDelete[0]}'?`,
      confirmLabel: "Delete",
    })) as { confirmed: boolean };
    if (!result.confirmed) return;
    try {
      for (const t of tagsToDelete) {
        await bridgeWithProgress("deleteTag", { tagName: t });
      }
    } catch (err) {
      await reportActionError("Delete tag", err);
    }
  }, [tag.name, selectedTags, isMultiSelect, onClose]);

  // Multi-select: only Delete
  if (isMultiSelect) {
    return (
      <ContextMenu x={x} y={y} minWidth={160} onClose={onClose}>
        <ContextMenuItem onClick={handleDelete}>Delete</ContextMenuItem>
      </ContextMenu>
    );
  }

  return (
    <ContextMenu x={x} y={y} minWidth={200} onClose={onClose}>
      <ContextMenuItem onClick={handleCheckout}>Checkout</ContextMenuItem>
      <ContextMenuItem onClick={handleShowDiff}>
        Show Diff with Working Tree
      </ContextMenuItem>
      <ContextMenuItem onClick={handleMerge}>
        Merge '{tag.name}' into '{currentBranch}'
      </ContextMenuItem>
      <ContextMenuItem onClick={handleNewWorktree}>
        New Worktree from '{tag.name}'...
      </ContextMenuItem>
      <ContextMenuItem onClick={handlePush}>Push to remote...</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleDelete}>Delete</ContextMenuItem>
    </ContextMenu>
  );
}
