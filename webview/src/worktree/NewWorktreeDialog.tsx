import { useCallback, useEffect, useState } from "react";
import CodiconClose from "~icons/codicon/close";
import CodiconFolderOpened from "~icons/codicon/folder-opened";
import { bridge } from "../shared/bridge";
import {
  IconChevronDown,
  IconChevronRight,
  IconTreeBranch,
  IconTreeCurrentBranch,
  IconTreeTag,
} from "../shared/components/icons";
import { useDialogDrag } from "../shared/hooks/useDialogDrag";
import { useWorktreeStore } from "../shared/store/worktree-store";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "./SearchableSelect";

const LOCATION_STORAGE_PREFIX = "jgc.worktree.lastLocation.";
const SETUP_STORAGE_PREFIX = "jgc.worktree.setup.";

/**
 * Option icons mirror the Git Log branch tree: a filled tag for the branch that
 * is currently checked out, a dashed tag for tags, a branch glyph otherwise.
 */
const BRANCH_ICON = <IconTreeBranch />;
const CURRENT_BRANCH_ICON = (
  <IconTreeCurrentBranch style={{ color: "#d4a017" }} />
);
const TAG_ICON = <IconTreeTag />;

/** Directory name of a worktree path, used as its label. */
function worktreeName(worktreePath: string): string {
  const parts = worktreePath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? worktreePath;
}

/** Remembered state of the "Copy local project setup" section. */
interface SetupState {
  copyIncludes: boolean;
  runSetupScript: boolean;
  scriptPath: string;
}

interface Props {
  onClose: () => void;
}

