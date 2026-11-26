/** The part of the Git Log filter the host applies (everything but author/date). */
export interface LogQueryFilter {
  searchQuery: string;
  matchCase: boolean;
  regex: boolean;
  branch: string;
  file: string;
}

/** What `getGraphData` / `loadMoreLog` / `resolveLogRef` take as filter params. */
export interface LogParams {
  branch?: string;
  file?: string;
  search?: string;
  matchCase?: boolean;
  regex?: boolean;
}

export function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/** A regex the user is still typing: sending it would only make git fail. */
export function isRegexFilterInvalid(
  filter: Pick<LogQueryFilter, "searchQuery" | "regex">,
): boolean {
  const text = filter.searchQuery.trim();
  return filter.regex && text !== "" && !isValidRegex(text);
}

/**
 * The params the host should be asked for. A regex that does not compile keeps
 * the previous text params, so typing `(` never replaces the list with an
 * error, and the list never disagrees with what was last fetched.
 */
export function buildLogParams(
  filter: LogQueryFilter,
  previous: LogParams = {},
): LogParams {
  const params: LogParams = {};
  if (filter.branch) params.branch = filter.branch;
  if (filter.file) params.file = filter.file;
  if (isRegexFilterInvalid(filter)) {
    if (previous.search) params.search = previous.search;
    if (previous.matchCase) params.matchCase = true;
    if (previous.regex) params.regex = true;
    return params;
  }
  const text = filter.searchQuery.trim();
  if (text) {
    params.search = text;
    if (filter.matchCase) params.matchCase = true;
    if (filter.regex) params.regex = true;
  }
  return params;
}

export function sameLogParams(a: LogParams, b: LogParams): boolean {
  return (
    (a.branch ?? "") === (b.branch ?? "") &&
    (a.file ?? "") === (b.file ?? "") &&
    (a.search ?? "") === (b.search ?? "") &&
    !!a.matchCase === !!b.matchCase &&
    !!a.regex === !!b.regex
  );
}

/** True when the params narrow the log beyond its default (all refs) view. */
export function hasLogFilter(params: LogParams): boolean {
  return !!(params.branch || params.file || params.search);
}

/**
 * Turns what a file picker returns (absolute, native separators) into the
 * repository-relative, `/`-separated form the filter is stored and displayed
 * in. Anything not under `root` is returned as typed (with `/` separators) for
 * the host to accept or refuse.
 */
export function toRepoRelativePath(input: string, root: string | null): string {
  const value = input.trim();
  if (value === "" || value.startsWith(":")) return value;
  const slashed = value.replace(/\\/g, "/");
  const base = (root ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
  let relative = slashed;
  if (base !== "" && slashed === base) {
    relative = "";
  } else if (base !== "" && slashed.startsWith(`${base}/`)) {
    relative = slashed.slice(base.length + 1);
  }
  return relative.replace(/^\.\//, "").replace(/\/+$/, "");
}

/** Absolute on POSIX, a Windows drive, or a UNC path. */
export function isAbsolutePath(value: string): boolean {
  return /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/.test(value);
}

/**
 * Whether a changed file is covered by the path filter (a file or a folder).
 * A git pathspec (`:(glob)…`) cannot be evaluated here, so it covers every file.
 */
export function pathMatchesFilter(filePath: string, filter: string): boolean {
  if (filter.startsWith(":")) return true;
  return filePath === filter || filePath.startsWith(`${filter}/`);
}
