import { useEffect } from "react";
import { bridge } from "../shared/bridge";
import { useWorktreeStore } from "../shared/store/worktree-store";
import { WorktreeList } from "./WorktreeList";
import "./worktree.css";

export function WorktreeApp() {
  const { fetchWorktrees } = useWorktreeStore();

  useEffect(() => {
    fetchWorktrees();
  }, [fetchWorktrees]);

  // Auto-refresh on git state changes
  useEffect(() => {
    const dispose = bridge.onEvent((event) => {
      if (event === "gitStateChanged") {
        fetchWorktrees();
      }
    });
    return dispose;
  }, [fetchWorktrees]);

  return (
    <div className="worktree-app">
      <WorktreeList />
    </div>
  );
}
