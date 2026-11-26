import { Allotment } from "allotment";
import { useCallback, useEffect, useRef, useState } from "react";
import CodiconListFlat from "~icons/codicon/list-flat";
import CodiconListTree from "~icons/codicon/list-tree";
import { bridge, reportActionError } from "../shared/bridge";
import { CommitInfo } from "../shared/components/CommitInfo";
import { FileTree } from "../shared/components/FileTree";
import type { Commit, DiffFile } from "../shared/types/git";
import { RemoteBranchSelector } from "./components/RemoteBranchSelector";
import { useDraggableDivider } from "./hooks/useDraggableDivider";
import { formatRemoteBranchLabel } from "./utils/branchUtils";
import "./push.css";

interface PushRejectedState {
  show: boolean;
  kind: string;
  canIntegrate: boolean;
}

const NO_REJECTION: PushRejectedState = {
  show: false,
  kind: "",
  canIntegrate: true,
};

interface PushResult {
  success?: boolean;
  cancelled?: boolean;
  data?: {
    output?: string;
    isUpToDate?: boolean;
    setUpstream?: boolean;
    integrated?: "merge" | "rebase";
    forced?: boolean;
  };
  rejected?: { kind: string; canIntegrate: boolean };
}

interface PushOptions {
  force?: boolean;
  rejectedAction?: "merge" | "rebase";
  remember?: boolean;
}

function rejectionMessage(branchName: string, state: PushRejectedState) {
  if (!state.canIntegrate) {
    return `Push of "${branchName}" was rejected. It is not the checked-out branch, so it cannot be merged or rebased from here. Check it out first, or force push with lease.`;
  }
  return `Push of the current branch "${branchName}" was rejected. Remote changes need to be merged before pushing.`;
}

function PushRejectedDialog({
  branchName,
  state,
  forceBlocked,
  onRebase,
  onMerge,
  onForce,
  onCancel,
}: {
  branchName: string;
  state: PushRejectedState;
  forceBlocked: boolean;
  onRebase: (remember: boolean) => void;
  onMerge: (remember: boolean) => void;
  onForce: () => void;
  onCancel: () => void;
}) {
  const [remember, setRemember] = useState(false);
  return (
    <div className="push-rejected-overlay">
      <div className="push-rejected-dialog">
        <div className="push-rejected-header">
          <span className="push-rejected-icon">⚠️</span>
          <span className="push-rejected-title">Push Rejected</span>
        </div>
        <p className="push-rejected-message">
          {rejectionMessage(branchName, state)}
        </p>
        {state.canIntegrate && (
          <label className="push-rejected-remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember my choice (Merge or Rebase)
          </label>
        )}
        <div className="push-rejected-actions">
          <button
            type="button"
            className="push-btn push-btn-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="push-btn push-btn-secondary"
            onClick={onForce}
            disabled={forceBlocked}
            title={
              forceBlocked
                ? "Force push is refused for protected branches"
                : "Overwrite the remote branch, unless it changed since your last fetch"
            }
          >
            Force with lease
          </button>
          <button
            type="button"
            className="push-btn push-btn-rebase"
            onClick={() => onRebase(remember)}
            disabled={!state.canIntegrate}
          >
            Rebase
          </button>
          <button
            type="button"
            className="push-btn push-btn-merge"
            onClick={() => onMerge(remember)}
            disabled={!state.canIntegrate}
          >
            Merge
          </button>
        </div>
      </div>
    </div>
  );
}

