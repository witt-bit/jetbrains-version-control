import { useCallback, useEffect, useRef } from "react";
import { IconHelp } from "../../shared/components/icons";

interface ConfirmDialogProps {
  title: string;
  message: string;
  /** Label of the confirm (right) button. Defaults to "Yes". */
  confirmLabel?: string;
  /** Label of the cancel (left) button. Defaults to "No". */
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * IntelliJ-style confirmation dialog: centered title, question-mark icon on
 * the left of the message, No / Yes footer. Used by Remove Remote.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Yes",
  cancelLabel = "No",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onCancel]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) {
        onCancel();
      }
    },
    [onCancel],
  );

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.4)",
        userSelect: "none",
      }}
    >
      <div
        style={{
          background: "var(--vscode-editorWidget-background, #252526)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          width: 440,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Title */}
        <div
          style={{
            padding: "12px 16px 8px 16px",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: "15px", fontWeight: 600 }}>{title}</span>
        </div>

        {/* Message with question-mark icon */}
        <div
          style={{
            padding: "4px 20px 18px 20px",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <span
            style={{
              flexShrink: 0,
              display: "flex",
              color: "var(--vscode-descriptionForeground, #999)",
              marginTop: 1,
            }}
          >
            <IconHelp />
          </span>
          <span
            style={{
              fontSize: "13px",
              lineHeight: 1.5,
              color: "var(--vscode-foreground, #ccc)",
              wordBreak: "break-word",
            }}
          >
            {message}
          </span>
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
            onClick={onCancel}
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
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
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
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
