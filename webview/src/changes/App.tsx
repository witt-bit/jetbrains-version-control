import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodiconClose from "~icons/codicon/close";
import { getCommitFileIcon } from "../commit/utils/file-icon";
import { IconFolder, IconFolderOpen } from "../panel/utils/file-icons";
import { bridge, reportActionError } from "../shared/bridge";
import { isChangelistsInfo } from "../shared/changelists";
import {
  ContextMenu,
  ContextMenuHeader,
  ContextMenuItem,
} from "../shared/components/ContextMenu";
import {
  IconChevronDown,
  IconChevronRight,
  IconCollapseAll,
  IconExpandAll,
  IconViewOptions,
} from "../shared/components/icons";
import { Tooltip } from "../shared/components/Tooltip";
import { useSuppressContextMenu } from "../shared/hooks/useSuppressContextMenu";
import type { WorkingTreeFile } from "../shared/store/commit-store";
import type { ChangelistsInfo } from "../shared/types/git";
import { ChangelistRow } from "./ChangelistRow";
import { groupFilesByChangelist } from "./changelistGroups";
import "./changes.css";

/** A changed file plus the workspace folder (IDEA's "module") it belongs to. */
type ChangesFile = WorkingTreeFile & { module?: string };

/** What the view currently knows: a list, or the reason it has none. */
type State =
  | { kind: "loading" }
  | {
      kind: "list";
      baseRef: string | null;
      files: ChangesFile[];
      changelists: ChangelistsInfo | null;
    }
  | { kind: "error"; message: string };

/** The host's reply when the window has no Git repository to work with. */
interface NotGitRepo {
  status: "not_git_repo";
  data: null;
}

function isNotGitRepo(value: unknown): value is NotGitRepo {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { status?: unknown }).status === "not_git_repo"
  );
}

function isChangesPayload(value: unknown): value is {
  baseRef: string | null;
  files: ChangesFile[];
  changelists?: unknown;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { files?: unknown }).files) &&
    "baseRef" in value
  );
}

interface FileNode {
  kind: "file";
  file: ChangesFile;
}

interface DirNode {
  kind: "dir";
  key: string;
  name: string;
  children: TreeNode[];
}

type TreeNode = FileNode | DirNode;

/** A module level of the tree; `label` is empty when modules are not grouped. */
interface Group {
  key: string;
  label: string;
  children: TreeNode[];
}

/** The top level: one per changelist, or a single header-less one when changelists are off. */
interface Section {
  key: string;
  header: { label: string; count: number; active: boolean } | null;
  groups: Group[];
}

/** File-name colours per Git status. The status letter itself is not shown —
 *  the colour already carries it and the column only ate horizontal space. */
const STATUS_COLORS: Record<string, string> = {
  added: "#6a8759",
  untracked: "#d1675a",
  modified: "#6897bb",
  deleted: "#6c6c6c",
  renamed: "#b9b462",
  conflicted: "#d1675a",
};

/**
 * The Changes view: a changed-file tree on the left that opens file diffs in
 * the editor area on the right.
 *
 * Clicking is deliberately asymmetric. A double click opens the diff; a single
 * click only ever *replaces* the tab that double click opened. Both open VS
 * Code preview tabs, so the editor area holds exactly one diff tab no matter
 * how many files are inspected — a single click never creates one, which is
 * why the first inspection has to be a double click.
 */
