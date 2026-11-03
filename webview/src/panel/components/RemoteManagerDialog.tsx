import { useCallback, useEffect, useRef, useState } from "react";
import CodiconAdd from "~icons/codicon/add";
import CodiconEdit from "~icons/codicon/edit";
import CodiconTrash from "~icons/codicon/trash";
import { bridge, reportActionError } from "../../shared/bridge";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { Tooltip } from "../../shared/components/Tooltip";
import "../../shared/components/Tooltip.css";

interface RemoteManagerDialogProps {
  onClose: () => void;
}

interface RemoteEntry {
  name: string;
  url: string;
}

/** Shared Add/Edit sub-dialog. mode distinguishes the initial state. */
export function DefineRemoteDialog({
  mode,
  initialName,
  initialUrl,
  onCancel,
  onSubmit,
}: {
  mode: "add" | "edit";
  initialName: string;
  initialUrl: string;
  onCancel: () => void;
  onSubmit: (name: string, url: string, fetchRemote: boolean) => void;
}) {
  const [name, setName] = useState(initialName);
  const [url, setUrl] = useState(initialUrl);
  const [fetchRemote, setFetchRemote] = useState(mode === "add");
  const [error, setError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const canSubmit = name.trim().length > 0 && url.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) {
      setError("Name and URL are required");
      return;
    }
    onSubmit(name.trim(), url.trim(), fetchRemote);
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    background: "var(--vscode-input-background, #3c3c3c)",
    border: "1px solid var(--vscode-input-border, #3c3c3c)",
    borderRadius: 3,
    color: "var(--vscode-input-foreground, #cccccc)",
    padding: "5px 8px",
    fontSize: "13px",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "12px",
    color: "var(--vscode-descriptionForeground, #999)",
    whiteSpace: "nowrap",
    flexShrink: 0,
    width: 60,
    textAlign: "right",
  };

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
          width: 480,
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
          <span style={{ fontSize: "15px", fontWeight: 600 }}>
            Define Remote
          </span>
        </div>

        {/* Form */}
        <div style={{ padding: "8px 20px 16px 20px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <label htmlFor="define-remote-name" style={labelStyle}>
              Name:
            </label>
            <input
              ref={nameInputRef}
              id="define-remote-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              placeholder="origin"
              style={inputStyle}
            />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <label htmlFor="define-remote-url" style={labelStyle}>
              URL:
            </label>
            <input
              id="define-remote-url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              placeholder="https://github.com/user/repo.git"
              style={inputStyle}
            />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={labelStyle} />
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: "12px",
                cursor: "pointer",
                color: "var(--vscode-descriptionForeground, #999)",
              }}
            >
              <input
                type="checkbox"
                checked={fetchRemote}
                onChange={(e) => setFetchRemote(e.target.checked)}
              />
              Fetch Remote
            </label>
          </div>

          {error && (
            <div
              style={{
                marginTop: 10,
                color: "var(--errorForeground)",
                fontSize: "12px",
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 20px 16px",
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
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              background: "var(--vscode-button-background, #0e639c)",
              border: "none",
              borderRadius: 3,
              color: "var(--vscode-button-foreground, #ffffff)",
              padding: "6px 16px",
              cursor: canSubmit ? "pointer" : "default",
              fontSize: "13px",
              opacity: canSubmit ? 1 : 0.5,
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

export function RemoteManagerDialog({ onClose }: RemoteManagerDialogProps) {
  const [remotes, setRemotes] = useState<RemoteEntry[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);
  const [error, setError] = useState<string | null>(null);
  const [defineDialog, setDefineDialog] = useState<{
    mode: "add" | "edit";
    name: string;
    url: string;
  } | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const loadRemotes = useCallback(async () => {
    try {
      const result = (await bridge.request("getRemoteUrls")) as {
        remotes: { name: string; url: string }[];
      };
      const list = result.remotes ?? [];
      setRemotes(list);
      // Keep the selection on a still-existing row after reload;
      // initial load starts with nothing selected.
      setSelectedIdx((prev) => (prev >= 0 && prev < list.length ? prev : -1));
    } catch (err) {
      await reportActionError("Failed to load remotes", err);
    }
  }, []);

  useEffect(() => {
    void loadRemotes();
  }, [loadRemotes]);

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

  const hasSelection = selectedIdx >= 0 && selectedIdx < remotes.length;

  const openAdd = () => {
    setError(null);
    setDefineDialog({ mode: "add", name: "", url: "" });
  };

  const openEdit = () => {
    setError(null);
    if (!hasSelection) return;
    const remote = remotes[selectedIdx];
    setDefineDialog({ mode: "edit", name: remote.name, url: remote.url });
  };

  const handleDefineSubmit = async (
    name: string,
    url: string,
    fetchRemote: boolean,
  ) => {
    const editing = defineDialog?.mode === "edit";
    const oldName = defineDialog?.name ?? "";
    setDefineDialog(null);
    try {
      if (editing) {
        if (name !== oldName) {
          await bridge.request("renameRemote", { oldName, newName: name });
        }
        if (url !== (remotes.find((r) => r.name === oldName)?.url ?? "")) {
          await bridge.request("setRemoteUrl", { name, url });
        }
      } else {
        await bridge.request("addRemote", { name, url });
      }
      if (fetchRemote) {
        await bridge.request("fetchAll");
      }
      void loadRemotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const [pendingRemove, setPendingRemove] = useState<RemoteEntry | null>(null);

  /** Open the same confirmation dialog the remote folder menu uses. */
  const handleRemove = () => {
    setError(null);
    if (!hasSelection) return;
    setPendingRemove(remotes[selectedIdx] ?? null);
  };

  const confirmRemove = async () => {
    const remote = pendingRemove;
    setPendingRemove(null);
    if (!remote) return;
    try {
      await bridge.request("removeRemote", { name: remote.name });
      setSelectedIdx(-1);
      void loadRemotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

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
        userSelect: "none",
      }}
    >
      <div
        style={{
          background: "var(--vscode-editorWidget-background, #252526)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          width: 640,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          userSelect: "none",
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
          <span
            style={{
              fontSize: "15px",
              fontWeight: 600,
            }}
          >
            Git Remotes
          </span>
        </div>

        {/* Action bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 16px 8px 16px",
          }}
        >
          <Tooltip text="Add" delay={200}>
            <button type="button" onClick={openAdd} style={iconButtonStyle}>
              <CodiconAdd />
            </button>
          </Tooltip>
          <Tooltip text="Remove" delay={200}>
            <button
              type="button"
              onClick={handleRemove}
              style={iconButtonStyle}
              disabled={!hasSelection}
            >
              <CodiconTrash />
            </button>
          </Tooltip>
          <Tooltip text="Edit" delay={200}>
            <button
              type="button"
              onClick={openEdit}
              style={iconButtonStyle}
              disabled={!hasSelection}
            >
              <CodiconEdit />
            </button>
          </Tooltip>
        </div>

        {/* Column headers */}
        {remotes.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "4px 16px",
              borderBottom: "1px solid var(--border)",
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--descriptionForeground)",
            }}
          >
            <span style={{ flex: "0 0 120px" }}>Name</span>
            <span style={{ flex: 1 }}>URL</span>
          </div>
        )}

        {/* Remote list */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px 0",
          }}
        >
          {remotes.length === 0 ? (
            <div
              style={{
                padding: "24px 16px",
                textAlign: "center",
                color: "var(--descriptionForeground)",
                fontSize: "13px",
              }}
            >
              No remotes configured
            </div>
          ) : (
            remotes.map((remote, idx) => (
              <div
                key={remote.name}
                className={`selectable-row${selectedIdx === idx ? " row-selected" : ""}`}
                onClick={() => setSelectedIdx(idx)}
                onDoubleClick={() => {
                  setSelectedIdx(idx);
                  void openEdit();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 16px",
                }}
              >
                <span
                  style={{
                    flex: "0 0 120px",
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {remote.name}
                </span>
                <span
                  style={{
                    flex: 1,
                    color: "var(--descriptionForeground)",
                    fontSize: "12px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {remote.url}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Define Remote (Add/Edit) sub-dialog */}
        {defineDialog && (
          <DefineRemoteDialog
            mode={defineDialog.mode}
            initialName={defineDialog.name}
            initialUrl={defineDialog.url}
            onCancel={() => setDefineDialog(null)}
            onSubmit={handleDefineSubmit}
          />
        )}

        {error && (
          <div
            style={{
              padding: "8px 16px",
              color: "var(--errorForeground)",
              fontSize: "12px",
              borderTop: "1px solid var(--border)",
            }}
          >
            {error}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 16px",
            borderTop: "1px solid var(--border)",
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
            onClick={onClose}
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
            OK
          </button>
        </div>
      </div>
      {pendingRemove && (
        <ConfirmDialog
          title="Remove Remote"
          message={`Remove remote ${pendingRemove.name} '${pendingRemove.url}'?`}
          confirmLabel="Yes"
          cancelLabel="No"
          onConfirm={() => {
            void confirmRemove();
          }}
          onCancel={() => setPendingRemove(null)}
        />
      )}
    </div>
  );
}

const iconButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  padding: 0,
  background: "transparent",
  border: "none",
  borderRadius: 4,
  color: "var(--vscode-foreground)",
  cursor: "pointer",
  fontSize: 13,
};
