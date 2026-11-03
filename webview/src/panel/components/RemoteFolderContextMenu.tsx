import { useEffect, useState } from "react";
import { bridge, runMenuAction } from "../../shared/bridge";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
} from "../../shared/components/ContextMenu";

interface RemoteFolderContextMenuProps {
  x: number;
  y: number;
  remoteName: string;
  onClose: () => void;
  /** Opens the Define Remote dialog pre-filled for this remote. */
  onEdit: (remoteName: string, remoteUrl: string) => void;
  /** Opens the Remove Remote confirmation dialog. */
  onRemove: (remoteName: string, remoteUrl: string) => void;
}

/**
 * Context menu for a remote folder row in the Remote section of the branch
 * tree (e.g. the `origin` folder). Offers editing and removing that remote.
 */
export function RemoteFolderContextMenu({
  x,
  y,
  remoteName,
  onClose,
  onEdit,
  onRemove,
}: RemoteFolderContextMenuProps) {
  const [remoteUrl, setRemoteUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = (await bridge.request("getRemoteUrls")) as {
          remotes: { name: string; url: string }[];
        };
        if (cancelled) return;
        const match = result.remotes?.find((r) => r.name === remoteName);
        setRemoteUrl(match?.url ?? "");
      } catch {
        // Menu still works; url only feeds the confirm text.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [remoteName]);

  const handleEdit = () => onEdit(remoteName, remoteUrl);

  const handleRemove = () =>
    runMenuAction(onClose, "Remove remote", async () => {
      onRemove(remoteName, remoteUrl);
    });

  return (
    <ContextMenu x={x} y={y} minWidth={180} onClose={onClose}>
      <ContextMenuItem onClick={handleEdit}>Edit Remote</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleRemove}>Remove Remote</ContextMenuItem>
    </ContextMenu>
  );
}
