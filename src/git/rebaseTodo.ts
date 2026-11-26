/**
 * Pure model of git's `git-rebase-todo` file and of the commit list an
 * interactive-rebase dialog edits. Free of `vscode` and of any I/O so it can be
 * unit-tested.
 *
 * Two layers:
 * - `TodoLine` / `parseTodo` / `serializeTodo` mirror the file git reads
 *   (every command, abbreviations, comments).
 * - `RebaseEntry` / `planTodo` / `autosquashEntries` are the editable commit
 *   list. `planTodo` turns it into a todo plus the message files its reword
 *   entries need.
 */

export type CommitAction =
  | "pick"
  | "reword"
  | "edit"
  | "squash"
  | "fixup"
  | "drop";

export const COMMIT_ACTIONS: readonly CommitAction[] = [
  "pick",
  "reword",
  "edit",
  "squash",
  "fixup",
  "drop",
];

export type TodoLine =
  | {
      kind: "commit";
      action: CommitAction;
      hash: string;
      subject: string;
      /** `fixup -C` / `fixup -c`: use this commit's message for the result. */
      flag?: "-C" | "-c";
    }
  | { kind: "exec"; command: string }
  | { kind: "break" }
  | { kind: "label"; name: string }
  | { kind: "reset"; name: string }
  | {
      kind: "merge";
      label: string;
      commit?: { flag: "-C" | "-c"; hash: string };
      subject?: string;
    }
  | { kind: "update-ref"; ref: string }
  | { kind: "noop" }
  | { kind: "comment"; text: string }
  | { kind: "blank" }
  | { kind: "unknown"; raw: string };

const COMMAND_NAMES: Record<string, string> = {
  p: "pick",
  pick: "pick",
  r: "reword",
  reword: "reword",
  e: "edit",
  edit: "edit",
  s: "squash",
  squash: "squash",
  f: "fixup",
  fixup: "fixup",
  d: "drop",
  drop: "drop",
  x: "exec",
  exec: "exec",
  b: "break",
  break: "break",
  l: "label",
  label: "label",
  t: "reset",
  reset: "reset",
  m: "merge",
  merge: "merge",
  u: "update-ref",
  "update-ref": "update-ref",
  noop: "noop",
};

function isCommitAction(name: string): name is CommitAction {
  return (COMMIT_ACTIONS as readonly string[]).includes(name);
}

