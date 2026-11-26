/**
 * The state of the Interactive Rebase dialog, kept free of React so the rules
 * (what can be moved, what is a legal list, what is sent to git) are testable.
 *
 * Rows are shown newest first, like the Git Log. Git's todo is oldest first,
 * so `toTodoEntries` is the one place that flips the order.
 */

export const REBASE_ACTIONS = [
  "pick",
  "reword",
  "edit",
  "squash",
  "fixup",
  "drop",
] as const;

export type RebaseAction = (typeof REBASE_ACTIONS)[number];

/** A commit as `getRebaseCommits` lists it, oldest first. */
export interface RebaseCommitInfo {
  hash: string;
  shortHash: string;
  subject: string;
  body: string;
  authorName: string;
  authorDate: string;
  action: RebaseAction;
  flag?: "-C" | "-c";
}

export interface RebaseRow {
  hash: string;
  shortHash: string;
  subject: string;
  body: string;
  authorName: string;
  authorDate: string;
  action: RebaseAction;
  flag?: "-C" | "-c";
  /** The edited message; undefined until the user types in a reword row. */
  message?: string;
}

/** One todo line as `interactiveRebase` expects it. */
export interface TodoEntryPayload {
  action: RebaseAction;
  hash: string;
  subject: string;
  message?: string;
  flag?: "-C" | "-c";
}

export interface RebaseOptions {
  onto: string;
  autosquash: boolean;
  keepEmpty: boolean;
  updateRefs: boolean;
  rebaseMerges: boolean;
}

export const DEFAULT_REBASE_OPTIONS: RebaseOptions = {
  onto: "",
  autosquash: false,
  keepEmpty: true,
  updateRefs: false,
  rebaseMerges: false,
};

/** Oldest-first commits become newest-first rows. */
export function toRows(commits: readonly RebaseCommitInfo[]): RebaseRow[] {
  return commits.map((commit) => ({ ...commit })).reverse();
}

export function originalMessage(
  row: Pick<RebaseRow, "subject" | "body">,
): string {
  return row.body ? `${row.subject}\n\n${row.body}` : row.subject;
}

/** What the reword box shows: the edit if there is one, else the message. */
export function messageOf(row: RebaseRow): string {
  return row.message ?? originalMessage(row);
}

function replaceAt(
  rows: readonly RebaseRow[],
  index: number,
  change: (row: RebaseRow) => RebaseRow,
): RebaseRow[] {
  return rows.map((row, i) => (i === index ? change(row) : row));
}

/** Swap a row with its neighbour; out-of-range moves leave the list alone. */
export function moveRow(
  rows: readonly RebaseRow[],
  index: number,
  delta: -1 | 1,
): RebaseRow[] {
  const target = index + delta;
  if (index < 0 || index >= rows.length) return [...rows];
  if (target < 0 || target >= rows.length) return [...rows];
  const next = [...rows];
  const moved = next[index];
  next[index] = next[target];
  next[target] = moved;
  return next;
}

export function setAction(
  rows: readonly RebaseRow[],
  index: number,
  action: RebaseAction,
): RebaseRow[] {
  return replaceAt(rows, index, (row) => {
    const next: RebaseRow = { ...row, action };
    // `fixup -C` only means something on a fixup.
    if (action !== "fixup") delete next.flag;
    // A message typed for a reword must not outlive the reword.
    if (action !== "reword") delete next.message;
    return next;
  });
}

export function setMessage(
  rows: readonly RebaseRow[],
  index: number,
  message: string,
): RebaseRow[] {
  return replaceAt(rows, index, (row) => ({ ...row, message }));
}

/**
 * Why the list cannot be rebased, or null when it can. Mirrors the rules the
 * host enforces: something to rebase, and no squash / fixup with no kept
 * commit before it.
 */
export function validateRows(rows: readonly RebaseRow[]): string | null {
  if (rows.length === 0) return "There are no commits to rebase.";
  const oldestKept = [...rows].reverse().find((row) => row.action !== "drop");
  if (
    oldestKept &&
    (oldestKept.action === "squash" || oldestKept.action === "fixup")
  ) {
    return `Cannot ${oldestKept.action} "${oldestKept.subject}": there is no earlier commit to combine it with.`;
  }
  return null;
}

/** Whether a reword row carries text that differs from the commit's own. */
function hasEditedMessage(row: RebaseRow): boolean {
  return (
    row.action === "reword" &&
    row.message !== undefined &&
    row.message.trim() !== "" &&
    row.message.trim() !== originalMessage(row).trim()
  );
}

/** The todo, oldest first, in the shape the host takes. */
export function toTodoEntries(rows: readonly RebaseRow[]): TodoEntryPayload[] {
  return [...rows].reverse().map((row) => {
    const entry: TodoEntryPayload = {
      action: row.action,
      hash: row.hash,
      subject: row.subject,
    };
    if (hasEditedMessage(row) && row.message !== undefined) {
      entry.message = row.message;
    }
    if (row.action === "fixup" && row.flag) entry.flag = row.flag;
    return entry;
  });
}

/** True when nothing differs from the commits as loaded. */
export function isUnchanged(
  rows: readonly RebaseRow[],
  commits: readonly RebaseCommitInfo[],
): boolean {
  const original = toRows(commits);
  return (
    rows.length === original.length &&
    rows.every(
      (row, i) =>
        row.hash === original[i].hash &&
        row.action === original[i].action &&
        !hasEditedMessage(row),
    )
  );
}

/** The git command the dialog will run, shown read-only under the options. */
export function describeCommand(
  options: RebaseOptions,
  base: { root: true } | { ref: string },
): string {
  const parts = ["git", "rebase", "--interactive"];
  if (options.autosquash) parts.push("--autosquash");
  parts.push(options.keepEmpty ? "--keep-empty" : "--no-keep-empty");
  if (options.updateRefs) parts.push("--update-refs");
  if (options.rebaseMerges) parts.push("--rebase-merges");
  const onto = options.onto.trim();
  if (onto) parts.push("--onto", onto);
  parts.push("root" in base ? "--root" : base.ref);
  return parts.join(" ");
}

export const ACTION_LABELS: Record<RebaseAction, string> = {
  pick: "Pick",
  reword: "Reword",
  edit: "Edit",
  squash: "Squash",
  fixup: "Fixup",
  drop: "Drop",
};
