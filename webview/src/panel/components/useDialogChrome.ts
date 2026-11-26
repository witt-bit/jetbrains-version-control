import { useEffect } from "react";
import { bridge } from "../../shared/bridge";

/**
 * What every Git Log dialog does around its card: borrow the Worktrees view's
 * height while open (given back on every way out) and close on Escape.
 */
export function useDialogChrome(onClose: () => void): void {
  useEffect(() => {
    void bridge.request("setPanelDialogOpen", {
      open: true,
      hideViewId: "git-brains.worktrees",
    });
    return () => {
      void bridge.request("setPanelDialogOpen", { open: false });
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);
}