export function ChangesApp() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [groupByModule, setGroupByModule] = useState(true);
  const [groupByDirectory, setGroupByDirectory] = useState(true);
  const [groupByChangelist, setGroupByChangelist] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const viewButtonRef = useRef<HTMLButtonElement>(null);
  useSuppressContextMenu();

  const load = useCallback(async () => {
    try {
      const result = (await bridge.request("getChangesViewFiles")) as unknown;
      if (isChangesPayload(result)) {
        setState({
          kind: "list",
          baseRef: result.baseRef,
          files: result.files,
          changelists: isChangelistsInfo(result.changelists)
            ? result.changelists
            : null,
        });
      } else if (isNotGitRepo(result)) {
        setState({
          kind: "error",
          message: "No Git repository in this workspace",
        });
      } else {
        // Never fall back to "No changes" here: an unexpected payload means the
        // list is broken, not empty, and saying so is what makes it fixable.
        setState({
          kind: "error",
          message: `Unexpected response from the extension: ${JSON.stringify(result)}`,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ kind: "error", message });
      await reportActionError("Load changes", err);
    }
  }, []);

  useEffect(() => {
    void load();
    const unsubscribe = bridge.onEvent((event) => {
      if (event === "commitStateChanged" || event === "gitStateChanged") {
        void load();
      }
    });
    // A webview view keeps running while hidden, so changes made in another
    // panel may have landed since the last fetch; coming back to the view
    // should show them without a manual refresh.
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const baseRef = state.kind === "list" ? state.baseRef : null;
  // A comparison against another branch has no changelists (the host sends
  // null), and a disabled feature falls back to the plain tree.
  const changelists = state.kind === "list" ? state.changelists : null;
  const changelistsAvailable =
    baseRef === null && changelists?.enabled === true;
  const showChangelists = changelistsAvailable && groupByChangelist;

  /**
   * Opens the file diff as a preview tab. `replaceOnly` refuses to create the
   * tab: with no diff tab open yet the click is a no-op, so the first open is
   * always the explicit double click.
   */
  const openDiff = useCallback(
    async (file: ChangesFile, replaceOnly: boolean) => {
      try {
        await bridge.request("showDiffForWorkingFile", {
          filePath: file.path,
          oldPath: file.oldPath,
          staged: file.staged,
          leftRef: baseRef ?? undefined,
          // The host keeps a single diff tab by closing the previous one; a
          // preview tab would additionally be replaceable by any other preview
          // in the group, which is not what this list wants.
          singleTab: true,
          requireExistingTab: replaceOnly,
        });
      } catch (err) {
        await reportActionError("Show diff", err);
      }
    },
    [baseRef],
  );

  const sections = useMemo((): Section[] => {
    if (state.kind !== "list") return [];
    if (showChangelists && state.changelists) {
      return groupFilesByChangelist(state.files, state.changelists).map(
        (bucket) => ({
          key: bucket.key,
          header: {
            label: bucket.label,
            count: bucket.files.length,
            active: bucket.active,
          },
          groups: buildGroups(
            bucket.files,
            groupByModule,
            groupByDirectory,
            bucket.key,
          ),
        }),
      );
    }
    return [
      {
        key: "all",
        header: null,
        groups: buildGroups(state.files, groupByModule, groupByDirectory),
      },
    ];
  }, [state, showChangelists, groupByModule, groupByDirectory]);

  // Every collapsible node, so Expand All / Collapse All has something to act
  // on without walking the tree twice.
  const allKeys = useMemo(() => {
    const keys = new Set<string>();
    const walk = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.kind === "dir") {
          keys.add(node.key);
          walk(node.children);
        }
      }
    };
    for (const section of sections) {
      if (section.header) keys.add(section.key);
      for (const group of section.groups) {
        if (group.label) keys.add(group.key);
        walk(group.children);
      }
    }
    return keys;
  }, [sections]);

  const allExpanded =
    allKeys.size > 0 && [...allKeys].every((key) => !collapsed.has(key));

  const toggleCollapsed = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleExpandAll = useCallback(() => {
    setCollapsed(allExpanded ? new Set(allKeys) : new Set());
  }, [allExpanded, allKeys]);

  if (state.kind === "loading") {
    return <div className="changes-empty">Loading…</div>;
  }

  if (state.kind === "error") {
    return (
      <div className="changes-empty">
        <div className="changes-error">{state.message}</div>
        <button
          type="button"
          className="changes-retry"
          onClick={() => void load()}
        >
          Retry
        </button>
      </div>
    );
  }

  const baseLabel = baseRef ? `Diff with '${baseRef}'` : null;

  return (
    <div className="changes-root">
      <div className="changes-toolbar">
        <Tooltip text="View Options">
          <button
            type="button"
            className="changes-tool-btn"
            ref={viewButtonRef}
            onClick={() => {
              const rect = viewButtonRef.current?.getBoundingClientRect();
              setMenuAt(
                rect ? { x: rect.left, y: rect.bottom + 2 } : { x: 8, y: 8 },
              );
            }}
          >
            <IconViewOptions />
          </button>
        </Tooltip>
        <div className="changes-toolbar-spacer" />
        <Tooltip text={allExpanded ? "Collapse All" : "Expand All"}>
          <button
            type="button"
            className="changes-tool-btn"
            onClick={toggleExpandAll}
            disabled={allKeys.size === 0}
          >
            {allExpanded ? <IconCollapseAll /> : <IconExpandAll />}
          </button>
        </Tooltip>
        <Tooltip text="Close">
          <button
            type="button"
            className="changes-tool-btn"
            onClick={() => {
              bridge.request("closeChangesView").catch((err) => {
                void reportActionError("Close Changes", err);
              });
            }}
          >
            <CodiconClose />
          </button>
        </Tooltip>
      </div>

      {state.files.length === 0 && sections.length <= 1 ? (
        <div className="changes-empty">
          {baseLabel && <div className="changes-group-title">{baseLabel}</div>}
          <div>No changes</div>
        </div>
      ) : (
        <div className="changes-list">
          {baseLabel && <div className="changes-group-title">{baseLabel}</div>}
          {sections.map((section) => {
            const header = section.header;
            const sectionCollapsed = header
              ? collapsed.has(section.key)
              : false;
            return (
              <div key={section.key}>
                {header && (
                  <ChangelistRow
                    depth={0}
                    label={header.label}
                    count={header.count}
                    active={header.active}
                    collapsed={sectionCollapsed}
                    onToggle={() => toggleCollapsed(section.key)}
                  />
                )}
                {!sectionCollapsed &&
                  section.groups.map((group) => {
                    const isCollapsed = group.label
                      ? collapsed.has(group.key)
                      : false;
                    const groupDepth = header ? 1 : 0;
                    return (
                      <div key={group.key}>
                        {group.label && (
                          <NodeRow
                            depth={groupDepth}
                            label={group.label}
                            collapsed={isCollapsed}
                            onToggle={() => toggleCollapsed(group.key)}
                          />
                        )}
                        {!isCollapsed && (
                          <NodeList
                            nodes={group.children}
                            depth={groupDepth + (group.label ? 1 : 0)}
                            flatDepth={groupDepth}
                            collapsed={collapsed}
                            onToggle={toggleCollapsed}
                            onOpen={openDiff}
                          />
                        )}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      )}

      {menuAt && (
        <ContextMenu
          x={menuAt.x}
          y={menuAt.y}
          minWidth={180}
          onClose={() => setMenuAt(null)}
        >
          <ContextMenuHeader>Group By</ContextMenuHeader>
          {changelistsAvailable && (
            <ContextMenuItem
              checked={groupByChangelist}
              onClick={() => {
                setGroupByChangelist((v) => !v);
                setMenuAt(null);
              }}
            >
              Changelist
            </ContextMenuItem>
          )}
          <ContextMenuItem
            checked={groupByModule}
            onClick={() => {
              setGroupByModule((v) => !v);
              setMenuAt(null);
            }}
          >
            Module
          </ContextMenuItem>
          <ContextMenuItem
            checked={groupByDirectory}
            onClick={() => {
              setGroupByDirectory((v) => !v);
              setMenuAt(null);
            }}
          >
            Directory
          </ContextMenuItem>
        </ContextMenu>
      )}
    </div>
  );
}

/* ─── Tree rendering ─────────────────────────────────────────────── */

function NodeList({
  nodes,
  depth,
  flatDepth,
  collapsed,
  onToggle,
  onOpen,
}: {
  nodes: TreeNode[];
  depth: number;
  /** The depth of a list with no folder rows above it; only there is the file's own directory not on screen. */
  flatDepth: number;
  collapsed: Set<string>;
  onToggle: (key: string) => void;
  onOpen: (file: ChangesFile, replaceOnly: boolean) => Promise<void>;
}) {
  return (
    <>
      {nodes.map((node) =>
        node.kind === "dir" ? (
          <div key={node.key}>
            <NodeRow
              depth={depth}
              label={node.name}
              collapsed={collapsed.has(node.key)}
              onToggle={() => onToggle(node.key)}
            />
            {!collapsed.has(node.key) && (
              <NodeList
                nodes={node.children}
                depth={depth + 1}
                flatDepth={flatDepth}
                collapsed={collapsed}
                onToggle={onToggle}
                onOpen={onOpen}
              />
            )}
          </div>
        ) : (
          <FileRow
            key={`${node.file.staged ? "staged" : "worktree"}:${node.file.path}`}
            file={node.file}
            depth={depth}
            showDirPath={depth === flatDepth}
            onOpen={onOpen}
          />
        ),
      )}
    </>
  );
}

function NodeRow({
  depth,
  label,
  collapsed,
  onToggle,
}: {
  depth: number;
  label: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="changes-row changes-row-dir"
      style={{ paddingLeft: 6 + depth * 12 }}
      onClick={onToggle}
      title={label}
    >
      <span className="changes-chevron">
        {collapsed ? <IconChevronRight /> : <IconChevronDown />}
      </span>
      <span className="changes-icon">
        {collapsed ? <IconFolder /> : <IconFolderOpen />}
      </span>
      <span className="changes-dir-name">{label}</span>
    </div>
  );
}

function FileRow({
  file,
  depth,
  showDirPath,
  onOpen,
}: {
  file: ChangesFile;
  depth: number;
  showDirPath: boolean;
  onOpen: (file: ChangesFile, replaceOnly: boolean) => Promise<void>;
}) {
  const parts = file.path.split("/");
  const fileName = parts.pop() || file.path;
  const dirPath = parts.join("/");
  const FileIcon = getCommitFileIcon(file.path);
  const nameColor = STATUS_COLORS[file.status] ?? "inherit";

  return (
    // Plain click handlers on purpose: click counting (useMultiClick) keys off
    // `event.detail`, which the browser also increments for rapid clicks on
    // *different* rows, so a click got classified as the second of a pair and
    // deferred — the row the user clicked never opened.
    //
    // A single click may only replace an existing diff tab, a double click
    // opens it. Unlike `useMultiClick` this needs no deferral: `replaceOnly`
    // is enforced by the host, which is the only place that knows whether the
    // tab is still there.
    <div
      className="changes-row"
      tabIndex={0}
      style={{ paddingLeft: 6 + depth * 12 }}
      onClick={() => void onOpen(file, true)}
      onDoubleClick={() => void onOpen(file, false)}
      onKeyDown={(e) => {
        if (e.key === "Enter") void onOpen(file, false);
      }}
      title={file.path}
    >
      <span className="changes-chevron" />
      <span className="changes-icon">
        <FileIcon style={{ width: 16, height: 16 }} />
      </span>
      <span className="changes-name" style={{ color: nameColor }}>
        {fileName}
      </span>
      {/* Only in a flat list: inside the tree the parent directories are
          already on screen. */}
      {dirPath && showDirPath && (
        <Tooltip text={dirPath}>
          <span className="changes-dir">{dirPath}</span>
        </Tooltip>
      )}
    </div>
  );
}

/* ─── Tree building ──────────────────────────────────────────────── */

/** `scope` keeps keys unique per changelist, so one list's collapsed folders never leak into another's. */
function buildGroups(
  files: ChangesFile[],
  byModule: boolean,
  byDirectory: boolean,
  scope = "",
): Group[] {
  const scoped = (key: string) => (scope ? `${scope}/${key}` : key);
  const buckets = new Map<string, ChangesFile[]>();
  for (const file of files) {
    const key = byModule ? (file.module ?? "") : "";
    const bucket = buckets.get(key);
    if (bucket) bucket.push(file);
    else buckets.set(key, [file]);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([module, moduleFiles]) => {
      const key = scoped(byModule ? `m:${module}` : "root");
      return {
        key,
        label: byModule ? module : "",
        children: byDirectory
          ? buildDirTree(moduleFiles, key)
          : moduleFiles.map((file): TreeNode => ({ kind: "file", file })),
      };
    });
}

function buildDirTree(files: ChangesFile[], prefix: string): TreeNode[] {
  const root: DirNode = { kind: "dir", key: prefix, name: "", children: [] };

  for (const file of files) {
    const parts = file.path.split("/");
    parts.pop();
    let current = root;
    let path = prefix;
    for (const part of parts) {
      path = `${path}/${part}`;
      const existing = current.children.find(
        (child): child is DirNode => child.kind === "dir" && child.key === path,
      );
      if (existing) {
        current = existing;
        continue;
      }
      const created: DirNode = {
        kind: "dir",
        key: path,
        name: part,
        children: [],
      };
      current.children.push(created);
      current = created;
    }
    current.children.push({ kind: "file", file });
  }

  return sortNodes(root.children);
}

/** Directories first, then files, each alphabetically. */
function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    const nameA =
      a.kind === "dir" ? a.name : (a.file.path.split("/").pop() ?? "");
    const nameB =
      b.kind === "dir" ? b.name : (b.file.path.split("/").pop() ?? "");
    return nameA.localeCompare(nameB);
  });
}
