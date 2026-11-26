/**
 * Pieces of the interactive-rebase flow that need no git process: argument and
 * environment construction, matching a dialog's commit list against the real
 * range, and the scratch files a scripted todo leaves behind. `GitService`
 * runs git; this module decides what to run. No `vscode` import.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SaveChangesPolicy } from "./gitSettings.ts";
import {
  COMMIT_ACTIONS,
  planTodo,
  type RebaseEntry,
  shellQuote,
  validateEntries,
} from "./rebaseTodo.ts";

export interface InteractiveRebaseOptions {
  /** Rebase the commits after this one. Ignored with `root`. */
  base?: string;
  /** Rebase everything, including the root commit (`--root`). */
  root?: boolean;
  /** Transplant onto a different commit (`--onto`). */
  onto?: string;
  /** Let git reorder `fixup!` / `squash!` commits (`--autosquash`). */
  autosquash?: boolean;
  /** `--keep-empty` / `--no-keep-empty`; undefined leaves git's default. */
  keepEmpty?: boolean;
  /** `--update-refs`, or switch `rebase.updateRefs` off when false. */
  updateRefs?: boolean;
  /** `--rebase-merges`: recreate merge commits instead of flattening them. */
  rebaseMerges?: boolean;
  /**
   * The finished todo, oldest commit first. Without it git builds the todo
   * itself (and nothing is edited).
   */
  entries?: RebaseEntry[];
  policy?: SaveChangesPolicy;
}

export type InteractiveRebaseResult =
  | { status: "completed" }
  | {
      /** The rebase stopped and is waiting: a conflict, `edit`, or `exec`. */
      status: "stopped";
      message: string;
      conflicts: string[];
    };

/** A commit in the range, as the dialog lists it. */
export interface RebaseCommit {
  hash: string;
  shortHash: string;
  subject: string;
  body: string;
  authorName: string;
  authorDate: string;
  /** The action to start from; `fixup` / `squash` after autosquash. */
  action: RebaseEntry["action"];
  flag?: RebaseEntry["flag"];
}

/** Thrown inside the saved-changes wrapper so the stop is not a failure. */
export class RebaseStoppedError extends Error {
  readonly conflicts: string[];

  constructor(message: string, conflicts: string[]) {
    super(message);
    this.name = "RebaseStoppedError";
    this.conflicts = conflicts;
  }
}

/** A bridge payload to entries; the webview is untrusted input. */
export function coerceEntries(value: unknown): RebaseEntry[] {
  if (!Array.isArray(value)) throw new Error("The commit list is missing.");
  return value.map((item: unknown) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const { action, hash, subject, message, flag } = row;
    if (
      typeof action !== "string" ||
      !(COMMIT_ACTIONS as readonly string[]).includes(action) ||
      typeof hash !== "string" ||
      typeof subject !== "string"
    ) {
      throw new Error("The commit list is malformed.");
    }
    const entry: RebaseEntry = {
      action: action as RebaseEntry["action"],
      hash,
      subject,
    };
    if (typeof message === "string") entry.message = message;
    if (flag === "-C" || flag === "-c") entry.flag = flag;
    return entry;
  });
}

/** The stop signal inside `err` or the error that wraps it, if any. */
export function findRebaseStop(err: unknown): RebaseStoppedError | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current; depth++) {
    if (current instanceof RebaseStoppedError) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Reject anything git would read as an option. */
export function assertRevision(value: string, what: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("-") || /[\0\r\n]/.test(trimmed)) {
    throw new Error(`"${value}" is not a valid ${what}.`);
  }
  return trimmed;
}

/**
 * The `git rebase` command line. `customTodo` says the caller supplies the
 * todo, so git must not reorder it again and `--autosquash` is dropped.
 */
export function buildRebaseArgs(
  options: InteractiveRebaseOptions,
  customTodo: boolean,
): string[] {
  const args: string[] = [];
  // -c belongs before the subcommand.
  if (options.updateRefs === false) args.push("-c", "rebase.updateRefs=false");
  args.push("rebase", "-i");
  if (options.updateRefs === true) args.push("--update-refs");
  if (options.keepEmpty === true) args.push("--keep-empty");
  if (options.keepEmpty === false) args.push("--no-keep-empty");
  if (options.rebaseMerges) args.push("--rebase-merges");
  args.push(
    options.autosquash && !customTodo ? "--autosquash" : "--no-autosquash",
  );
  if (options.policy !== "shelve") args.push("--autostash");
  if (options.onto) args.push("--onto", options.onto);
  if (options.root) args.push("--root");
  else if (options.base) args.push(options.base);
  return args;
}

