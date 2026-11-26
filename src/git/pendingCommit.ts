/**
 * Gathers the facts the pre-commit checks need about what a commit made right
 * now would contain: the staged files, their blob sizes and line endings.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  type EolKind,
  type PendingFile,
  parseBatchCheckSizes,
  parseDiffRawZ,
  parseLsFilesEol,
} from "./commitChecks.ts";

const MAX_BUFFER = 64 * 1024 * 1024;
/** Paths per `git ls-files --eol` call, to stay clear of the argv limit. */
const PATH_CHUNK = 200;

export interface PendingSelection {
  /** Unstaged paths the commit will stage. */
  stage?: string[];
  /** Staged paths the commit leaves out. */
  unstage?: string[];
}

export interface PendingWants {
  sizes: boolean;
  eol: boolean;
}

function run(
  cwd: string,
  args: string[],
  options: { env?: Record<string, string>; input?: string } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "git",
      args,
      {
        cwd,
        maxBuffer: MAX_BUFFER,
        env: {
          ...process.env,
          LC_ALL: "C",
          GIT_TERMINAL_PROMPT: "0",
          ...options.env,
        },
      },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    );
    if (options.input !== undefined) child.stdin?.end(options.input);
  });
}

/**
 * The files a commit would record, with the facts requested in `wants`.
 *
 * `selection` applies the commit panel's check boxes the way the commit will
 * (stage the checked, leave out the unchecked staged ones) on a throwaway copy
 * of the index, so asking never changes what the user has staged.
 */
export async function readPendingCommit(
  cwd: string,
  selection: PendingSelection,
  wants: PendingWants,
): Promise<PendingFile[]> {
  const stage = selection.stage ?? [];
  const unstage = selection.unstage ?? [];
  let env: Record<string, string> = {};
  let scratchIndex: string | undefined;

  try {
    if (stage.length > 0 || unstage.length > 0) {
      const indexFile = path.resolve(
        cwd,
        (await run(cwd, ["rev-parse", "--git-path", "index"])).trim(),
      );
      // Next to the real index, not in the temp dir: a split index resolves
      // its shared part relative to the index file's own directory.
      scratchIndex = path.join(
        path.dirname(indexFile),
        `jgc-check-index-${process.pid}-${Date.now()}`,
      );
      await fs.copyFile(indexFile, scratchIndex).catch(async (err) => {
        // A repository with nothing staged yet has no index file.
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      });
      env = { GIT_INDEX_FILE: scratchIndex };
      if (stage.length > 0) {
        await run(cwd, ["add", "--", ...stage], { env });
      }
      if (unstage.length > 0) {
        await run(cwd, ["reset", "-q", "--", ...unstage], { env });
      }
    }

    const entries = parseDiffRawZ(
      await run(
        cwd,
        [
          "diff",
          "--cached",
          "--raw",
          "-z",
          "--no-abbrev",
          "--no-renames",
          "--diff-filter=d",
        ],
        { env },
      ),
    );
    const files: PendingFile[] = entries.map((e) => ({ path: e.path }));
    if (files.length === 0) return files;

    if (wants.sizes) {
      // Submodule entries name a commit that is not in this repository's
      // object store, so there is no blob to measure.
      const measurable = entries.filter((e) => e.mode !== "160000");
      const sizes = parseBatchCheckSizes(
        await run(cwd, ["cat-file", "--batch-check"], {
          env,
          input: `${measurable.map((e) => e.sha).join("\n")}\n`,
        }),
      );
      const sizeByPath = new Map(
        measurable.map((entry, i) => [entry.path, sizes[i]]),
      );
      for (const file of files) file.size = sizeByPath.get(file.path);
    }

    if (wants.eol) {
      const byPath = new Map<string, EolKind>();
      for (let i = 0; i < files.length; i += PATH_CHUNK) {
        const chunk = files.slice(i, i + PATH_CHUNK).map((f) => f.path);
        const out = await run(
          cwd,
          ["--literal-pathspecs", "ls-files", "--eol", "-z", "--", ...chunk],
          { env },
        );
        for (const [file, eol] of parseLsFilesEol(out)) byPath.set(file, eol);
      }
      for (const file of files) file.indexEol = byPath.get(file.path);
    }
    return files;
  } finally {
    if (scratchIndex) {
      await fs.rm(scratchIndex, { force: true }).catch(() => {});
      await fs.rm(`${scratchIndex}.lock`, { force: true }).catch(() => {});
    }
  }
}