export function NewWorktreeDialog({ onClose }: Props) {
  const { addWorktree } = useWorktreeStore();
  const [branchOptions, setBranchOptions] = useState<SearchableSelectOption[]>(
    [],
  );
  const [loaded, setLoaded] = useState(false);
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [useNewBranch, setUseNewBranch] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [location, setLocation] = useState("");
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [existingBranchNames, setExistingBranchNames] = useState<Set<string>>(
    new Set(),
  );
  const drag = useDialogDrag();
  // Collapsible on purpose: most worktrees need neither setting, and the
  // dialog already carries four fields.
  const [setupExpanded, setSetupExpanded] = useState(false);
  const [copyIncludes, setCopyIncludes] = useState(true);
  const [runSetupScript, setRunSetupScript] = useState(false);
  const [scriptPath, setScriptPath] = useState("");
  const [includePatternCount, setIncludePatternCount] = useState(0);
  /** Branch name -> worktree holding it, so the dialog can warn about reuse. */
  const [branchWorktrees, setBranchWorktrees] = useState<Map<string, string>>(
    new Map(),
  );

  // Give Git Log's height to this panel while the dialog is up, and hand it
  // back on close. The cleanup covers every way out (button, unmount).
  useEffect(() => {
    void bridge.request("setPanelDialogOpen", {
      open: true,
      hideViewId: "git-brains.gitLog",
    });
    return () => {
      void bridge.request("setPanelDialogOpen", { open: false });
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      const [branchResult, tagResult, rootResult, worktreeResult] =
        await Promise.all([
          bridge.request("getBranches"),
          bridge.request("getTags"),
          bridge.request("getWorkspaceRoot"),
          bridge.request("getWorktrees"),
        ]);

      const options: SearchableSelectOption[] = [];
      const existingNames = new Set<string>();

      // Which worktree already holds each branch. `git worktree add` refuses a
      // branch that is checked out anywhere, the main worktree included.
      const owners = new Map<string, string>();
      const list = (worktreeResult as { data?: unknown })?.data;
      if (Array.isArray(list)) {
        for (const wt of list as { path: string; branch?: string }[]) {
          if (wt.branch) owners.set(wt.branch, worktreeName(wt.path));
        }
      }
      setBranchWorktrees(owners);

      if (Array.isArray(branchResult)) {
        const branches = branchResult as {
          name: string;
          isRemote: boolean;
          isCurrent?: boolean;
        }[];

        // Local branches. The icon carries the meaning — a filled tag for the
        // branch that is currently checked out — so no "current"/"remote"/"tag"
        // text is added next to the name.
        for (const b of branches.filter((b) => !b.isRemote)) {
          existingNames.add(b.name);
          options.push({
            value: b.name,
            label: b.name,
            icon: b.isCurrent ? CURRENT_BRANCH_ICON : BRANCH_ICON,
            suffix: owners.get(b.name),
          });
        }
        // origin/* remote branches — the `origin/` prefix is their marker.
        for (const b of branches.filter(
          (b) => b.isRemote && b.name.startsWith("origin/"),
        )) {
          existingNames.add(b.name);
          options.push({
            value: b.name,
            label: b.name,
            icon: BRANCH_ICON,
          });
        }
      }

      if (Array.isArray(tagResult)) {
        for (const t of tagResult) {
          existingNames.add(t.name);
          options.push({
            value: t.name,
            label: t.name,
            icon: TAG_ICON,
          });
        }
      }

      setExistingBranchNames(existingNames);

      setBranchOptions(options);

      const root = (rootResult as { root: string | null })?.root || "";
      setWorkspaceRoot(root);

      if (root) {
        try {
          const saved = localStorage.getItem(LOCATION_STORAGE_PREFIX + root);
          setLocation(saved || root);
        } catch {
          setLocation(root);
        }
        try {
          const raw = localStorage.getItem(SETUP_STORAGE_PREFIX + root);
          if (raw) {
            const parsed = JSON.parse(raw) as Partial<SetupState>;
            if (typeof parsed.copyIncludes === "boolean") {
              setCopyIncludes(parsed.copyIncludes);
            }
            if (typeof parsed.runSetupScript === "boolean") {
              setRunSetupScript(parsed.runSetupScript);
            }
            if (typeof parsed.scriptPath === "string") {
              setScriptPath(parsed.scriptPath);
            }
          }
        } catch {
          // Corrupt or unavailable storage: defaults are fine.
        }
      }

      setLoaded(true);
    };
    load();
  }, []);

  const handlePickFolder = async () => {
    const result = (await bridge.request("pickFolder", {
      defaultUri: location || undefined,
    })) as { success: boolean; path?: string };
    if (result.success && result.path) {
      setLocation(result.path);
      if (workspaceRoot) {
        try {
          localStorage.setItem(
            LOCATION_STORAGE_PREFIX + workspaceRoot,
            result.path,
          );
        } catch {
          // ignore
        }
      }
    }
  };

  const rememberSetup = useCallback(
    (next: SetupState) => {
      if (!workspaceRoot) return;
      try {
        localStorage.setItem(
          SETUP_STORAGE_PREFIX + workspaceRoot,
          JSON.stringify(next),
        );
      } catch {
        // ignore
      }
    },
    [workspaceRoot],
  );

  /**
   * Expanding the section is what creates `.worktreeinclude` — the file is only
   * written when the user actually opens the section, never for people who
   * leave it collapsed.
   */
  const handleToggleSetup = async () => {
    const next = !setupExpanded;
    setSetupExpanded(next);
    if (!next) return;
    try {
      const state = (await bridge.request("getWorktreeIncludeState", {
        create: true,
      })) as { exists?: boolean; patternCount?: number };
      setIncludePatternCount(state.patternCount ?? 0);
    } catch {
      setIncludePatternCount(0);
    }
  };

  const handleEditInclude = async () => {
    try {
      await bridge.request("openWorktreeIncludeFile");
      const state = (await bridge.request("getWorktreeIncludeState")) as {
        patternCount?: number;
      };
      setIncludePatternCount(state.patternCount ?? 0);
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handlePickScript = async () => {
    const result = (await bridge.request("pickFile", {
      defaultUri: workspaceRoot || undefined,
      title: "Select setup script",
    })) as { success: boolean; path?: string };
    if (result.success && result.path) {
      setScriptPath(result.path);
      setRunSetupScript(true);
      rememberSetup({
        copyIncludes,
        runSetupScript: true,
        scriptPath: result.path,
      });
    }
  };

  /**
   * Forgetting the script also unticks the option: with nothing to run, leaving
   * it on would only block Create for a setting that cannot do anything.
   */
  const handleClearScript = () => {
    setScriptPath("");
    setRunSetupScript(false);
    rememberSetup({
      copyIncludes,
      runSetupScript: false,
      scriptPath: "",
    });
  };

  const handleCreate = async () => {
    if (!selectedBranch || !projectName || !location) return;
    setCreating(true);
    setStatus(null);
    const branch = selectedBranch;
    const path = `${location}/${projectName}`;
    rememberSetup({
      copyIncludes,
      runSetupScript,
      scriptPath,
    });
    const result = await addWorktree(
      path,
      branch,
      useNewBranch && newBranch ? newBranch : undefined,
      {
        copyIncludes: setupExpanded && copyIncludes,
        setupScript:
          setupExpanded && runSetupScript && scriptPath
            ? scriptPath
            : undefined,
        // The warning above is advisory; git refuses a branch that is already
        // checked out, so ask for --force exactly when we warned.
        force: !!selectedWorktree,
      },
    );
    setCreating(false);
    if (result.success) {
      if (result.scriptError) {
        // The worktree exists and the project still opens; only the script
        // failed, which the hint text promises is not fatal.
        setStatus({
          type: "error",
          message: `Worktree created, but the setup script failed: ${result.scriptError}`,
        });
      } else if (result.copied) {
        setStatus({
          type: "success",
          message: `Worktree created at ${path} (${result.copied} local files copied)`,
        });
      } else {
        setStatus({ type: "success", message: `Worktree created at ${path}` });
      }
      await bridge.request("openWorktree", { path });
    } else {
      setStatus({
        type: "error",
        message: result.error || "Failed to create worktree",
      });
    }
  };

  const previewPath =
    location && projectName ? `${location}/${projectName}` : "";
  const settingsOn = (copyIncludes ? 1 : 0) + (runSetupScript ? 1 : 0);
  // Which worktree, if any, already holds the selected branch. Used twice: the
  // dimmed name after the field (always, it just says where the branch lives)
  // and the advisory note below it (only when the branch would be checked out
  // as-is — creating a new branch from it is unaffected).
  const selectedBranchWorktree = selectedBranch
    ? branchWorktrees.get(selectedBranch)
    : undefined;
  const selectedWorktree =
    !useNewBranch && selectedBranch ? selectedBranchWorktree : undefined;

  return (
    <div className="worktree-dialog-overlay">
      <div
        ref={drag.ref}
        className="worktree-dialog"
        style={drag.style}
        onClick={(e) => e.stopPropagation()}
        {...drag.handlers}
      >
        <div className="worktree-dialog-header">
          <span className="worktree-dialog-title">New Worktree</span>
          <button className="worktree-dialog-close" onClick={onClose}>
            x
          </button>
        </div>

        <div className="worktree-dialog-body">
          {!loaded ? (
            <div className="worktree-dialog-loading">Loading...</div>
          ) : (
            <>
              <div className="worktree-dialog-field">
                <label>From branch:</label>
                <SearchableSelect
                  options={branchOptions}
                  value={selectedBranch}
                  placeholder="Select branch..."
                  onChange={setSelectedBranch}
                  selectedSuffix={selectedBranchWorktree}
                />
              </div>

              {selectedWorktree && (
                <div className="worktree-setup-warning">
                  Selected branch is already checked out in another worktree
                </div>
              )}

              <div className="worktree-dialog-field">
                <label className="worktree-dialog-checkbox-label">
                  <input
                    type="checkbox"
                    checked={useNewBranch}
                    onChange={(e) => setUseNewBranch(e.target.checked)}
                  />
                  New Branch:
                </label>
                <input
                  type="text"
                  value={newBranch}
                  className={
                    newBranch && existingBranchNames.has(newBranch)
                      ? "input-error"
                      : ""
                  }
                  onChange={(e) => {
                    let filtered = e.target.value.replace(/ /g, "-");
                    filtered = filtered.replace(/[^a-zA-Z0-9_\-/!@#$&]/g, "");
                    setNewBranch(filtered);
                    if (filtered && !useNewBranch) {
                      setUseNewBranch(true);
                    }
                    setProjectName(
                      filtered ? filtered.replace(/\//g, "-") : "",
                    );
                  }}
                />
                {newBranch && existingBranchNames.has(newBranch) && (
                  <div className="worktree-dialog-field-error">
                    Branch '{newBranch}' already exists
                  </div>
                )}
              </div>

              <div className="worktree-dialog-field">
                <label>Project name:</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </div>

              <div className="worktree-dialog-field">
                <label>Location:</label>
                <div className="worktree-dialog-location-row">
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                  <button
                    className="worktree-dialog-btn-browse"
                    title="Browse..."
                    onClick={handlePickFolder}
                  >
                    <CodiconFolderOpened />
                  </button>
                </div>
              </div>

              {previewPath && (
                <div className="worktree-dialog-preview">
                  The worktree will be created in:
                  <br />
                  <code>{previewPath}</code>
                </div>
              )}

              <div className="worktree-setup">
                <button
                  type="button"
                  className="worktree-setup-header"
                  onClick={handleToggleSetup}
                >
                  <span className="worktree-setup-chevron">
                    {setupExpanded ? <IconChevronDown /> : <IconChevronRight />}
                  </span>
                  <span className="worktree-setup-title">
                    Copy local project setup
                  </span>
                  <span className="worktree-setup-count">
                    {settingsOn} of 2 settings on
                  </span>
                </button>

                {setupExpanded && (
                  <div className="worktree-setup-body">
                    <label className="worktree-setup-option">
                      <input
                        type="checkbox"
                        checked={copyIncludes}
                        onChange={(e) => {
                          setCopyIncludes(e.target.checked);
                          rememberSetup({
                            copyIncludes: e.target.checked,
                            runSetupScript,
                            scriptPath,
                          });
                        }}
                      />
                      <span className="worktree-setup-option-label">
                        Copy files listed in .worktreeinclude
                        {includePatternCount > 0 && (
                          <span className="worktree-setup-badge">
                            {includePatternCount}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        className="worktree-setup-action"
                        onClick={(e) => {
                          e.preventDefault();
                          void handleEditInclude();
                        }}
                      >
                        Edit
                      </button>
                    </label>
                    <div className="worktree-setup-hint">
                      List one file pattern per line, using .gitignore syntax.
                    </div>

                    <label className="worktree-setup-option">
                      <input
                        type="checkbox"
                        checked={runSetupScript}
                        onChange={(e) => {
                          setRunSetupScript(e.target.checked);
                          rememberSetup({
                            copyIncludes,
                            runSetupScript: e.target.checked,
                            scriptPath,
                          });
                        }}
                      />
                      <span className="worktree-setup-option-label">
                        Run setup script
                      </span>
                      <button
                        type="button"
                        className="worktree-setup-action worktree-setup-script"
                        title={scriptPath || "Select a script..."}
                        onClick={(e) => {
                          e.preventDefault();
                          void handlePickScript();
                        }}
                      >
                        <CodiconFolderOpened />
                        {scriptPath && (
                          <span className="worktree-setup-script-name">
                            {scriptPath.split(/[\\/]/).pop()}
                          </span>
                        )}
                      </button>
                      {scriptPath && (
                        <button
                          type="button"
                          className="worktree-setup-clear"
                          title="Clear"
                          aria-label="Clear setup script"
                          onClick={(e) => {
                            e.preventDefault();
                            handleClearScript();
                          }}
                        >
                          <CodiconClose />
                        </button>
                      )}
                    </label>
                    <div className="worktree-setup-hint">
                      The IDE runs the script once, with the new worktree path
                      as the argument, before it opens the project. The worktree
                      stays even if the script fails.
                    </div>
                  </div>
                )}
              </div>

              {status && (
                <div className={`worktree-dialog-status ${status.type}`}>
                  {status.message}
                </div>
              )}
            </>
          )}
        </div>

        <div className="worktree-dialog-footer">
          <button className="worktree-dialog-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="worktree-dialog-btn-create"
            onClick={handleCreate}
            disabled={
              !loaded ||
              !selectedBranch ||
              !projectName ||
              !location ||
              creating ||
              (useNewBranch && !newBranch) ||
              (setupExpanded && runSetupScript && !scriptPath) ||
              !!(
                useNewBranch &&
                newBranch &&
                existingBranchNames.has(newBranch)
              )
            }
          >
            {creating ? "Creating..." : "Create and Open Worktree"}
          </button>
        </div>
      </div>
    </div>
  );
}
