import { useCallback, useEffect, useRef, useState } from "react";
import { bridge, reportActionError } from "../../shared/bridge";

export interface PushDialogProps {
  branchName: string;
  onClose: () => void;
  onPush: (force: boolean) => void;
}

export function PushDialog({ branchName, onClose, onPush }: PushDialogProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [isProtected, setIsProtected] = useState(false);

  useEffect(() => {
    let stale = false;
    bridge
      .request("getProtectedBranches", { names: [branchName] })
      .then((result) => {
        const names = (result as { protectedNames?: string[] } | null)
          ?.protectedNames;
        if (!stale) setIsProtected((names ?? []).length > 0);
      })
      .catch((err) => reportActionError("Read protected branches", err));
    return () => {
      stale = true;
    };
  }, [branchName]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.4)",
      }}
    >
      <div
        style={{
          background: "var(--vscode-editorWidget-background, #252526)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "16px 20px",
          minWidth: 340,
          maxWidth: 460,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        {/* Title */}
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 12,
            color: "var(--app-fg)",
          }}
        >
          Push Branch
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: 12,
            color: "var(--description-fg)",
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        >
          Push branch '{branchName}' to its remote.
          {isProtected && " This is a protected branch: force push is refused."}
        </div>

        {/* Buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={() => onPush(true)}
            disabled={isProtected}
            title={
              isProtected ? `"${branchName}" is a protected branch` : undefined
            }
            style={{
              background: "transparent",
              color: "var(--vscode-errorForeground, #f48771)",
              border: "1px solid var(--vscode-errorForeground, #f48771)",
              borderRadius: 4,
              padding: "4px 14px",
              fontSize: 12,
              height: 28,
              cursor: isProtected ? "not-allowed" : "pointer",
              opacity: isProtected ? 0.5 : 1,
              fontWeight: 500,
            }}
          >
            Force Push
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "var(--vscode-button-secondaryBackground, #3a3d41)",
              color: "var(--vscode-button-secondaryForeground, var(--app-fg))",
              border: "none",
              borderRadius: 4,
              padding: "4px 14px",
              fontSize: 12,
              height: 28,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onPush(false)}
            style={{
              background: "var(--button-bg)",
              color: "var(--button-fg)",
              border: "none",
              borderRadius: 4,
              padding: "4px 14px",
              fontSize: 12,
              height: 28,
              cursor: "pointer",
            }}
          >
            Push
          </button>
        </div>
      </div>
    </div>
  );
}
