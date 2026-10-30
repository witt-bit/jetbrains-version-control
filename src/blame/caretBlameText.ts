import type { BlameLine } from "../git/types";

/** Cap on the ${message} part; longer summaries end with an ellipsis. */
export const CARET_BLAME_MAX_MESSAGE_CHARS = 50;
/** Cap on the ${hash} part. */
export const CARET_BLAME_MAX_HASH_CHARS = 8;

/** GitLens-style default template: `Who, 时间 * message`. */
// biome-ignore lint/suspicious/noTemplateCurlyInString: ${token} templates are the feature
export const CARET_BLAME_DEFAULT_FORMAT = "${who}, ${date} * ${message}";

export interface CaretBlameIdentity {
  name: string;
  email: string;
}

export interface CaretBlameRenderOptions {
  /** GitLens-style template with ${who} ${date} ${message} ${hash} tokens. */
  format?: string;
  /** Cap on the ${message} part; other parts are never truncated. */
  messageMaxLength?: number;
  /** The line is authored by the current committer — ${who} resolves to "You". */
  self?: boolean;
  /** Pre-formatted date replacing ${date}; defaults to the BlameLine's own. */
  dateLabel?: string;
}

/**
 * The end-of-line caret blame text, rendered from a GitLens-style template.
 * Pure so it is unit-testable without the vscode module. Called only for
 * committed lines — uncommitted (new) lines show no end-of-line blame at all.
 */
export function caretBlameText(
  line: BlameLine,
  options: CaretBlameRenderOptions = {},
): string {
  const {
    format = CARET_BLAME_DEFAULT_FORMAT,
    messageMaxLength = CARET_BLAME_MAX_MESSAGE_CHARS,
    self = false,
    dateLabel,
  } = options;

  const who = line.uncommitted || self ? "You" : line.authorName || "unknown";
  const date = dateLabel ?? (line.uncommitted ? "now" : line.authorDate);
  const rawMessage = line.uncommitted
    ? "uncommitted changes"
    : line.summary || line.shortHash;
  const message = truncate(rawMessage, messageMaxLength);
  const hash = truncate(line.shortHash, CARET_BLAME_MAX_HASH_CHARS);

  return (
    format
      // biome-ignore lint/suspicious/noTemplateCurlyInString: template tokens are the feature
      .replaceAll("${who}", who)
      // biome-ignore lint/suspicious/noTemplateCurlyInString: template tokens are the feature
      .replaceAll("${date}", date)
      // biome-ignore lint/suspicious/noTemplateCurlyInString: template tokens are the feature
      .replaceAll("${message}", message)
      // biome-ignore lint/suspicious/noTemplateCurlyInString: template tokens are the feature
      .replaceAll("${hash}", hash)
  );
}

/** Cut `text` down to `max` characters, ending with an ellipsis when cut. */
function truncate(text: string, max: number): string {
  if (max <= 0) {
    return "";
  }
  if (text.length > max) {
    return `${text.slice(0, max - 1)}…`;
  }
  return text;
}

/** Whether a blame line was authored by the given identity. */
export function isOwnCommit(
  line: BlameLine,
  identity: CaretBlameIdentity | undefined,
): boolean {
  if (line.uncommitted || !identity) {
    return false;
  }
  const email = line.authorEmail.toLowerCase();
  const name = line.authorName.toLowerCase();
  return (
    (!!identity.email && email === identity.email.toLowerCase()) ||
    (!!identity.name && name === identity.name.toLowerCase())
  );
}
