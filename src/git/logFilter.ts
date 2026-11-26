import * as path from "node:path";
import type { CommitNode, LogOptions } from "./types";

/**
 * How many commits `resolveLogRef` scans when it looks for a commit's position
 * in the (filtered) log. It bounds the work for Go To; a commit deeper than
 * this is reported as "not found" instead of paging through the whole history.
 */
export const LOG_LOCATE_SCAN_LIMIT = 20000;

/** True when the options narrow the history (as opposed to just paging it). */
export function hasHistoryFilter(options: LogOptions): boolean {
  return !!(
    isTextFilterActive(options) ||
    options.author ||
    options.since ||
    options.until ||
    options.file
  );
}

/** A blank text filter is no filter: matching every message is not a filter. */
export function isTextFilterActive(options: LogOptions): boolean {
  return !!options.search && options.search.trim() !== "";
}

/**
 * The `git log` arguments that restrict WHICH commits are listed (not how many).
 * Everything here goes before the revision arguments.
 *
 * The text filter is a literal, case-insensitive match unless the caller asks
 * for a regex (`-E`, POSIX extended) or for Match Case. Git applies `-i`, `-F`
 * and `-E` to `--author` too, so they are only added when a text filter is set
 * and an author-only filter keeps git's own matching.
 */
export function buildLogFilterArgs(options: LogOptions): string[] {
  const args: string[] = [];
  const hasText = isTextFilterActive(options);
  if (options.author) {
    args.push(`--author=${options.author}`);
  }
  if (hasText) {
    args.push(`--grep=${(options.search ?? "").trim()}`);
  }
  if (hasText) {
    args.push(options.regex ? "--extended-regexp" : "--fixed-strings");
    if (!options.matchCase) {
      args.push("--regexp-ignore-case");
    }
  }
  if (options.since) {
    args.push(`--since=${options.since}`);
  }
  if (options.until) {
    args.push(`--until=${options.until}`);
  }
  return args;
}

/**
 * Normalises the path filter to what git expects: relative to the repository
 * root, `/`-separated. Absolute paths (a file picker returns them) are made
 * relative; one outside the repository is refused with a readable message
 * instead of git's `fatal: ... is outside repository`. Pathspec magic
 * (`:(glob)…`) is passed through untouched.
 */
export function normalizeLogPath(
  root: string,
  input: string | undefined,
  pathApi: Pick<typeof path, "isAbsolute" | "relative" | "sep"> = path,
): string | undefined {
  const value = input?.trim();
  if (!value || value === "." || value === "./") {
    return undefined;
  }
  if (value.startsWith(":")) {
    return value;
  }
  if (!pathApi.isAbsolute(value)) {
    return pathApi.sep === "\\" ? value.replace(/\\/g, "/") : value;
  }
  const relative = pathApi.relative(root, value);
  if (relative === "") {
    return undefined;
  }
  if (
    relative === ".." ||
    relative.startsWith("../") ||
    relative.startsWith("..\\") ||
    pathApi.isAbsolute(relative)
  ) {
    throw new Error(`"${value}" is outside the repository`);
  }
  return pathApi.sep === "\\" ? relative.replace(/\\/g, "/") : relative;
}

/** Parents referenced by `commits` that are not themselves in `commits`. */
export function danglingParents(commits: CommitNode[]): string[] {
  const present = new Set(commits.map((c) => c.hash));
  const dangling = new Set<string>();
  for (const commit of commits) {
    for (const parent of commit.parents) {
      if (!present.has(parent)) {
        dangling.add(parent);
      }
    }
  }
  return [...dangling];
}

/**
 * Turns bridge parameters (`Record<string, unknown>`, so unchecked) into
 * `LogOptions`. Wrong types are dropped rather than forwarded to git.
 */
export function parseLogParams(params: Record<string, unknown>): LogOptions {
  const str = (key: string): string | undefined => {
    const value = params[key];
    return typeof value === "string" && value !== "" ? value : undefined;
  };
  const count = (key: string): number | undefined => {
    const value = params[key];
    return typeof value === "number" && Number.isInteger(value) && value >= 0
      ? value
      : undefined;
  };
  const maxCount = count("maxCount") ?? count("count");
  const skip = count("skip");
  const options: LogOptions = {};
  if (maxCount !== undefined) options.maxCount = maxCount;
  if (skip !== undefined) options.skip = skip;
  for (const key of [
    "branch",
    "search",
    "author",
    "file",
    "since",
    "until",
  ] as const) {
    const value = str(key);
    if (value !== undefined) options[key] = value;
  }
  if (params.matchCase === true) options.matchCase = true;
  if (params.regex === true) options.regex = true;
  return options;
}

/**
 * Rewrites git's stderr for an invalid `-E` pattern into a sentence that
 * makes sense in a notification; any other failure is returned unchanged.
 */
export function describeLogError(err: unknown): Error {
  const stderr =
    typeof err === "object" && err !== null && "stderr" in err
      ? String((err as { stderr?: unknown }).stderr ?? "")
      : "";
  const match = /fatal: command line, '[^']*': (.+)/.exec(stderr);
  if (match) {
    return new Error(`Invalid regular expression: ${match[1].trim()}`);
  }
  return err instanceof Error ? err : new Error(String(err));
}
