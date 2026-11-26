import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import CodiconCaseSensitive from "~icons/codicon/case-sensitive";
import CodiconFile from "~icons/codicon/file";
import CodiconFolderOpened from "~icons/codicon/folder-opened";
import CodiconRegex from "~icons/codicon/regex";
import CodiconTarget from "~icons/codicon/target";
import { bridge, reportActionError } from "../../shared/bridge";
import { Tooltip } from "../../shared/components/Tooltip";
import { usePlatform } from "../../shared/hooks/usePlatform";
import "../../shared/components/Tooltip.css";
import {
  isAbsolutePath,
  isRegexFilterInvalid,
  toRepoRelativePath,
} from "../../shared/store/log-filter";
import { usePanelStore } from "../../shared/store/panel-store";
import {
  isFocusTextFilterKey,
  isGoToRefKey,
  useFocusTextFilterShortcutLabel,
  useGoToRefShortcutLabel,
} from "../logShortcuts";

const INPUT_BORDER = "var(--vscode-input-border, #3c3c3c)";
const INPUT_FOCUS_BORDER = "#3574f0";
const INVALID_BORDER = "var(--vscode-inputValidation-errorBorder, #be1100)";

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "4px 8px",
  fontSize: "12px",
  border: `1px solid ${INPUT_BORDER}`,
  background: "var(--vscode-input-background, #1e1e1e)",
  color: "var(--vscode-input-foreground, #ccc)",
  borderRadius: 3,
  outline: "none",
  boxSizing: "border-box",
};

const toggleStyle = (active: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 20,
  height: 20,
  padding: 0,
  fontSize: 13,
  borderRadius: 3,
  cursor: "pointer",
  border: `1px solid ${active ? "var(--vscode-inputOption-activeBorder, #007acc)" : "transparent"}`,
  background: active
    ? "var(--vscode-inputOption-activeBackground, rgba(0,127,212,0.4))"
    : "transparent",
  color: active
    ? "var(--vscode-inputOption-activeForeground, #fff)"
    : "var(--vscode-foreground)",
  opacity: active ? 1 : 0.7,
});

const popoverButtonStyle = (primary = false): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "3px 10px",
  fontSize: 12,
  borderRadius: 3,
  cursor: "pointer",
  border: primary
    ? "1px solid transparent"
    : "1px solid var(--vscode-button-secondaryBorder, var(--vscode-input-border, #555))",
  background: primary
    ? "var(--vscode-button-background, #0e639c)"
    : "transparent",
  color: primary
    ? "var(--vscode-button-foreground, #fff)"
    : "var(--vscode-foreground)",
});

function focusBorderHandlers(invalid = false) {
  return {
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      e.currentTarget.style.borderColor = invalid
        ? INVALID_BORDER
        : INPUT_FOCUS_BORDER;
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      e.currentTarget.style.borderColor = invalid
        ? INVALID_BORDER
        : INPUT_BORDER;
    },
  };
}

/**
 * The Log header's message filter: a text box with the Match Case and Regex
 * toggles inside it. The text goes to git (`--grep`), so what is listed is the
 * whole history that matches, not just the pages already loaded.
 */