/** One todo line. Tolerant: anything it does not understand stays `unknown`. */
export function parseTodoLine(rawLine: string): TodoLine {
  const line = rawLine.replace(/\r$/, "");
  const trimmed = line.trim();
  if (trimmed === "") return { kind: "blank" };
  if (trimmed.startsWith("#")) return { kind: "comment", text: trimmed };

  const match = /^(\S+)(?:\s+(.*))?$/.exec(trimmed);
  const command = match?.[1] ? COMMAND_NAMES[match[1]] : undefined;
  const rest = (match?.[2] ?? "").trim();
  if (!command) return { kind: "unknown", raw: line };

  if (isCommitAction(command)) {
    const parts = /^(?:(-[Cc])\s+)?(\S+)(?:\s+(.*))?$/.exec(rest);
    if (!parts?.[2]) return { kind: "unknown", raw: line };
    const flag = parts[1] as "-C" | "-c" | undefined;
    if (flag && command !== "fixup") return { kind: "unknown", raw: line };
    const result: TodoLine = {
      kind: "commit",
      action: command,
      hash: parts[2],
      subject: parts[3]?.trim() ?? "",
    };
    if (flag) result.flag = flag;
    return result;
  }

  switch (command) {
    case "exec":
      return rest
        ? { kind: "exec", command: rest }
        : { kind: "unknown", raw: line };
    case "break":
      return rest ? { kind: "unknown", raw: line } : { kind: "break" };
    case "noop":
      return { kind: "noop" };
    case "label":
      return rest
        ? { kind: "label", name: rest }
        : { kind: "unknown", raw: line };
    case "reset":
      return rest
        ? { kind: "reset", name: rest }
        : { kind: "unknown", raw: line };
    case "update-ref":
      return rest
        ? { kind: "update-ref", ref: rest }
        : { kind: "unknown", raw: line };
    case "merge": {
      const parts = /^(?:(-[Cc])\s+(\S+)\s+)?(\S+)(?:\s+#\s*(.*))?$/.exec(rest);
      if (!parts?.[3]) return { kind: "unknown", raw: line };
      const result: TodoLine = { kind: "merge", label: parts[3] };
      if (parts[1] && parts[2]) {
        result.commit = { flag: parts[1] as "-C" | "-c", hash: parts[2] };
      }
      if (parts[4]) result.subject = parts[4].trim();
      return result;
    }
    default:
      return { kind: "unknown", raw: line };
  }
}

export function parseTodo(text: string): TodoLine[] {
  const rows = text.split(/\r?\n/);
  // A trailing newline is a terminator, not an extra blank line.
  if (rows[rows.length - 1] === "") rows.pop();
  return rows.map(parseTodoLine);
}

function oneLine(value: string): string {
  return value.replace(/\s*[\r\n]+\s*/g, " ").trim();
}

function requireOneLine(value: string, what: string): string {
  if (/[\r\n]/.test(value)) {
    throw new Error(`The ${what} must be a single line.`);
  }
  return value;
}

export function serializeTodoLine(line: TodoLine): string {
  switch (line.kind) {
    case "commit": {
      const subject = oneLine(line.subject);
      return [
        line.action,
        line.flag,
        requireOneLine(line.hash, "commit id"),
        subject || undefined,
      ]
        .filter((part) => part !== undefined)
        .join(" ");
    }
    case "exec":
      return `exec ${requireOneLine(line.command, "exec command")}`;
    case "break":
      return "break";
    case "label":
      return `label ${requireOneLine(line.name, "label")}`;
    case "reset":
      return `reset ${requireOneLine(line.name, "label")}`;
    case "merge": {
      const subject = line.subject ? oneLine(line.subject) : "";
      return [
        "merge",
        line.commit
          ? `${line.commit.flag} ${requireOneLine(line.commit.hash, "commit id")}`
          : undefined,
        requireOneLine(line.label, "label"),
        subject ? `# ${subject}` : undefined,
      ]
        .filter((part) => part !== undefined)
        .join(" ");
    }
    case "update-ref":
      return `update-ref ${requireOneLine(line.ref, "ref")}`;
    case "noop":
      return "noop";
    case "comment":
      return requireOneLine(line.text, "comment");
    case "blank":
      return "";
    case "unknown":
      return requireOneLine(line.raw, "todo line");
  }
}

export function serializeTodo(lines: TodoLine[]): string {
  if (lines.length === 0) return "";
  return `${lines.map(serializeTodoLine).join("\n")}\n`;
}

// ─── The editable commit list ───────────────────────────────────────────

export interface RebaseEntry {
  action: CommitAction;
  /** Full commit id. */
  hash: string;
  subject: string;
  /**
   * The message the rewritten commit should carry. On a reword entry it
   * replaces the commit's message; on a pick or edit entry it does too.
   * `squash` and `fixup` entries ignore it. When the entry heads a squash
   * group the new message applies to the whole squashed commit.
   */
  message?: string;
  /** `fixup -C` / `fixup -c`, as `amend!` commits produce. */
  flag?: "-C" | "-c";
}

const HASH_PATTERN = /^[0-9a-f]{7,64}$/i;

/** Why an entry list cannot be rebased as written, or undefined when it can. */
export function validateEntries(entries: RebaseEntry[]): string | undefined {
  if (entries.length === 0) return "There are no commits to rebase.";
  for (const entry of entries) {
    if (!isCommitAction(entry.action)) {
      return `Unknown rebase action "${String(entry.action)}".`;
    }
    if (!HASH_PATTERN.test(entry.hash)) {
      return `"${entry.hash}" is not a commit id.`;
    }
  }
  const firstKept = entries.find((entry) => entry.action !== "drop");
  if (firstKept && isMeldAction(firstKept.action)) {
    return `Cannot ${firstKept.action} the first commit: there is no earlier commit to meld it into.`;
  }
  return undefined;
}

export function isMeldAction(action: CommitAction): boolean {
  return action === "squash" || action === "fixup";
}

/**
 * Quote `value` for `sh`. Git runs todo `exec` lines and editor commands
 * through `sh` on every platform (Git for Windows ships one), and a Windows
 * path is only safe there with forward slashes.
 */
export function shellQuote(
  value: string,
  platform: string = process.platform,
): string {
  const normalized = platform === "win32" ? value.replace(/\\/g, "/") : value;
  return `'${normalized.replace(/'/g, `'\\''`)}'`;
}

/** The `git commit` that gives the commit just picked its new message. */
export function amendCommand(messagePath: string, platform?: string): string {
  // --no-verify matches git's own reword, which does not run commit hooks.
  return `git commit --amend --only --no-verify --allow-empty --cleanup=whitespace -F ${shellQuote(messagePath, platform)}`;
}

export interface PlannedTodo {
  text: string;
  /** Files the todo refers to; the caller must write them before git runs. */
  messages: { path: string; content: string }[];
}

/**
 * Turn the edited commit list into a todo.
 *
 * Git's own `reword` opens an editor, which cannot be scripted for a
 * particular commit and would not survive a conflict that is resolved later
 * (the continue happens in a different process). A new message is therefore
 * written as `pick` plus an `exec git commit --amend -F <file>` line, which
 * lives in the todo and works across `rebase --continue`. For a squash group
 * the amend goes after the group's last member so it sets the final message.
 *
 * `refsByHash` lists branches that point at a commit. Git adds
 * `update-ref` lines for them itself, but only to a todo it generated, so a
 * replaced todo has to carry them: each branch moves once the commit's group
 * is finished, to wherever that commit ended up.
 */
export function planTodo(
  entries: RebaseEntry[],
  messagePathFor: (index: number) => string,
  options: {
    platform?: string;
    refsByHash?: ReadonlyMap<string, readonly string[]>;
  } = {},
): PlannedTodo {
  const problem = validateEntries(entries);
  if (problem) throw new Error(problem);

  const lines: TodoLine[] = [];
  const messages: PlannedTodo["messages"] = [];
  let pendingMessage: string | undefined;
  let pendingRefs: string[] = [];

  const flushGroup = () => {
    if (pendingMessage !== undefined) {
      const path = messagePathFor(messages.length);
      messages.push({ path, content: pendingMessage });
      lines.push({
        kind: "exec",
        command: amendCommand(path, options.platform),
      });
      pendingMessage = undefined;
    }
    for (const ref of pendingRefs) lines.push({ kind: "update-ref", ref });
    pendingRefs = [];
  };

  for (const entry of entries) {
    const base: TodoLine = {
      kind: "commit",
      action: entry.action,
      hash: entry.hash,
      subject: entry.subject,
    };
    if (entry.action === "drop") {
      lines.push(base);
    } else if (isMeldAction(entry.action)) {
      if (entry.flag && entry.action === "fixup") base.flag = entry.flag;
      lines.push(base);
    } else {
      flushGroup();
      if (entry.message !== undefined) {
        pendingMessage = entry.message;
        if (entry.action === "reword") base.action = "pick";
      }
      lines.push(base);
    }
    pendingRefs.push(
      ...(options.refsByHash?.get(entry.hash.toLowerCase()) ?? []),
    );
  }
  flushGroup();

  return { text: serializeTodo(lines), messages };
}

// ─── Autosquash ─────────────────────────────────────────────────────────

const FIXUP_PREFIX = /^(fixup|squash|amend)! /;

/** `fixup! fixup! Add parser` -> its kind and the subject it points at. */
function parseFixupSubject(
  subject: string,
): { kind: "fixup" | "squash" | "amend"; target: string } | undefined {
  const first = FIXUP_PREFIX.exec(subject);
  if (!first?.[1]) return undefined;
  let target = subject.slice(first[0].length);
  while (FIXUP_PREFIX.test(target)) {
    target = target.replace(FIXUP_PREFIX, "");
  }
  return { kind: first[1] as "fixup" | "squash" | "amend", target };
}

function findAutosquashTarget(
  entries: RebaseEntry[],
  before: number,
  target: string,
): number {
  if (HASH_PATTERN.test(target)) {
    const lowered = target.toLowerCase();
    for (let j = 0; j < before; j++) {
      if (entries[j]?.hash.toLowerCase().startsWith(lowered)) return j;
    }
  }
  const candidates = [];
  for (let j = 0; j < before; j++) {
    const entry = entries[j];
    if (entry && !FIXUP_PREFIX.test(entry.subject)) candidates.push(j);
  }
  const exact = candidates.find((j) => entries[j]?.subject === target);
  if (exact !== undefined) return exact;
  return candidates.find((j) => entries[j]?.subject.startsWith(target)) ?? -1;
}

/**
 * What `git rebase --autosquash` does to the todo: every `fixup!`, `squash!`
 * and `amend!` commit moves right behind the commit it names and becomes a
 * fixup or squash. Only `pick` entries are moved; the rest are left alone.
 * Commits whose target is not in the list stay where they are.
 */
export function autosquashEntries(entries: RebaseEntry[]): RebaseEntry[] {
  const attachedTo: number[] = entries.map(() => -1);
  const attached = new Map<number, number[]>();
  const converted = entries.map((entry) => ({ ...entry }));

  entries.forEach((entry, i) => {
    if (entry.action !== "pick") return;
    const parsed = parseFixupSubject(entry.subject);
    if (!parsed) return;
    let target = findAutosquashTarget(entries, i, parsed.target);
    if (target < 0) return;
    // A fixup of a fixup joins the group of the commit that one belongs to.
    while ((attachedTo[target] ?? -1) >= 0) target = attachedTo[target] ?? -1;

    attachedTo[i] = target;
    attached.set(target, [...(attached.get(target) ?? []), i]);
    const moved = converted[i];
    if (!moved) return;
    if (parsed.kind === "squash") {
      moved.action = "squash";
    } else {
      moved.action = "fixup";
      if (parsed.kind === "amend") moved.flag = "-C";
    }
  });

  const result: RebaseEntry[] = [];
  converted.forEach((entry, i) => {
    if ((attachedTo[i] ?? -1) >= 0) return;
    result.push(entry);
    for (const member of attached.get(i) ?? []) {
      const moved = converted[member];
      if (moved) result.push(moved);
    }
  });
  return result;
}
