/**
 * Pre-commit checks: pure functions that turn facts about what is about to be
 * committed into a list of warnings. Gathering the facts is the caller's job
 * (see `pendingCommit.ts`), so every rule here is testable without git.
 */

/** Line endings of a blob as reported by `git ls-files --eol` (`i/<value>`). */
export type EolKind = "none" | "-text" | "lf" | "crlf" | "mixed";

export interface PendingFile {
  path: string;
  /** Size in bytes of the blob that would be committed, when known. */
  size?: number;
  /** Line endings of that blob, when known. */
  indexEol?: EolKind;
}

export interface CommitCheckInput {
  files: PendingFile[];
  /** Files over this many bytes are reported; `undefined` skips the check. */
  largeFileBytes?: number;
  checkCrlf: boolean;
  /** `undefined` skips the check. */
  head?: { detached: boolean; rebaseInProgress: boolean };
  /** `undefined` skips the check. */
  identity?: { name?: string; email?: string };
}

export type CommitWarningKind =
  | "largeFiles"
  | "crlf"
  | "detachedHead"
  | "rebaseInProgress"
  | "missingIdentity";

export interface CommitWarning {
  kind: CommitWarningKind;
  message: string;
  /** Items the warning is about (file paths), shown under the message. */
  details: string[];
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = -1;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function runCommitChecks(input: CommitCheckInput): CommitWarning[] {
  const warnings: CommitWarning[] = [];

  if (input.head?.rebaseInProgress) {
    warnings.push({
      kind: "rebaseInProgress",
      message:
        "A rebase is in progress. Committing now adds a commit in the middle of the rebase.",
      details: [],
    });
  } else if (input.head?.detached) {
    warnings.push({
      kind: "detachedHead",
      message:
        "HEAD is detached. A commit made now belongs to no branch and can be lost when you switch away.",
      details: [],
    });
  }

  if (input.identity) {
    const missing: string[] = [];
    if (!input.identity.name?.trim()) missing.push("user.name");
    if (!input.identity.email?.trim()) missing.push("user.email");
    if (missing.length > 0) {
      warnings.push({
        kind: "missingIdentity",
        message: `Git ${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} not set, so the commit author is guessed from this machine.`,
        details: [],
      });
    }
  }

  const limit = input.largeFileBytes;
  if (limit !== undefined) {
    const large = input.files.filter(
      (f) => f.size !== undefined && f.size > limit,
    );
    if (large.length > 0) {
      warnings.push({
        kind: "largeFiles",
        message: `${plural(large.length, "file is", "files are")} larger than ${formatBytes(limit)}.`,
        details: large.map((f) => `${f.path} (${formatBytes(f.size ?? 0)})`),
      });
    }
  }

  if (input.checkCrlf) {
    const crlf = input.files.filter(
      (f) => f.indexEol === "crlf" || f.indexEol === "mixed",
    );
    if (crlf.length > 0) {
      warnings.push({
        kind: "crlf",
        message: `${plural(crlf.length, "file has", "files have")} CRLF line separators that will be committed as they are. Set core.autocrlf or a .gitattributes eol rule to normalize them.`,
        details: crlf.map((f) => f.path),
      });
    }
  }

  return warnings;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

const MAX_DETAILS = 5;

/** The text of the confirmation dialog: one bullet per warning, files indented. */
export function formatCommitWarnings(warnings: CommitWarning[]): string {
  return warnings
    .map((w) => {
      const shown = w.details.slice(0, MAX_DETAILS).map((d) => `    ${d}`);
      if (w.details.length > MAX_DETAILS) {
        shown.push(`    … and ${w.details.length - MAX_DETAILS} more`);
      }
      return [`• ${w.message}`, ...shown].join("\n");
    })
    .join("\n\n");
}

// ─── Parsers for the git output the checks are built from ───────────────

export interface RawDiffEntry {
  path: string;
  /** Blob id of the staged content. */
  sha: string;
  mode: string;
}

/**
 * Parse `git diff --cached --raw -z --no-abbrev --no-renames`:
 * `:<old mode> <new mode> <old sha> <new sha> <status>\0<path>\0`.
 * Deletions carry the all-zero id and are dropped.
 */
export function parseDiffRawZ(output: string): RawDiffEntry[] {
  const entries: RawDiffEntry[] = [];
  const tokens = output.split("\0");
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const meta = /^:(\d+) (\d+) ([0-9a-f]+) ([0-9a-f]+) (\w)/.exec(tokens[i]);
    if (!meta) continue;
    const [, , mode, , sha, status] = meta;
    if (status === "D" || /^0+$/.test(sha)) continue;
    entries.push({ path: tokens[i + 1], sha, mode });
  }
  return entries;
}

/**
 * Parse `git cat-file --batch-check` output, one line per requested object:
 * `<sha> <type> <size>` or `<sha> missing`. Returns sizes keyed by position so
 * duplicates in the request stay aligned.
 */
export function parseBatchCheckSizes(output: string): (number | undefined)[] {
  return output
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split(" ");
      const size = Number(parts[2]);
      return parts[1] === "missing" || !Number.isFinite(size)
        ? undefined
        : size;
    });
}

/**
 * Parse `git ls-files --eol -z`: `i/<eol> w/<eol> attr/<attrs>\t<path>\0`.
 * Returns the index-side line ending for each path.
 */
export function parseLsFilesEol(output: string): Map<string, EolKind> {
  const result = new Map<string, EolKind>();
  for (const record of output.split("\0")) {
    const tab = record.indexOf("\t");
    if (tab < 0) continue;
    const match = /^i\/(\S+)/.exec(record.slice(0, tab));
    if (!match) continue;
    result.set(record.slice(tab + 1), match[1] as EolKind);
  }
  return result;
}
