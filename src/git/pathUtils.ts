import type { DiffFile } from "./types";

const BACKSLASH = 0x5c;
const QUOTE = 0x22;
const SINGLE_QUOTE = 0x27;

/** git's c-style escapes for control bytes, keyed by the emitted letter byte. */
const LETTER_ESCAPES: Record<number, number> = {
  97: 0x07, // \a bell
  98: 0x08, // \b backspace
  102: 0x0c, // \f form feed
  110: 0x0a, // \n newline
  114: 0x0d, // \r carriage return
  116: 0x09, // \t tab
  118: 0x0b, // \v vertical tab
};

/**
 * Decode a path as printed by git plumbing (status --porcelain, diff
 * --name-status, stash show --name-only, ...).
 *
 * git wraps such paths in C-style quotes whenever they need it: non-ASCII
 * bytes become \NNN octal escapes unless core.quotepath=false, and bytes like
 * a space, a double quote or a backslash are quoted regardless of that
 * setting. So an unquote step is required even with quoting turned off.
 *
 * Unwrapping happens at the byte level: git escapes bytes, and a quoted path
 * may still hold raw multi-byte UTF-8 (quotepath=false plus a space).
 */
export function unquoteGitPath(raw: string): string {
  if (raw.length < 2 || !raw.startsWith('"') || !raw.endsWith('"')) {
    return raw;
  }

  const bytes = Buffer.from(raw, "utf8");
  const out: number[] = [];
  const closing = bytes.length - 1;
  let i = 1;

  while (i < closing) {
    const byte = bytes[i] as number;
    if (byte !== BACKSLASH) {
      out.push(byte);
      i++;
      continue;
    }

    i++;
    if (i >= closing) {
      out.push(BACKSLASH);
      break;
    }

    const escaped = bytes[i] as number;
    if (escaped >= 0x30 && escaped <= 0x37) {
      let value = escaped - 0x30;
      for (let digits = 1; digits < 3 && i + 1 < closing; digits++) {
        const next = bytes[i + 1] as number;
        if (next < 0x30 || next > 0x37) break;
        value = value * 8 + (next - 0x30);
        i++;
      }
      out.push(value & 0xff);
      i++;
      continue;
    }

    out.push(
      escaped === QUOTE || escaped === BACKSLASH || escaped === SINGLE_QUOTE
        ? escaped
        : (LETTER_ESCAPES[escaped] ?? escaped),
    );
    i++;
  }

  return Buffer.from(out).toString("utf8");
}

/** Index of the unescaped closing quote after `start`, or -1 when unclosed. */
function findClosingQuote(text: string, start: number): number {
  for (let i = start; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === BACKSLASH) {
      i++;
    } else if (code === QUOTE) {
      return i;
    }
  }
  return -1;
}

/**
 * Strip a leading `a/` or `b/` prefix, reporting whether it was one of those.
 */
function stripDiffPrefix(token: string, expected: "a" | "b"): string | null {
  const prefix = `${expected}/`;
  return token.startsWith(prefix) ? token.slice(prefix.length) : null;
}

/**
 * Parse the path pair out of a `diff --git a/<old> b/<new>` header.
 *
 * git prints the header in two shapes, and the obvious
 * `/^diff --git a\/(.+?) b\/(.+)$/` only handles the first:
 *
 *   diff --git a/plain.txt b/plain.txt
 *   diff --git "a/has\"quote.txt" "b/has\"quote.txt"
 *
 * Whenever either path needs C-style quoting, git quotes the *whole* token
 * including its `a/`/`b/` prefix, so a regex anchored on a bare `a/` silently
 * drops those files. Each shape is handled separately rather than with one
 * permissive pattern, because the unquoted shape is genuinely ambiguous: a
 * path may itself contain " b/" (`a/foo b/bar.txt b/foo b/bar.txt`), so we
 * cannot just split on the first occurrence.
 *
 * Returns the new path (the `b/` side), or null when the line is not a header.
 */
