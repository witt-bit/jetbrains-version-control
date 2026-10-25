import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CodiconDebugStop from "~icons/codicon/debug-stop";
import { bridge } from "../../shared/bridge";
import { Tooltip } from "../../shared/components/Tooltip";
import "../../shared/components/Tooltip.css";
import { useCommitStore } from "../../shared/store/commit-store";

/**
 * The emoji-style colored sparkle. The codicon is monochrome (it inherits the
 * CSS `color`), so the AI button carries its own multicolor SVG instead: a
 * gold gradient four-pointed star with a small orange companion.
 */
function SparkleIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="jgc-sparkle-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFE97F" />
          <stop offset="1" stopColor="#FFB300" />
        </linearGradient>
      </defs>
      <path
        d="M7 1 Q7.9 6.1 13 7 Q7.9 7.9 7 13 Q6.1 7.9 1 7 Q6.1 6.1 7 1 Z"
        fill="url(#jgc-sparkle-gold)"
      />
      <path
        d="M12.5 9 Q12.95 11.05 15 11.5 Q12.95 11.95 12.5 14 Q12.05 11.95 10 11.5 Q12.05 11.05 12.5 9 Z"
        fill="#FF8A65"
      />
    </svg>
  );
}

export function CommitMessageArea() {
  const {
    commitMessage,
    setCommitMessage,
    amend,
    setAmend,
    commit,
    loading,
    selectedFiles,
    aiGenerating,
    generateCommitMessage,
    cancelCommitMessage,
    chooseAiModel,
  } = useCommitStore();

  const [showDropdown, setShowDropdown] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [recentMessages, setRecentMessages] = useState<string[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const historyBtnRef = useRef<HTMLSpanElement>(null);
  const historyDropdownRef = useRef<HTMLDivElement>(null);

  const hasSelectedFiles = selectedFiles.size > 0;
  const canCommit =
    commitMessage.trim().length > 0 && hasSelectedFiles && !loading;
  const canGenerate = hasSelectedFiles && !loading;

  const handleGenerate = useCallback(() => {
    if (aiGenerating) {
      void cancelCommitMessage();
    } else {
      void generateCommitMessage();
    }
  }, [aiGenerating, cancelCommitMessage, generateCommitMessage]);

  const handleChooseModel = useCallback(() => {
    void chooseAiModel();
  }, [chooseAiModel]);

  const handleCommit = useCallback(async () => {
    if (!canCommit) return;
    await commit();
  }, [canCommit, commit]);

  const handleCommitAndPush = useCallback(async () => {
    if (!canCommit) return;
    setShowDropdown(false);
    await commit();
    await bridge.request("openPushPanel");
  }, [canCommit, commit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ctrl/Cmd + Enter to commit
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleCommit();
      }
    },
    [handleCommit],
  );

  const handleHistoryClick = useCallback(async () => {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    try {
      const messages = (await bridge.request(
        "getRecentCommitMessages",
      )) as string[];
      setRecentMessages(messages ?? []);
    } catch {
      setRecentMessages([]);
    }
    setShowHistory(true);
  }, [showHistory]);

  const handleSelectMessage = useCallback(
    (msg: string) => {
      setCommitMessage(msg);
      setShowHistory(false);
    },
    [setCommitMessage],
  );

  // Close history dropdown on outside click
  useEffect(() => {
    if (!showHistory) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      // Check if click is inside the dropdown or the button
      if (historyBtnRef.current?.contains(target)) return;
      if (historyDropdownRef.current?.contains(target)) return;
      setShowHistory(false);
    };
    // Use setTimeout to avoid the current click event triggering close immediately
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside, true);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [showHistory]);

  return (
    <div className="commit-message-area">
      <div className="commit-amend-row">
        <label>
          <input
            type="checkbox"
            checked={amend}
            onChange={(e) => setAmend(e.target.checked)}
          />
          Amend
        </label>
        <Tooltip text="Recent commit messages">
          <span
            ref={historyBtnRef}
            onClick={handleHistoryClick}
            style={{
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              borderRadius: 3,
              padding: 2,
              transition: "background 0.15s, opacity 0.15s",
              opacity: showHistory ? 1 : 0.6,
              background: showHistory
                ? "var(--vscode-toolbar-activeBackground, rgba(0,0,0,0.1))"
                : "transparent",
            }}
            onMouseEnter={(e) => {
              if (!showHistory)
                (e.currentTarget as HTMLElement).style.opacity = "1";
            }}
            onMouseLeave={(e) => {
              if (!showHistory)
                (e.currentTarget as HTMLElement).style.opacity = "0.6";
            }}
            onMouseDown={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "var(--vscode-toolbar-activeBackground, rgba(0,0,0,0.15))";
            }}
            onMouseUp={(e) => {
              (e.currentTarget as HTMLElement).style.background = showHistory
                ? "var(--vscode-toolbar-activeBackground, rgba(0,0,0,0.1))"
                : "transparent";
            }}
          >
            <HistoryIcon />
          </span>
        </Tooltip>
        <Tooltip text="Generate commit message with AI" delay={400}>
          <button
            type="button"
            className="commit-btn commit-ai-btn"
            disabled={!canGenerate}
            onClick={handleGenerate}
          >
            {aiGenerating ? <CodiconDebugStop /> : <SparkleIcon />}
          </button>
        </Tooltip>
        <Tooltip text="Choose AI model" delay={400}>
          <button
            type="button"
            className="commit-btn commit-ai-btn commit-ai-model-btn"
            onClick={handleChooseModel}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="4,6 8,10 12,6" />
            </svg>
          </button>
        </Tooltip>
        {showHistory &&
          createPortal(
            <HistoryDropdown
              ref={historyDropdownRef}
              anchorRef={historyBtnRef}
              messages={recentMessages}
              onSelect={handleSelectMessage}
              onClose={() => setShowHistory(false)}
            />,
            document.body,
          )}
      </div>

      <textarea
        className="commit-message-textarea"
        placeholder="Commit message (Ctrl+Enter to commit)"
        value={commitMessage}
        onChange={(e) => setCommitMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={3}
      />

      <div className="commit-buttons">
        <button
          type="button"
          className="commit-btn commit-btn-primary"
          disabled={!canCommit}
          onClick={handleCommit}
        >
          Commit
        </button>

        <div className="commit-dropdown" ref={dropdownRef}>
          <button
            type="button"
            className="commit-btn commit-btn-secondary commit-split-main"
            disabled={!canCommit}
            onClick={handleCommitAndPush}
          >
            Commit and Push...
          </button>
          <button
            type="button"
            className="commit-btn commit-btn-secondary commit-split-arrow"
            disabled={!canCommit}
            onClick={() => setShowDropdown(!showDropdown)}
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
          {showDropdown && (
            <div className="commit-dropdown-menu">
              <button
                type="button"
                className="commit-dropdown-item"
                onClick={handleCommitAndPush}
              >
                Commit and Push
              </button>
              <div className="commit-dropdown-separator" />
              <button
                type="button"
                className="commit-dropdown-item"
                onClick={() => {
                  setShowDropdown(false);
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface HistoryDropdownProps {
  anchorRef: React.RefObject<HTMLSpanElement | null>;
  messages: string[];
  onSelect: (msg: string) => void;
  onClose: () => void;
}

const HistoryDropdown = React.forwardRef<HTMLDivElement, HistoryDropdownProps>(
  ({ anchorRef, messages, onSelect, onClose }, ref) => {
    const innerRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ bottom: number; left: number } | null>(
      null,
    );

    // Combine forwarded ref and inner ref
    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        (innerRef as React.MutableRefObject<HTMLDivElement | null>).current =
          node;
        if (typeof ref === "function") ref(node);
        else if (ref)
          (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      },
      [ref],
    );

    useEffect(() => {
      if (anchorRef.current) {
        const rect = anchorRef.current.getBoundingClientRect();
        // Position above the button, align right edge to viewport
        const bottom = window.innerHeight - rect.top + 4;
        const left = Math.min(rect.left, window.innerWidth - 8);
        setPos({ bottom, left });
      }
    }, [anchorRef]);

    useEffect(() => {
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }, [onClose]);

    if (!pos) return null;

    return (
      <div
        ref={setRefs}
        style={{
          position: "fixed",
          bottom: pos.bottom,
          left: 4,
          right: 4,
          zIndex: 99999,
          background: "var(--vscode-menu-background, #1e1e1e)",
          border: "1px solid var(--vscode-menu-border, #454545)",
          borderRadius: 4,
          padding: "4px 0",
          maxHeight: 250,
          overflowY: "auto",
          boxShadow: "0 -3px 12px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              padding: "8px 12px",
              opacity: 0.5,
              fontSize: 12,
            }}
          >
            No recent commit messages
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={`${i}-${msg}`}
              onClick={() => onSelect(msg)}
              style={{
                padding: "6px 12px",
                cursor: "pointer",
                fontSize: 12,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "var(--vscode-menu-foreground, #ccc)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "var(--vscode-list-hoverBackground, #2a2d2e)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "transparent";
              }}
              title={msg}
            >
              {msg}
            </div>
          ))
        )}
      </div>
    );
  },
);

function HistoryIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
      style={{ opacity: 0.5 }}
    >
      <path d="M13.507 12.324a7 7 0 0 0 .065-8.56A7 7 0 0 0 2 4.393V2H1v3.5l.5.5H5V5H2.811a6.008 6.008 0 1 1-.135 5.77l-.887.462a7 7 0 0 0 11.718 1.092zM8 4v4.5l.5.5H12v-1H9V4H8z" />
    </svg>
  );
}