/**
 * Editors must never open a window or wait on a terminal. `:` is git's
 * documented no-op editor. The sequence editor either keeps git's todo
 * (`:`) or replaces it with ours.
 */
export function rebaseEnv(
  todoPath?: string,
  platform?: string,
): Record<string, string> {
  return {
    GIT_EDITOR: ":",
    GIT_SEQUENCE_EDITOR: todoPath
      ? `cp ${shellQuote(todoPath, platform)}`
      : ":",
  };
}

/**
 * Pair a dialog's entries with the commits git would rebase. Entries may use
 * abbreviated ids; the result carries full ids. A stale list (a commit was
 * added or removed since the dialog opened) is rejected rather than silently
 * dropping a commit.
 */
export function matchEntriesToRange(
  entries: RebaseEntry[],
  rangeHashes: string[],
): RebaseEntry[] {
  const problem = validateEntries(entries);
  if (problem) throw new Error(problem);

  const remaining = new Set(rangeHashes);
  const matched = entries.map((entry) => {
    const wanted = entry.hash.toLowerCase();
    const found = rangeHashes.filter((hash) => hash.startsWith(wanted));
    if (found.length !== 1 || !found[0] || !remaining.has(found[0])) {
      throw new Error(
        `Commit ${entry.hash.slice(0, 8)} is not part of the commits to rebase (or is listed twice). Reopen the dialog to refresh the list.`,
      );
    }
    remaining.delete(found[0]);
    return { ...entry, hash: found[0] };
  });
  if (remaining.size > 0) {
    throw new Error(
      `${remaining.size} commit(s) to rebase are missing from the list. Reopen the dialog to refresh it.`,
    );
  }
  return matched;
}

export function rebaseScratchDir(absoluteGitDir: string): string {
  return path.join(absoluteGitDir, "jgc-rebase");
}

/**
 * Write the todo and the message files it refers to. They live in the git
 * dir (per worktree) and must outlive this process: a stopped rebase runs
 * the remaining `exec` lines from them after `rebase --continue`.
 */
export async function writeScratchTodo(
  absoluteGitDir: string,
  entries: RebaseEntry[],
  options: {
    platform?: string;
    refsByHash?: ReadonlyMap<string, readonly string[]>;
  } = {},
): Promise<string> {
  const dir = rebaseScratchDir(absoluteGitDir);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });

  const planned = planTodo(
    entries,
    (index) => path.join(dir, `message-${index}.txt`),
    options,
  );
  for (const message of planned.messages) {
    await fs.writeFile(message.path, message.content, "utf-8");
  }
  const todoPath = path.join(dir, "todo.txt");
  await fs.writeFile(todoPath, planned.text, "utf-8");
  return todoPath;
}

export async function removeScratch(absoluteGitDir: string): Promise<void> {
  await fs.rm(rebaseScratchDir(absoluteGitDir), {
    recursive: true,
    force: true,
  });
}

/** What git printed, for an error from `execFile`. */
export function gitErrorText(err: unknown): string {
  if (err && typeof err === "object") {
    const { stderr, stdout, message } = err as {
      stderr?: unknown;
      stdout?: unknown;
      message?: unknown;
    };
    for (const text of [stderr, stdout, message]) {
      if (typeof text === "string" && text.trim()) return text.trim();
    }
  }
  return String(err);
}

/** A short, human line for a rebase that stopped. */
export function describeStop(
  conflicts: string[],
  failureOutput: string,
): string {
  if (conflicts.length > 0) {
    const count =
      conflicts.length === 1 ? "1 file has" : `${conflicts.length} files have`;
    return `Rebase stopped: ${count} conflicts. Resolve them, then continue, skip or abort the rebase.`;
  }
  const tail = failureOutput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-3)
    .join("\n");
  return `Rebase stopped. Make your changes, then continue or abort the rebase.${tail ? `\n\n${tail}` : ""}`;
}
