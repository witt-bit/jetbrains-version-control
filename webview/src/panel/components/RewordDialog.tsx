import { useEffect, useRef, useState } from "react";
import { bridgeWithProgress, reportActionError } from "../../shared/bridge";
import { useDialogDrag } from "../../shared/hooks/useDialogDrag";
import type { Commit } from "../../shared/types/git";
import { originalMessage } from "../rebaseDialogLogic";
import "./InteractiveRebaseDialog.css";
import { useDialogChrome } from "./useDialogChrome";

interface RewordDialogProps {
  commit: Commit;
  onClose: () => void;
}

export function RewordDialog({ commit, onClose }: RewordDialogProps) {
  const original = originalMessage({
    subject: commit.subject,
    body: commit.body?.trim() ?? "",
  });
  const [message, setMessage] = useState(original);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const drag = useDialogDrag();
  useDialogChrome(onClose);

  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  const canSubmit = message.trim() !== "" && message.trim() !== original.trim();

  const submit = () => {
    if (!canSubmit) return;
    const text = message;
    onClose();
    // The dialog is gone by the time git answers, so a failure (conflict,
    // dirty tree, …) has to reach the user through the notification channel.
    void bridgeWithProgress("rewordCommit", {
      hash: commit.hash,
      message: text,
    }).catch((err) => reportActionError("Edit commit message", err));
  };

  return (
    <div className="irb-overlay">
      <div
        ref={drag.ref}
        className="irb-dialog narrow"
        style={drag.style}
        {...drag.handlers}
      >
        <div className="irb-title">Edit Commit Message</div>
        <div className="irb-subtitle">
          {commit.shortHash} · {commit.authorName}
        </div>
        <div className="irb-body">
          <textarea
            ref={textareaRef}
            className="irb-message"
            value={message}
            spellCheck
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div className="irb-note">
            Rewrites this commit and every commit after it on the current
            branch.
          </div>
        </div>
        <div className="irb-footer">
          <button type="button" className="irb-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="irb-btn-primary"
            disabled={!canSubmit}
            onClick={submit}
          >
            Reword
          </button>
        </div>
      </div>
    </div>
  );
}
