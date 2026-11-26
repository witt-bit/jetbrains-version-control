/** How far `git blame` follows lines that moved (Rider: AnnotateDetectMovementsOption). */
export type BlameDetectMovements = "none" | "inner" | "outer";

export interface BlameOptions {
  ignoreWhitespace: boolean;
  detectMovements: BlameDetectMovements;
}

/** What blame did before these were configurable: `-w -M`. */
export const DEFAULT_BLAME_OPTIONS: BlameOptions = {
  ignoreWhitespace: true,
  detectMovements: "inner",
};

export function parseDetectMovements(value: unknown): BlameDetectMovements {
  return value === "none" || value === "inner" || value === "outer"
    ? value
    : DEFAULT_BLAME_OPTIONS.detectMovements;
}

/** Read the options through an adapter, so this stays free of `vscode`. */
export function parseBlameOptions(
  get: (key: "ignoreWhitespace" | "detectMovements") => unknown,
): BlameOptions {
  const ignoreWhitespace = get("ignoreWhitespace");
  return {
    ignoreWhitespace:
      typeof ignoreWhitespace === "boolean"
        ? ignoreWhitespace
        : DEFAULT_BLAME_OPTIONS.ignoreWhitespace,
    detectMovements: parseDetectMovements(get("detectMovements")),
  };
}

/**
 * The `git blame` flags for the options.
 *
 * - `-w` ignores whitespace when comparing a line with its parent.
 * - `-M` follows lines moved within the file.
 * - `-C` (with `-M`) also follows lines moved or copied from other files that
 *   the same commit modified; it is the "outer" movement detection.
 */
export function blameFlags(options: BlameOptions): string[] {
  const flags: string[] = [];
  if (options.ignoreWhitespace) flags.push("-w");
  if (options.detectMovements !== "none") flags.push("-M");
  if (options.detectMovements === "outer") flags.push("-C");
  return flags;
}

export function blameOptionsKey(options: BlameOptions): string {
  return blameFlags(options).join(" ");
}

/**
 * A cached snapshot stays valid only for the options it was blamed with: the
 * same file blames differently under another option set. While the document
 * is dirty the saved-file snapshot is reused, since every keystroke bumps the
 * version but `git blame` only sees the saved file.
 */
export function isBlameSnapshotReusable(
  snapshot: { docVersion: number; optionsKey: string },
  current: { docVersion: number; isDirty: boolean; optionsKey: string },
): boolean {
  return (
    snapshot.optionsKey === current.optionsKey &&
    (snapshot.docVersion === current.docVersion || current.isDirty)
  );
}
