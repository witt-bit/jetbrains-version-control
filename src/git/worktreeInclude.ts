import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * File listing the local-only files that should be copied into every new
 * worktree — `.env`, editor settings, certificates and the like. It lives in
 * the repository root and uses `.gitignore` syntax, which is not implemented
 * here: the patterns are handed to `git ls-files --exclude-from`, so matching
 * behaves exactly like `.gitignore` (including `!` negation and `dir/`).
 */
export const WORKTREE_INCLUDE_FILE = ".worktreeinclude";

/** Starter content written when the file is created from the New Worktree dialog. */
export function buildIncludeFileContent(): string {
  return [
    "# Files copied from your local checkout into every new worktree.",
    "# One pattern per line, using .gitignore syntax.",
    "",
    "# .env",
    "# .env.local",
    "# .vscode/settings.json",
    "",
  ].join("\n");
}

/**
 * Lines that actually match something. Comments and blank lines are dropped,
 * so a freshly created file counts as "no patterns" instead of "one empty
 * pattern", which git would treat as a match-everything rule.
 */
export function parseIncludePatterns(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

export interface CopyResult {
  copied: number;
  failed: string[];
}

/**
 * Copies `relativePaths` from `sourceRoot` into `targetRoot`, recreating the
 * directory structure. Destinations are overwritten on purpose: the point is to
 * reproduce the local setup, and these files are local-only anyway.
 */
export async function copyIncludedFiles(
  sourceRoot: string,
  targetRoot: string,
  relativePaths: string[],
): Promise<CopyResult> {
  const result: CopyResult = { copied: 0, failed: [] };

  for (const relativePath of relativePaths) {
    // Never let a crafted pattern escape either root.
    if (
      !relativePath ||
      path.isAbsolute(relativePath) ||
      relativePath.split(/[\\/]/).includes("..")
    ) {
      result.failed.push(relativePath);
      continue;
    }

    const from = path.join(sourceRoot, relativePath);
    const to = path.join(targetRoot, relativePath);
    try {
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to);
      result.copied += 1;
    } catch {
      // A pattern can match a directory entry or a file that vanished between
      // listing and copying; report it instead of failing the whole worktree.
      result.failed.push(relativePath);
    }
  }

  return result;
}
