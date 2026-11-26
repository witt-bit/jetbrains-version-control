import * as path from "node:path";

/** Runs git (in the repository the caller bound it to) and returns stdout. */
export type GitRun = (
  args: string[],
  env?: Record<string, string | undefined>,
) => Promise<string>;

export type SubmoduleState =
  | "initialized"
  | "uninitialized"
  | "modified"
  | "conflict";

export interface SubmoduleStatusEntry {
  /** Path relative to the superproject root, with `/` separators. */
  path: string;
  /** The commit the superproject records (or, for `+`, the one checked out). */
  hash: string;
  state: SubmoduleState;
  /** `git describe`-style name git prints in parentheses, when it has one. */
  describe?: string;
}

export interface SubmoduleInfo extends SubmoduleStatusEntry {
  /** Absolute path of the submodule's working directory. */
  absolutePath: string;
  /** `.gitmodules` name, when the entry is declared in the top-level file. */
  name?: string;
  /** `.gitmodules` URL, when known. */
  url?: string;
}

export interface GitmodulesEntry {
  name: string;
  path?: string;
  url?: string;
}

const STATE_BY_PREFIX: Record<string, SubmoduleState> = {
  " ": "initialized",
  "-": "uninitialized",
  "+": "modified",
  U: "conflict",
};

const STATUS_LINE = /^([ +\-U])([0-9a-f]{40,64}) (.*)$/;

/**
 * Parse `git submodule status [--recursive]`.
 *
 * Each line is a state character (` ` initialized, `-` not initialized, `+`
 * checked out at another commit than recorded, `U` merge conflict), the
 * commit hash, the path and — except for uninitialized ones — ` (describe)`.
 * Lines that do not match are skipped.
 */
export function parseSubmoduleStatus(output: string): SubmoduleStatusEntry[] {
  const entries: SubmoduleStatusEntry[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = STATUS_LINE.exec(line);
    if (!match) continue;
    const state = STATE_BY_PREFIX[match[1] ?? " "];
    const hash = match[2];
    const rest = match[3];
    if (!state || !hash || rest === undefined) continue;
    // An uninitialized submodule has no describe, so a trailing "(...)" is
    // part of its path.
    const described =
      state === "uninitialized" ? null : /^(.*?) \(([^()]*)\)$/.exec(rest);
    entries.push(
      described?.[1] !== undefined
        ? { path: described[1], hash, state, describe: described[2] }
        : { path: rest, hash, state },
    );
  }
  return entries;
}

/**
 * Parse `git config -f .gitmodules -z --get-regexp ^submodule\.`: NUL-separated
 * `key\nvalue` records. The name may itself contain dots, so the variable is
 * whatever follows the last one.
 */
export function parseGitmodulesConfig(output: string): GitmodulesEntry[] {
  const byName = new Map<string, GitmodulesEntry>();
  for (const record of output.split("\0")) {
    if (!record) continue;
    const newline = record.indexOf("\n");
    const key = newline >= 0 ? record.slice(0, newline) : record;
    const value = newline >= 0 ? record.slice(newline + 1) : "";
    const match = /^submodule\.(.+)\.([^.]+)$/.exec(key);
    const name = match?.[1];
    const variable = match?.[2]?.toLowerCase();
    if (!name || !variable) continue;
    const entry = byName.get(name) ?? { name };
    if (variable === "path") entry.path = value;
    if (variable === "url") entry.url = value;
    byName.set(name, entry);
  }
  return [...byName.values()];
}

async function repositoryRoot(run: GitRun): Promise<string> {
  return (await run(["rev-parse", "--show-toplevel"])).trim();
}

/**
 * Every submodule of the repository, nested ones included, with the URL
 * from the top-level `.gitmodules` where there is one.
 */
export async function listSubmodules(run: GitRun): Promise<SubmoduleInfo[]> {
  const root = await repositoryRoot(run);
  const status = await run(["-C", root, "submodule", "status", "--recursive"]);
  const declared = await run([
    "-C",
    root,
    "config",
    "-f",
    ".gitmodules",
    "-z",
    "--get-regexp",
    "^submodule\\.",
  ]).catch(() => "");
  const byPath = new Map(
    parseGitmodulesConfig(declared).map((entry) => [entry.path, entry]),
  );

  return parseSubmoduleStatus(status).map((entry) => {
    const info = byPath.get(entry.path);
    return {
      ...entry,
      absolutePath: path.join(root, entry.path),
      ...(info ? { name: info.name, url: info.url } : {}),
    };
  });
}

/**
 * `git submodule update --init --recursive`: clone what is missing and check
 * out the commit the superproject records. `paths` limits it to those
 * submodules (relative to the repository root).
 */
export async function updateSubmodules(
  run: GitRun,
  paths: string[] = [],
  env?: Record<string, string | undefined>,
): Promise<void> {
  const root = await repositoryRoot(run);
  const args = ["-C", root, "submodule", "update", "--init", "--recursive"];
  if (paths.length > 0) args.push("--", ...paths);
  await run(args, env);
}

/**
 * `git submodule sync --recursive`: copy the URLs in `.gitmodules` into
 * `.git/config` and into each initialized submodule's `origin`.
 */
export async function syncSubmodules(
  run: GitRun,
  paths: string[] = [],
): Promise<void> {
  const root = await repositoryRoot(run);
  const args = ["-C", root, "submodule", "sync", "--recursive"];
  if (paths.length > 0) args.push("--", ...paths);
  await run(args);
}

/** One-line label for a submodule state, for pickers. */
export function describeSubmoduleState(state: SubmoduleState): string {
  switch (state) {
    case "initialized":
      return "Up to date";
    case "uninitialized":
      return "Not initialized";
    case "modified":
      return "Different commit checked out";
    case "conflict":
      return "Merge conflict";
  }
}
