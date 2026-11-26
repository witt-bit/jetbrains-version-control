import { useEffect, useState } from "react";
import CodiconArrowDown from "~icons/codicon/arrow-down";
import CodiconArrowUp from "~icons/codicon/arrow-up";
import {
  bridge,
  bridgeWithProgress,
  reportActionError,
} from "../../shared/bridge";
import { useDialogDrag } from "../../shared/hooks/useDialogDrag";
import type { Commit } from "../../shared/types/git";
import {
  ACTION_LABELS,
  DEFAULT_REBASE_OPTIONS,
  describeCommand,
  isUnchanged,
  messageOf,
  moveRow,
  REBASE_ACTIONS,
  type RebaseAction,
  type RebaseCommitInfo,
  type RebaseOptions,
  type RebaseRow,
  setAction,
  setMessage,
  toRows,
  toTodoEntries,
  validateRows,
} from "../rebaseDialogLogic";
import "./InteractiveRebaseDialog.css";
import { useDialogChrome } from "./useDialogChrome";

interface InteractiveRebaseDialogProps {
  /** The oldest commit to rewrite; the rebase starts at its parent. */
  commit: Commit;
  onClose: () => void;
}

interface LoadedCommits {
  commits: RebaseCommitInfo[];
  hasMerges: boolean;
}

function isLoadedCommits(value: unknown): value is LoadedCommits {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as LoadedCommits).commits)
  );
}