export function LogTextFilter() {
  const searchQuery = usePanelStore((s) => s.filter.searchQuery);
  const matchCase = usePanelStore((s) => s.filter.matchCase);
  const regex = usePanelStore((s) => s.filter.regex);
  const setFilter = usePanelStore((s) => s.setFilter);
  const shortcutLabel = useFocusTextFilterShortcutLabel();

  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The last value this box sent to the store: a different value arriving from
  // the store (Go To lifting the filter, History) is an outside change to show.
  const sentRef = useRef(searchQuery);
  const [value, setValue] = useState(searchQuery);

  useEffect(() => {
    if (searchQuery !== sentRef.current) {
      sentRef.current = searchQuery;
      clearTimeout(timerRef.current);
      setValue(searchQuery);
    }
  }, [searchQuery]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isFocusTextFilterKey(e)) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const send = useCallback(
    (next: string) => {
      clearTimeout(timerRef.current);
      sentRef.current = next;
      setFilter({ searchQuery: next });
    },
    [setFilter],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setValue(next);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => send(next), 300);
  };

  const invalid = isRegexFilterInvalid({ searchQuery: value, regex });
  const focusBorder = focusBorderHandlers(invalid);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        width: 230,
        flexShrink: 0,
      }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        style={{
          position: "absolute",
          left: 7,
          opacity: 0.5,
          pointerEvents: "none",
        }}
      >
        <circle cx="7" cy="7" r="4.5" />
        <line x1="10.5" y1="10.5" x2="14" y2="14" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        placeholder="Message text"
        title={
          invalid
            ? "Invalid regular expression: the list still shows the last valid one"
            : `Filter by commit message (${shortcutLabel})`
        }
        value={value}
        onChange={handleChange}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) send(value);
        }}
        style={{
          ...inputStyle,
          padding: "4px 70px 4px 24px",
          borderColor: invalid ? INVALID_BORDER : INPUT_BORDER,
        }}
        {...focusBorder}
      />
      <div
        style={{
          position: "absolute",
          right: 3,
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        {value && (
          <button
            type="button"
            aria-label="Clear text filter"
            onClick={() => {
              setValue("");
              send("");
            }}
            style={{ ...toggleStyle(false), opacity: 0.6 }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z" />
            </svg>
          </button>
        )}
        <Tooltip text="Match Case">
          <button
            type="button"
            aria-label="Match Case"
            aria-pressed={matchCase}
            onClick={() => setFilter({ matchCase: !matchCase })}
            style={toggleStyle(matchCase)}
          >
            <CodiconCaseSensitive />
          </button>
        </Tooltip>
        <Tooltip text="Regex">
          <button
            type="button"
            aria-label="Regex"
            aria-pressed={regex}
            onClick={() => setFilter({ regex: !regex })}
            style={toggleStyle(regex)}
          >
            <CodiconRegex />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

/**
 * Anchors a small dialog under its trigger. It closes on an outside click and
 * on Escape, but not when the window loses focus: the file picker is a native
 * dialog and would otherwise dismiss the popover that opened it.
 */
function Popover({
  align = "left",
  width,
  onClose,
  children,
}: {
  align?: "left" | "right";
  width: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: "100%",
        [align]: 0,
        marginTop: 4,
        zIndex: 9999,
        width,
        padding: 8,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        background: "var(--vscode-menu-background, #1e1e1e)",
        border: "1px solid var(--vscode-menu-border, #454545)",
        borderRadius: 4,
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
      }}
    >
      {children}
    </div>
  );
}

async function currentWorkspaceRoot(): Promise<string | null> {
  try {
    const result = (await bridge.request("getWorkspaceRoot")) as {
      root?: string | null;
    } | null;
    return result?.root ?? null;
  } catch {
    return null;
  }
}

/**
 * Path filter: limits the log to the commits that touched a file or folder.
 * The field takes a repository-relative path; the buttons pick one from disk.
 */
export function LogPathFilter() {
  const file = usePanelStore((s) => s.filter.file);
  const setFilter = usePanelStore((s) => s.setFilter);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const toggle = () => {
    setDraft(file);
    setError("");
    setOpen((v) => !v);
  };

  const apply = async (input: string) => {
    const relative = toRepoRelativePath(input, await currentWorkspaceRoot());
    if (isAbsolutePath(relative)) {
      setError("The path is outside the repository");
      return;
    }
    setOpen(false);
    setFilter({ file: relative });
  };

  const pick = async (command: "pickFile" | "pickFolder") => {
    try {
      const root = await currentWorkspaceRoot();
      const result = (await bridge.request(command, {
        defaultUri: root ?? undefined,
        title: "Filter log by this path",
      })) as { success: boolean; path?: string };
      if (result.success && result.path) {
        setDraft(toRepoRelativePath(result.path, root));
        setError("");
        inputRef.current?.focus();
      }
    } catch (err) {
      await reportActionError("Pick a path", err);
    }
  };

  const active = !!file;
  return (
    <div style={{ position: "relative" }}>
      <div
        title={active ? `Path filter: ${file}` : "Filter by file or folder"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 2,
          padding: "2px 8px",
          fontSize: "12px",
          cursor: "pointer",
          borderRadius: 3,
          border: "1px solid transparent",
          color: active
            ? "var(--vscode-textLink-foreground, #3794ff)"
            : "var(--description-fg)",
          whiteSpace: "nowrap",
          userSelect: "none",
        }}
      >
        <span onClick={toggle}>
          {active ? (
            `Path: ${file.split("/").pop()}`
          ) : (
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 2 }}
            >
              Path
              <svg
                width="10"
                height="10"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                style={{ opacity: 0.7 }}
              >
                <polyline points="4,6 8,10 12,6" />
              </svg>
            </span>
          )}
        </span>
        {active && (
          <button
            type="button"
            aria-label="Clear path filter"
            onClick={() => {
              setOpen(false);
              setFilter({ file: "" });
            }}
            style={{
              display: "flex",
              alignItems: "center",
              padding: 1,
              border: "none",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
              opacity: 0.7,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z" />
            </svg>
          </button>
        )}
      </div>
      {open && (
        <Popover width={340} onClose={close}>
          <input
            ref={inputRef}
            type="text"
            placeholder="File or folder, e.g. src/git"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                void apply(draft);
              }
            }}
            style={{
              ...inputStyle,
              borderColor: error ? INVALID_BORDER : INPUT_BORDER,
            }}
            {...focusBorderHandlers(!!error)}
          />
          {error && (
            <div
              style={{
                fontSize: 11,
                color: "var(--vscode-errorForeground, #f48771)",
              }}
            >
              {error}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              onClick={() => void pick("pickFile")}
              style={popoverButtonStyle()}
            >
              <CodiconFile /> File…
            </button>
            <button
              type="button"
              onClick={() => void pick("pickFolder")}
              style={popoverButtonStyle()}
            >
              <CodiconFolderOpened /> Folder…
            </button>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => void apply(draft)}
              style={popoverButtonStyle(true)}
            >
              Apply
            </button>
          </div>
        </Popover>
      )}
    </div>
  );
}

