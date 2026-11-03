/**
 * File-name helpers for exporting a commit as a patch. Kept free of the
 * `vscode` module so the rules are unit-testable.
 *
 * The previous implementation built the name straight from the commit subject
 * with no cap, so a long subject produced a name over the 255-byte filesystem
 * limit and `writeFileSync` threw ENAMETOOLONG.
 */

/** Cap on the subject-derived part of the file name. */
export const MAX_FILE_STEM_CHARS = 60;

/** Fallback when the subject contains nothing usable. */
const FALLBACK_STEM = "commit";

/**
 * Turn a commit subject into a portable filename stem: ASCII letters, digits,
 * dot, dash and underscore survive, every other run collapses to a single
 * underscore, and the result is trimmed and capped.
 */
export function safeFileStem(
  subject: string,
  max = MAX_FILE_STEM_CHARS,
): string {
  const cleaned = subject
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[_.-]+/, "")
    .replace(/[_.-]+$/, "");
  if (!cleaned) {
    return FALLBACK_STEM;
  }
  if (max <= 0) {
    return FALLBACK_STEM;
  }
  return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
}

/** `<short-hash>-<slug>.patch`, always short enough for any filesystem. */
export function patchFileName(shortHash: string, subject: string): string {
  return `${shortHash}-${safeFileStem(subject)}.patch`;
}
