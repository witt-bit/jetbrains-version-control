/**
 * Typed Git behaviour settings (`jgc.*`).
 *
 * Kept free of the `vscode` module so the parsing rules can be unit-tested.
 * The extension host adapts `workspace.getConfiguration` to `SettingsReader`.
 */

export type UpdateMethod = "branchDefault" | "merge" | "rebase";
export type SaveChangesPolicy = "stash" | "shelve";

export interface GitSettings {
  updateMethod: UpdateMethod;
  saveChangesPolicy: SaveChangesPolicy;
}

/** Reads one setting by its full key (e.g. `update.method`), or the fallback. */
export type SettingsReader = (key: string) => unknown;

function pick<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function parseUpdateMethod(value: unknown): UpdateMethod {
  return pick(value, ["branchDefault", "merge", "rebase"], "branchDefault");
}

export function parseSaveChangesPolicy(value: unknown): SaveChangesPolicy {
  return pick(value, ["stash", "shelve"], "stash");
}

export function readGitSettings(read: SettingsReader): GitSettings {
  return {
    updateMethod: parseUpdateMethod(read("update.method")),
    saveChangesPolicy: parseSaveChangesPolicy(read("update.saveChangesPolicy")),
  };
}

/**
 * What `pull.rebase` / `branch.<name>.rebase` mean for a plain `git pull`.
 * Any rebase flavour (`true`, `merges`, `interactive`, `i`, `m`) is a rebase;
 * `false` and an unset key are a merge.
 */
export function interpretRebaseConfig(
  value: string | undefined,
): "merge" | "rebase" {
  const v = value?.trim().toLowerCase();
  if (!v || v === "false") return "merge";
  return "rebase";
}

/**
 * Resolve the effective method: an explicit setting wins; `branchDefault`
 * defers to the branch's own config, then the repository-wide one.
 */
export function resolveUpdateMethod(
  method: UpdateMethod,
  branchConfig: string | undefined,
  globalConfig: string | undefined,
): "merge" | "rebase" {
  if (method !== "branchDefault") return method;
  const branchSet = branchConfig?.trim();
  return interpretRebaseConfig(branchSet ? branchSet : globalConfig);
}