/**
 * Go To Hash/Branch/Tag: resolves a hash prefix, branch, tag or any revision
 * and selects that commit in the graph, loading history as far as needed.
 */
export function LogGoToRef() {
  const goToRef = usePanelStore((s) => s.goToRef);
  const platform = usePlatform();
  const shortcutLabel = useGoToRefShortcutLabel();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isGoToRefKey(e, platform)) return;
      e.preventDefault();
      setOpen(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [platform]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [open]);

  const submit = async () => {
    if (busy || query.trim() === "") return;
    setBusy(true);
    try {
      // A failed lookup was already reported; keep the popover for a retry.
      if (await goToRef(query)) {
        setOpen(false);
        setQuery("");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <Tooltip text={`Go to Hash/Branch/Tag (${shortcutLabel})`}>
        <button
          type="button"
          aria-label="Go to Hash/Branch/Tag"
          onClick={() => setOpen((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            padding: 0,
            fontSize: 13,
            border: "none",
            borderRadius: 4,
            background: open
              ? "var(--vscode-toolbar-activeBackground, rgba(90,93,94,0.31))"
              : "transparent",
            color: "var(--vscode-foreground)",
            cursor: "pointer",
            opacity: open ? 1 : 0.6,
          }}
        >
          <CodiconTarget />
        </button>
      </Tooltip>
      {open && (
        <Popover align="right" width={280} onClose={close}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Hash, branch or tag"
            value={query}
            disabled={busy}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                void submit();
              }
            }}
            style={inputStyle}
            {...focusBorderHandlers()}
          />
        </Popover>
      )}
    </div>
  );
}
