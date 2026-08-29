import { useEffect, useState } from "react";
import CodiconFolderOpened from "~icons/codicon/folder-opened";
import { bridge } from "../shared/bridge";
import { useWorktreeStore } from "../shared/store/worktree-store";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "./SearchableSelect";

const LOCATION_STORAGE_PREFIX = "jgc.worktree.lastLocation.";

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

  useEffect(() => {
    const load = async () => {
      const [branchResult, tagResult, rootResult] = await Promise.all([
        bridge.request("getBranches"),
        bridge.request("getTags"),
        bridge.request("getWorkspaceRoot"),
      ]);

      const options: SearchableSelectOption[] = [];
      const existingNames = new Set<string>();

      if (Array.isArray(branchResult)) {
        // Local branches
        for (const b of branchResult.filter((b) => !b.isRemote)) {
          existingNames.add(b.name);
          options.push({
            value: b.name,
            label: b.name,
            group: b.isCurrent ? "(current)" : undefined,
          });
        }
        // origin/* remote branches
        for (const b of branchResult.filter(
          (b) => b.isRemote && b.name.startsWith("origin/"),
        )) {
          existingNames.add(b.name);
          options.push({ value: b.name, label: b.name, group: "remote" });
        }
      }

      if (Array.isArray(tagResult)) {
        for (const t of tagResult) {
          existingNames.add(t.name);
          options.push({ value: t.name, label: t.name, group: "tag" });
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

  const handleCreate = async () => {
    if (!selectedBranch || !projectName || !location) return;
    setCreating(true);
    setStatus(null);
    const branch = selectedBranch;
    const path = `${location}/${projectName}`;
    const result = await addWorktree(
      path,
      branch,
      useNewBranch && newBranch ? newBranch : undefined,
    );
    setCreating(false);
    if (result.success) {
      setStatus({ type: "success", message: `Worktree created at ${path}` });
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

  return (
    <div className="worktree-dialog-overlay">
      <div className="worktree-dialog" onClick={(e) => e.stopPropagation()}>
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
                />
              </div>

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
              !!(
                useNewBranch &&
                newBranch &&
                existingBranchNames.has(newBranch)
              )
            }
          >
            {creating ? "Creating..." : "Create & Open Worktree"}
          </button>
        </div>
      </div>
    </div>
  );
}
