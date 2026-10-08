import type { DiffFile } from "./types";

const BACKSLASH = 0x5c;
const QUOTE = 0x22;
const SINGLE_QUOTE = 0x27;

/** git's c-style escapes for control bytes, keyed by the emitted letter byte. */
const LETTER_ESCAPES: Record<number, number> = {
  0x61: 0x07, // \a bell
  0x62: 0x08, // \b backspace
  0x66: 0x0c, // \f form feed
  0x6e: 0x0a, // \n newline
  0x72: 0x0d, // \r carriage return
  0x74: 0x09, // \t tab
  0x76: 0x0b, // \v vertical tab
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