export function PushApp() {
  const root = document.getElementById("root");
  const branchName = root?.dataset.branch ?? "";
  const remoteName = root?.dataset.remote ?? "origin";

  const [commits, setCommits] = useState<Commit[]>([]);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [files, setFiles] = useState<DiffFile[]>([]);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPushMenu, setShowPushMenu] = useState(false);
  const [pushRejected, setPushRejected] =
    useState<PushRejectedState>(NO_REJECTION);
  const [targetProtected, setTargetProtected] = useState(false);

  // Editable remote branch target state
  const [targetRemote, setTargetRemote] = useState(remoteName);
  const [targetBranch, setTargetBranch] = useState(branchName);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"tree" | "flat">("tree");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { leftWidthPercent, isDragging, dividerProps } =
    useDraggableDivider(bodyRef);

  useEffect(() => {
    async function load() {
      try {
        const result = (await bridge.request("getAheadCommits", {
          branchName,
          remote: targetRemote,
        })) as { commits: Commit[] } | null;
        const list = result?.commits ?? [];
        setCommits(list);
        if (list.length > 0) {
          setSelectedHash(list[0].hash);
        }
      } catch (err) {
        await reportActionError("Failed to load ahead commits", err);
      }
    }
    load();
  }, [branchName, targetRemote]);

  useEffect(() => {
    let stale = false;
    async function load() {
      try {
        const result = (await bridge.request("getProtectedBranches", {
          names: [targetBranch],
        })) as { protectedNames?: string[] } | null;
        if (!stale)
          setTargetProtected((result?.protectedNames ?? []).length > 0);
      } catch (err) {
        await reportActionError("Failed to read protected branches", err);
      }
    }
    load();
    return () => {
      stale = true;
    };
  }, [targetBranch]);

  useEffect(() => {
    if (!selectedHash) {
      setFiles([]);
      return;
    }
    async function load() {
      try {
        const result = (await bridge.request("getCommitRangeFiles", {
          hashes: [selectedHash],
        })) as DiffFile[] | null;
        setFiles(result ?? []);
      } catch (err) {
        await reportActionError("Failed to load commit files", err);
      }
    }
    load();
  }, [selectedHash]);

  const runPush = useCallback(
    async (options: PushOptions = {}) => {
      setPushRejected(NO_REJECTION);
      setPushing(true);
      setError(null);
      try {
        const result = (await bridge.request("executePush", {
          branchName,
          remote: targetRemote,
          targetBranch: targetBranch,
          force: options.force ?? false,
          rejectedAction: options.rejectedAction,
          remember: options.remember,
        })) as PushResult;
        setPushing(false);
        if (result?.rejected) {
          setPushRejected({ show: true, ...result.rejected });
          return;
        }
        if (!result?.data) return;
        const { isUpToDate, integrated, forced, setUpstream } = result.data;
        const destination = `${targetRemote}/${targetBranch}`;
        let message: string;
        if (isUpToDate) {
          message = "Everything is up to date";
        } else if (integrated) {
          message = `${integrated === "rebase" ? "Rebased" : "Merged"} and pushed to ${destination}`;
        } else if (forced) {
          message = `Force pushed to ${destination}`;
        } else {
          message = `Pushed ${commits.length} commit${commits.length !== 1 ? "s" : ""} to ${destination}`;
        }
        if (setUpstream) message += " (upstream set)";
        // Show VS Code native notification then close
        bridge.request("showInfoNotification", { message }).catch(() => {});
        setTimeout(() => {
          bridge.request("closePushPanel");
        }, 500);
      } catch (err) {
        setPushing(false);
        setError(err instanceof Error ? err.message : String(err));
        await reportActionError("Push", err);
      }
    },
    [branchName, targetRemote, targetBranch, commits.length],
  );

  const handlePush = useCallback(
    (force = false) => runPush({ force }),
    [runPush],
  );

  // Never remembered, never silent: always behind an explicit confirmation.
  const handleForceWithLease = useCallback(async () => {
    try {
      const result = (await bridge.request("showConfirmMessage", {
        message: `Force push "${branchName}" to ${targetRemote}/${targetBranch} with lease? This overwrites commits on the remote that you do not have locally. It is refused if the remote changed since your last fetch.`,
        confirmLabel: "Force Push",
      })) as { confirmed?: boolean };
      if (result?.confirmed) await runPush({ force: true });
    } catch (err) {
      await reportActionError("Force push", err);
    }
  }, [branchName, targetRemote, targetBranch, runPush]);

  const handleBranchSelect = useCallback((branch: string) => {
    setTargetBranch(branch);
    setSelectorOpen(false);
  }, []);

  const handleRemoteSelect = useCallback((remote: string) => {
    setTargetRemote(remote);
  }, []);

  const handleSelectorClose = useCallback(() => {
    setSelectorOpen(false);
  }, []);

  const handleLabelClick = useCallback(() => {
    setSelectorOpen((prev) => !prev);
  }, []);

  const selectedCommit = commits.find((c) => c.hash === selectedHash);

  return (
    <div className="push-container">
      {/* Header */}
      <div className="push-header" ref={headerRef}>
        <span className="push-route">
          {branchName} →{" "}
          <span
            className="push-route-target push-route-target--interactive"
            onClick={handleLabelClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleLabelClick();
              }
            }}
          >
            {formatRemoteBranchLabel(targetRemote, targetBranch)}
            <svg
              className="push-route-target__indicator"
              width="10"
              height="10"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="4,6 8,10 12,6" />
            </svg>
          </span>
        </span>
        {selectorOpen && (
          <RemoteBranchSelector
            currentRemote={targetRemote}
            currentBranch={targetBranch}
            onRemoteChange={handleRemoteSelect}
            onBranchChange={handleBranchSelect}
            onClose={handleSelectorClose}
          />
        )}
      </div>

      {/* Main content */}
      <div className="push-body" ref={bodyRef}>
        {/* Left: commit list */}
        <div className="push-commits" style={{ width: `${leftWidthPercent}%` }}>
          {commits.length === 0 ? (
            <div className="push-empty">No commits to push</div>
          ) : (
            commits.map((c) => (
              <div
                key={c.hash}
                className={`push-commit-item${selectedHash === c.hash ? " selected" : ""}`}
                onClick={() => setSelectedHash(c.hash)}
              >
                <span className="push-commit-subject">{c.subject}</span>
              </div>
            ))
          )}
        </div>

        {/* Draggable divider */}
        <div
          className={`push-divider${isDragging ? " push-divider--dragging" : ""}`}
          {...dividerProps}
        />

        {/* Right: file list + commit detail (reusing git log's layout) */}
        <div className="push-detail">
          {selectedCommit && (
            <Allotment vertical>
              <Allotment.Pane minSize={60} preferredSize="40%">
                <div
                  style={{
                    height: "100%",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    style={{
                      padding: "6px 12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: "0.8em",
                        opacity: 0.6,
                        textTransform: "uppercase",
                      }}
                    >
                      {files.length} file{files.length !== 1 ? "s" : ""}
                    </span>
                    <span style={{ display: "flex", gap: 2 }}>
                      <button
                        type="button"
                        onClick={() => setViewMode("tree")}
                        style={{
                          background:
                            viewMode === "tree"
                              ? "var(--selected-bg)"
                              : "transparent",
                          border: "none",
                          borderRadius: 3,
                          cursor: "pointer",
                          padding: "2px 4px",
                          display: "flex",
                          alignItems: "center",
                          color: "inherit",
                        }}
                        title="Tree View"
                      >
                        <CodiconListTree />
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("flat")}
                        style={{
                          background:
                            viewMode === "flat"
                              ? "var(--selected-bg)"
                              : "transparent",
                          border: "none",
                          borderRadius: 3,
                          cursor: "pointer",
                          padding: "2px 4px",
                          display: "flex",
                          alignItems: "center",
                          color: "inherit",
                        }}
                        title="Flat List"
                      >
                        <CodiconListFlat />
                      </button>
                    </span>
                  </div>
                  <div
                    style={{ flex: 1, overflow: "auto", overflowX: "hidden" }}
                  >
                    <FileTree
                      files={files}
                      viewMode={viewMode}
                      selectedFiles={[]}
                      onFileClick={(_e, file) => {
                        if (selectedHash) {
                          bridge.request("openDiffEditor", {
                            commit: selectedHash,
                            filePath: file.newPath || file.oldPath,
                            file,
                          });
                        }
                      }}
                      collapsed={collapsed}
                      onToggle={(key) =>
                        setCollapsed((prev) => ({
                          ...prev,
                          [key]: !prev[key],
                        }))
                      }
                    />
                  </div>
                </div>
              </Allotment.Pane>
              <Allotment.Pane minSize={60}>
                <div style={{ height: "100%", overflow: "auto", padding: 12 }}>
                  <CommitInfo commit={selectedCommit} />
                </div>
              </Allotment.Pane>
            </Allotment>
          )}
          {!selectedCommit && (
            <div style={{ padding: 12, opacity: 0.5 }}>No commits selected</div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="push-footer">
        {error && <span className="push-error">{error}</span>}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="push-btn push-btn-secondary"
          onClick={() => bridge.request("closePushPanel")}
          disabled={pushing}
        >
          Cancel
        </button>
        <div className="push-split-btn">
          <button
            type="button"
            className="push-btn push-btn-primary push-split-main"
            onClick={() => handlePush(false)}
            disabled={pushing || commits.length === 0}
          >
            {pushing ? "Pushing..." : "Push"}
          </button>
          <button
            type="button"
            className="push-btn push-btn-primary push-split-arrow"
            onClick={() => setShowPushMenu(!showPushMenu)}
            disabled={pushing || commits.length === 0}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="4,6 8,10 12,6" />
            </svg>
          </button>
          {showPushMenu && (
            <>
              <div
                className="push-menu-backdrop"
                onClick={() => setShowPushMenu(false)}
              />
              <div className="push-menu">
                <button
                  type="button"
                  className="push-menu-item"
                  disabled={targetProtected}
                  title={
                    targetProtected
                      ? `"${targetBranch}" is a protected branch: force push is refused`
                      : undefined
                  }
                  onClick={() => {
                    setShowPushMenu(false);
                    handlePush(true);
                  }}
                >
                  Force Push
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {pushing && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            zIndex: 10000,
            overflow: "hidden",
            background: "rgba(0, 122, 204, 0.15)",
          }}
        >
          <div
            style={{
              height: "100%",
              width: "40%",
              background:
                "linear-gradient(90deg, transparent, #007acc 30%, #3794ff 70%, transparent)",
              animation: "progress-slide 1s infinite linear",
            }}
          />
          <style>
            {`@keyframes progress-slide {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(250%); }
            }`}
          </style>
        </div>
      )}

      {/* Push Rejected Dialog */}
      {pushRejected.show && (
        <PushRejectedDialog
          branchName={branchName}
          state={pushRejected}
          forceBlocked={targetProtected}
          onRebase={(remember) =>
            runPush({ rejectedAction: "rebase", remember })
          }
          onMerge={(remember) => runPush({ rejectedAction: "merge", remember })}
          onForce={handleForceWithLease}
          onCancel={() => setPushRejected(NO_REJECTION)}
        />
      )}
    </div>
  );
}
