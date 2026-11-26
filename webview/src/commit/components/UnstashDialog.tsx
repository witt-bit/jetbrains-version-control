import { useEffect, useId, useRef, useState } from "react";
import { useDialogDrag } from "../../shared/hooks/useDialogDrag";
import {
  type ShelveEntry,
  useCommitStore,
} from "../../shared/store/commit-store";
import "./stashDialog.css";

interface Props {
  entry: ShelveEntry;
  onClose: () => void;
}

/** Why `name` cannot be a branch name, or null when it looks usable. */
export function branchNameProblem(name: string): string | null {
  if (/\s/.test(name)) return "A branch name cannot contain spaces";
  if (name.startsWith("-")) return "A branch name cannot start with '-'";
  if (name.includes("..") || /[~^:?*[\\]/.test(name)) {
    return "A branch name cannot contain ~ ^ : ? * [ \\ or ..";
  }
  if (name.endsWith("/") || name.endsWith(".lock") || name.endsWith(".")) {
    return "That is not a valid branch name";
  }
  return null;
}

export function UnstashDialog({ entry, onClose }: Props) {
  const unshelveChanges = useCommitStore((s) => s.unshelveChanges);
  const unstashAsBranch = useCommitStore((s) => s.unstashAsBranch);
  const drag = useDialogDrag();
  const ids = useId();
  const branchRef = useRef<HTMLInputElement>(null);
  const [branchName, setBranchName] = useState("");
  const [pop, setPop] = useState(true);
  const [reinstateIndex, setReinstateIndex] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    branchRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  const trimmed = branchName.trim();
  const asBranch = trimmed.length > 0;
  const problem = asBranch ? branchNameProblem(trimmed) : null;

  const submit = async () => {
    if (busy || problem) return;
    setBusy(true);
    if (asBranch) {
      const created = await unstashAsBranch(entry.id, trimmed);
      setBusy(false);
      // A refused branch (name taken, files in the way) keeps the dialog open.
      if (created) onClose();
      return;
    }
    await unshelveChanges(entry.id, pop, reinstateIndex);
    setBusy(false);
    onClose();
  };

  return (
    <div className="stash-dialog-overlay">
      <div
        ref={drag.ref}
        className="stash-dialog"
        style={drag.style}
        onClick={(e) => e.stopPropagation()}
        {...drag.handlers}
      >
        <div className="stash-dialog-title">Unstash Changes</div>

        <div className="stash-dialog-body">
          <div className="stash-dialog-field">
            <span className="stash-dialog-label">Stash:</span>
            <span
              className="stash-dialog-value"
              title={`${entry.id}: ${entry.message}`}
            >
              {entry.message || "Changes"} ({entry.id})
            </span>
          </div>

          <div className="stash-dialog-field">
            <label htmlFor={`${ids}-branch`}>As new branch:</label>
            <input
              id={`${ids}-branch`}
              ref={branchRef}
              type="text"
              value={branchName}
              placeholder="Optional"
              className={problem ? "input-error" : ""}
              onChange={(e) => setBranchName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
            {problem && (
              <div className="stash-dialog-field-error">{problem}</div>
            )}
          </div>

          <div className="stash-dialog-field">
            <label
              className={`stash-dialog-checkbox-label${asBranch ? " disabled" : ""}`}
              htmlFor={`${ids}-pop`}
            >
              <input
                id={`${ids}-pop`}
                type="checkbox"
                checked={asBranch || pop}
                disabled={asBranch}
                onChange={(e) => setPop(e.target.checked)}
              />
              Pop stash
            </label>
            <span className="stash-dialog-hint">
              Remove the stash once it is applied
            </span>
          </div>

          <div className="stash-dialog-field">
            <label
              className={`stash-dialog-checkbox-label${asBranch ? " disabled" : ""}`}
              htmlFor={`${ids}-index`}
            >
              <input
                id={`${ids}-index`}
                type="checkbox"
                checked={asBranch || reinstateIndex}
                disabled={asBranch}
                onChange={(e) => setReinstateIndex(e.target.checked)}
              />
              Reinstate index
            </label>
            <span className="stash-dialog-hint">
              {asBranch
                ? "A new branch always restores staged changes and drops the stash"
                : "Stage the files that were staged when stashed"}
            </span>
          </div>
        </div>

        <div className="stash-dialog-footer">
          <button
            type="button"
            className="stash-dialog-btn-cancel"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="stash-dialog-btn-primary"
            onClick={() => void submit()}
            disabled={busy || problem !== null}
          >
            {asBranch ? "Create Branch" : "Unstash"}
          </button>
        </div>
      </div>
    </div>
  );
}