export function parseDiffGitHeader(line: string): string | null {
  const rest = line.startsWith("diff --git ") ? line.slice(11) : null;
  if (rest === null || rest.length === 0) {
    return null;
  }

  // Quoted form: two independently quoted tokens, each carrying its prefix.
  if (rest.startsWith('"')) {
    const close = findClosingQuote(rest, 1);
    if (close === -1) {
      return null;
    }
    const oldPath = stripDiffPrefix(
      unquoteGitPath(rest.slice(0, close + 1)),
      "a",
    );
    const tail = rest.slice(close + 1);
    if (oldPath === null || !tail.startsWith(' "b/')) {
      return null;
    }
    // The tail has no trailing context beyond the closing quote, so unquoting
    // the whole remainder is safe: git emits exactly two tokens here.
    return stripDiffPrefix(unquoteGitPath(tail.slice(1)), "b");
  }

  // Unquoted form: split on the " b/" that makes the header symmetric. git
  // echoes the same path on both sides for every hunk except renames and
  // copies, so requiring the halves to mirror each other resolves the
  // ambiguity that a naive first-match split leaves open.
  const candidate = rest;
  for (
    let i = candidate.indexOf(" b/");
    i !== -1;
    i = candidate.indexOf(" b/", i + 1)
  ) {
    const left = candidate.slice(0, i);
    const right = candidate.slice(i + 1);
    if (!left.startsWith("a/")) {
      continue;
    }
    const newPath = stripDiffPrefix(right, "b");
    if (newPath !== null && newPath === left.slice(2)) {
      return newPath;
    }
  }

  // Renames and copies: the halves legitimately differ, so fall back to the
  // first " b/" and trust the trailing side, which is what callers want.
  const first = candidate.indexOf(" b/");
  if (first === -1 || !candidate.startsWith("a/")) {
    return null;
  }
  return stripDiffPrefix(candidate.slice(first + 1), "b");
}

/**
 * Split the path field of a `git status --porcelain` entry.
 *
 * Renames read `old -> new`, but a file literally named `a -> b` is printed
 * quoted as "a -> b", so the arrow is only a separator outside of quotes.
 */
export function splitStatusPaths(rest: string): {
  path: string;
  oldPath?: string;
} {
  if (rest.startsWith('"')) {
    const close = findClosingQuote(rest, 1);
    if (close !== -1) {
      const first = unquoteGitPath(rest.slice(0, close + 1));
      const tail = rest.slice(close + 1);
      return tail.startsWith(" -> ")
        ? { path: unquoteGitPath(tail.slice(4)), oldPath: first }
        : { path: first, oldPath: undefined };
    }
  }

  const arrowIdx = rest.indexOf(" -> ");
  if (arrowIdx !== -1) {
    return {
      path: unquoteGitPath(rest.slice(arrowIdx + 4)),
      oldPath: unquoteGitPath(rest.slice(0, arrowIdx)),
    };
  }
  return { path: unquoteGitPath(rest), oldPath: undefined };
}

/** Parse `--name-status` output (diff, diff-tree, ...). */
export function parseDiffNameStatus(output: string): DiffFile[] {
  const files: DiffFile[] = [];
  for (const line of output.trim().split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const parts = line.split("\t");
    const statusCode = parts[0]?.trim() ?? "";

    if (statusCode.startsWith("R") || statusCode.startsWith("C")) {
      files.push({
        oldPath: unquoteGitPath(parts[1] ?? ""),
        newPath: unquoteGitPath(parts[2] ?? ""),
        status: statusCode.startsWith("R") ? "renamed" : "copied",
        isBinary: false,
      });
    } else {
      const filePath = unquoteGitPath(parts[1] ?? "");
      let status: DiffFile["status"] = "modified";
      if (statusCode === "A") {
        status = "added";
      } else if (statusCode === "D") {
        status = "deleted";
      }
      files.push({
        oldPath: filePath,
        newPath: filePath,
        status,
        isBinary: false,
      });
    }
  }
  return files;
}
