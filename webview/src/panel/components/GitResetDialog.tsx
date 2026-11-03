import { useCallback, useEffect, useRef, useState } from "react";
import { bridgeWithProgress, reportActionError } from "../../shared/bridge";
import type { Commit } from "../../shared/types/git";
import "./GitResetDialog.css";

export type ResetMode = "soft" | "mixed" | "hard" | "keep";

interface GitResetDialogProps {
  commit: Commit;
  branchName: string;
  onClose: () => void;
}

const MODE_DESCRIPTIONS: Record<ResetMode, string> = {
  soft: "Files won't change, differences will be staged for commit.",
  mixed: "Files won't change, differences won't be staged.",
  hard: "Files will be reverted to the state of the selected commit. Warning: any local changes will be lost.",
  keep: "Files will be reverted to the state of the selected commit, but local changes will be kept intact.",
};

const MODE_ORDER: ResetMode[] = ["soft", "mixed", "hard", "keep"];

export function GitResetDialog({
  commit,
  branchName,
  onClose,
}: GitResetDialogProps) {
  const [selectedMode, setSelectedMode] = useState<ResetMode>("mixed");
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  const handleReset = () => {
    // No `submitting` guard state: onClose() unmounts us immediately, so the
    // disabled style would never render.
    const mode = selectedMode;
    onClose();
    // A failed reset (local changes in the way, conflicts, …) must reach the
    // user — the dialog is already gone, so a bare `void` would swallow it.
    void bridgeWithProgress("resetToCommit", {
      hash: commit.hash,
      mode,
    }).catch((err) => reportActionError(`Reset (${mode})`, err));
  };

  const containerStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 100000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0, 0, 0, 0.4)",
    userSelect: "none",
  };

  const dialogStyle: React.CSSProperties = {
    background: "var(--vscode-editorWidget-background, #252526)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    width: 640,
    display: "flex",
    flexDirection: "column",
  };

  const titleStyle: React.CSSProperties = {
    padding: "12px 16px 8px 16px",
    display: "flex",
    justifyContent: "center",
  };

  const commitInfoStyle: React.CSSProperties = {
    padding: "0 20px 12px 20px",
    fontSize: "13px",
    color: "var(--vscode-descriptionForeground, #999)",
    lineHeight: 1.5,
  };

  const bodyStyle: React.CSSProperties = {
    padding: "0 20px 16px 20px",
  };

  const modeStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "6px 0",
    cursor: "pointer",
  };

  const modeTextStyle: React.CSSProperties = {
    flex: 1,
  };

  const modeNameStyle: React.CSSProperties = {
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--vscode-foreground, #ccc)",
  };

  const modeDescStyle: React.CSSProperties = {
    fontSize: "12px",
    color: "var(--vscode-descriptionForeground, #999)",
    lineHeight: 1.4,
  };

  return (
    <div ref={backdropRef} onClick={handleBackdropClick} style={containerStyle}>
      <div style={dialogStyle}>
        {/* Title */}
        <div style={titleStyle}>
          <span style={{ fontSize: "15px", fontWeight: 600 }}>Git Reset</span>
        </div>

        {/* Commit info */}
        <div style={commitInfoStyle}>
          {branchName} → {commit.shortHash} "{commit.subject}" by{" "}
          {commit.authorName}
        </div>

        {/* Description */}
        <div
          style={{
            padding: "0 20px 12px 20px",
            fontSize: "13px",
            color: "var(--vscode-foreground, #ccc)",
            lineHeight: 1.5,
          }}
        >
          This will reset the current branch head to the selected commit, and
          update the working tree and the index according to the selected mode:
        </div>

        {/* Mode selection */}
        <div style={bodyStyle}>
          {MODE_ORDER.map((mode) => (
            <label key={mode} style={modeStyle}>
              <input
                type="radio"
                checked={selectedMode === mode}
                onChange={() => setSelectedMode(mode)}
                className="git-reset-radio"
              />
              <div style={modeTextStyle}>
                <div style={modeNameStyle}>
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </div>
                <div style={modeDescStyle}>{MODE_DESCRIPTIONS[mode]}</div>
              </div>
            </label>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 20px",
            borderTop: "1px solid var(--vscode-widget-border, #3c3c3c)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid var(--vscode-button-border, #3c3c3c)",
              borderRadius: 3,
              color: "var(--vscode-foreground, #cccccc)",
              padding: "6px 16px",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleReset}
            style={{
              background: "var(--vscode-button-background, #0e639c)",
              border: "none",
              borderRadius: 3,
              color: "var(--vscode-button-foreground, #ffffff)",
              padding: "6px 16px",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