export function InteractiveRebaseDialog({
  commit,
  onClose,
}: InteractiveRebaseDialogProps) {
  const root = commit.parents.length === 0;
  const base = commit.parents[0] ?? "";
  const [loaded, setLoaded] = useState<LoadedCommits | null>(null);
  const [rows, setRows] = useState<RebaseRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [options, setOptions] = useState<RebaseOptions>(DEFAULT_REBASE_OPTIONS);
  const drag = useDialogDrag();
  useDialogChrome(onClose);

  // Autosquash rearranges the list, so flipping it reloads the rows.
  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    setLoadError(null);
    bridge
      .request("getRebaseCommits", {
        base,
        root,
        autosquash: options.autosquash,
      })
      .then((result) => {
        if (cancelled) return;
        if (!isLoadedCommits(result)) {
          setLoadError("Could not read the commits to rebase.");
          return;
        }
        setLoaded(result);
        setRows(toRows(result.commits));
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [base, root, options.autosquash]);

  // A range with merge commits can only be replayed by recreating them: any
  // edited list would flatten them.
  const rebaseMerges = options.rebaseMerges || (loaded?.hasMerges ?? false);
  const listLocked = rebaseMerges;
  // The log also shows other branches; only a commit that is part of the
  // current branch is in the range that gets replayed.
  const notOnBranch =
    loaded !== null &&
    !loaded.hasMerges &&
    !loaded.commits.some((c) => c.hash === commit.hash);
  const problem = notOnBranch
    ? "This commit is not part of the current branch."
    : listLocked
      ? null
      : validateRows(rows);
  const canStart = loaded !== null && problem === null;

  const setOption = <K extends keyof RebaseOptions>(
    key: K,
    value: RebaseOptions[K],
  ) => setOptions((current) => ({ ...current, [key]: value }));

  const handleStart = () => {
    if (!loaded || !canStart) return;
    // An untouched list is left to git, which builds the same todo itself.
    const send = !listLocked && !isUnchanged(rows, loaded.commits);
    const payload: Record<string, unknown> = {
      ...(root ? { root: true } : { base }),
      autosquash: options.autosquash,
      keepEmpty: options.keepEmpty,
      updateRefs: options.updateRefs,
      rebaseMerges,
    };
    if (options.onto.trim()) payload.onto = options.onto.trim();
    if (send) payload.entries = toTodoEntries(rows);
    onClose();
    // The dialog is gone by the time git answers; a failure has to reach the
    // user as a notification. A rebase that stops on a conflict is not a
    // failure: the host reports it and the Commit panel offers continue/abort.
    void bridgeWithProgress("interactiveRebase", payload).catch((err) =>
      reportActionError("Interactive rebase", err),
    );
  };

  return (
    <div className="irb-overlay">
      <div
        ref={drag.ref}
        className="irb-dialog"
        style={drag.style}
        {...drag.handlers}
      >
        <div className="irb-title">Interactively Rebase from Here</div>
        <div className="irb-subtitle">
          {commit.shortHash} "{commit.subject}" and everything after it
        </div>

        <div className="irb-body">
          {loadError && <div className="irb-error">{loadError}</div>}
          {!loadError && !loaded && (
            <div className="irb-note">Loading commits…</div>
          )}
          {loaded && (
            <>
              {loaded.hasMerges && (
                <div className="irb-note">
                  This range contains merge commits, so it can only be rebased
                  with “Rebase merges”. The list is shown for reference.
                </div>
              )}
              <div className="irb-note">
                Newest commit first. Git replays the list from the bottom up.
              </div>
              <div
                className="irb-list"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {rows.map((row, index) => (
                  <CommitRow
                    key={row.hash}
                    row={row}
                    locked={listLocked}
                    canMoveUp={index > 0}
                    canMoveDown={index < rows.length - 1}
                    onAction={(action) =>
                      setRows((current) => setAction(current, index, action))
                    }
                    onMove={(delta) =>
                      setRows((current) => moveRow(current, index, delta))
                    }
                    onMessage={(text) =>
                      setRows((current) => setMessage(current, index, text))
                    }
                  />
                ))}
              </div>
            </>
          )}

          <div className="irb-field">
            <label htmlFor="irb-onto">Onto:</label>
            <input
              id="irb-onto"
              type="text"
              value={options.onto}
              placeholder="Optional: branch or commit to move the commits onto"
              onChange={(e) => setOption("onto", e.target.value)}
            />
          </div>

          <div className="irb-options">
            <Option
              checked={options.autosquash}
              onChange={(v) => setOption("autosquash", v)}
              title="Move fixup! and squash! commits next to their target. Reloads the list and discards edits."
            >
              Autosquash
            </Option>
            <Option
              checked={options.keepEmpty}
              onChange={(v) => setOption("keepEmpty", v)}
              title="Keep commits that start out empty"
            >
              Keep empty commits
            </Option>
            <Option
              checked={options.updateRefs}
              onChange={(v) => setOption("updateRefs", v)}
              title="Also move branches that point into the rebased commits"
            >
              Update branches pointing into the range
            </Option>
            <Option
              checked={rebaseMerges}
              disabled={loaded?.hasMerges ?? false}
              onChange={(v) => setOption("rebaseMerges", v)}
              title="Recreate merge commits instead of flattening them. The list becomes read-only."
            >
              Rebase merges
            </Option>
          </div>

          <div className="irb-field">
            <label>Command:</label>
            <div className="irb-command" style={{ flex: 1 }}>
              {describeCommand(
                { ...options, rebaseMerges },
                root ? { root: true } : { ref: base.slice(0, 8) },
              )}
            </div>
          </div>

          {problem && <div className="irb-error">{problem}</div>}
        </div>

        <div className="irb-footer">
          <button type="button" className="irb-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="irb-btn-primary"
            disabled={!canStart}
            onClick={handleStart}
          >
            Rebase
          </button>
        </div>
      </div>
    </div>
  );
}

interface CommitRowProps {
  row: RebaseRow;
  locked: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onAction: (action: RebaseAction) => void;
  onMove: (delta: -1 | 1) => void;
  onMessage: (text: string) => void;
}

function CommitRow({
  row,
  locked,
  canMoveUp,
  canMoveDown,
  onAction,
  onMove,
  onMessage,
}: CommitRowProps) {
  const meld = row.action === "squash" || row.action === "fixup";
  const className = [
    "irb-row",
    row.action === "drop" ? "irb-dropped" : "",
    meld ? "irb-meld" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={className}>
      <div className="irb-row-main">
        <select
          className="irb-action"
          value={row.action}
          disabled={locked}
          aria-label={`Action for ${row.shortHash}`}
          onChange={(e) => onAction(e.target.value as RebaseAction)}
        >
          {REBASE_ACTIONS.map((action) => (
            <option key={action} value={action}>
              {ACTION_LABELS[action]}
            </option>
          ))}
        </select>
        <span className="irb-hash">{row.shortHash}</span>
        <span className="irb-subject" title={row.subject}>
          {row.subject}
        </span>
        <span className="irb-move">
          <button
            type="button"
            className="irb-icon-btn"
            title="Move up"
            aria-label="Move up"
            disabled={locked || !canMoveUp}
            onClick={() => onMove(-1)}
          >
            <CodiconArrowUp />
          </button>
          <button
            type="button"
            className="irb-icon-btn"
            title="Move down"
            aria-label="Move down"
            disabled={locked || !canMoveDown}
            onClick={() => onMove(1)}
          >
            <CodiconArrowDown />
          </button>
        </span>
      </div>
      {row.action === "reword" && !locked && (
        <textarea
          className="irb-message inline"
          value={messageOf(row)}
          aria-label={`New message for ${row.shortHash}`}
          onChange={(e) => onMessage(e.target.value)}
        />
      )}
    </div>
  );
}

function Option({
  checked,
  disabled,
  title,
  onChange,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  title: string;
  onChange: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className={`irb-option${disabled ? " disabled" : ""}`} title={title}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {children}
    </label>
  );
}
