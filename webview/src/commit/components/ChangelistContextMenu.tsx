import CodiconCheck from "~icons/codicon/check";
import { runMenuAction } from "../../shared/bridge";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
} from "../../shared/components/ContextMenu";
import "../../shared/components/ContextMenu.css";
import {
  IconAdd,
  IconDelete,
  IconEdit,
  IconShelve,
} from "../../shared/components/icons";
import { useCommitStore } from "../../shared/store/commit-store";
import { DEFAULT_CHANGELIST_ID } from "../../shared/types/git";

interface ChangelistContextMenuProps {
  x: number;
  y: number;
  /** Id of the changelist whose header was right-clicked. */
  id: string;
  onClose: () => void;
}

/** Right-click menu on a changelist header in the Commit panel. */
export function ChangelistContextMenu({
  x,
  y,
  id,
  onClose,
}: ChangelistContextMenuProps) {
  const {
    changelists,
    changes,
    setActiveChangelist,
    createChangelist,
    renameChangelist,
    deleteChangelist,
    shelveChangelist,
  } = useCommitStore();

  const isActive = changelists?.activeId === id;
  const isDefault = id === DEFAULT_CHANGELIST_ID;
  const hasFiles = changes.some((f) => f.changelist === id);

  return (
    <ContextMenu x={x} y={y} minWidth={200} onClose={onClose}>
      <ContextMenuItem
        icon={<CodiconCheck />}
        disabled={isActive}
        onClick={() =>
          runMenuAction(onClose, "Set active changelist", () =>
            setActiveChangelist(id),
          )
        }
      >
        Set Active Changelist
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem
        icon={<IconAdd />}
        onClick={() =>
          runMenuAction(onClose, "Create changelist", () => createChangelist())
        }
      >
        New Changelist...
      </ContextMenuItem>

      <ContextMenuItem
        icon={<IconEdit />}
        onClick={() =>
          runMenuAction(onClose, "Rename changelist", () =>
            renameChangelist(id),
          )
        }
      >
        Rename...
      </ContextMenuItem>

      <ContextMenuItem
        icon={<IconDelete />}
        disabled={isDefault}
        onClick={() =>
          runMenuAction(onClose, "Delete changelist", () =>
            deleteChangelist(id),
          )
        }
      >
        Delete Changelist
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem
        icon={<IconShelve />}
        disabled={!hasFiles}
        onClick={() =>
          runMenuAction(onClose, "Shelve changelist", () =>
            shelveChangelist(id),
          )
        }
      >
        Shelve Changelist...
      </ContextMenuItem>
    </ContextMenu>
  );
}
