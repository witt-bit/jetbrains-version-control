import { useEffect, useId, useRef, useState } from "react";
import { useDialogDrag } from "../../shared/hooks/useDialogDrag";
import { useCommitStore } from "../../shared/store/commit-store";
import "./stashDialog.css";

interface Props {
  onClose: () => void;
}

export function StashChangesDialog({ onClose }: Props) {
  const stashChanges = useCommitStore((s) => s.stashChanges);
  const drag = useDialogDrag();
  const ids = useId();
  const messageRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [keepIndex, setKeepIndex] = useState(false);
  // On by default: the Stash tab always stashed untracked files before.
  const [includeUntracked, setIncludeUntracked] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    messageRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    const outcome = await stashChanges({
      message: message.trim(),
      keepIndex,
      includeUntracked,
    });
    setBusy(false);
    // A failure keeps the dialog so the options can be adjusted and retried.
    if (outcome !== "failed") onClose();
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
        <div className="stash-dialog-title">Stash Changes</div>

        <div className="stash-dialog-body">
          <div className="stash-dialog-field">
            <label htmlFor={`${ids}-message`}>Message:</label>
            <input
              id={`${ids}-message`}
              ref={messageRef}
              type="text"
              value={message}
              placeholder="Optional"
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
          </div>

          <div className="stash-dialog-field">
            <label
              className="stash-dialog-checkbox-label"
              htmlFor={`${ids}-keep`}
            >
              <input
                id={`${ids}-keep`}
                type="checkbox"
                checked={keepIndex}
                onChange={(e) => setKeepIndex(e.target.checked)}
              />
              Keep index
            </label>
            <span className="stash-dialog-hint">
              Leave staged changes in the working tree
            </span>
          </div>

          <div className="stash-dialog-field">
            <label
              className="stash-dialog-checkbox-label"
              htmlFor={`${ids}-untracked`}
            >
              <input
                id={`${ids}-untracked`}
                type="checkbox"
                checked={includeUntracked}
                onChange={(e) => setIncludeUntracked(e.target.checked)}
              />
              Untracked
            </label>
            <span className="stash-dialog-hint">
              Also stash untracked files
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
            disabled={busy}
          >
            Stash
          </button>
        </div>
      </div>
    </div>
  );
}
