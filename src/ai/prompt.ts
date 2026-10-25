/**
 * Prompt construction for AI commit messages. Kept free of the `vscode`
 * module so the logic is unit-testable.
 */

/** Per-file cap on the diff text handed to the model. */
export const MAX_FILE_DIFF_CHARS = 8_000;
/** Total cap across all files, so one huge selection cannot blow the context. */
export const MAX_TOTAL_DIFF_CHARS = 32_000;
/** Reference commit subjects shown to the model as the style source. */
export const MAX_STYLE_SUBJECTS = 10;

/** Whose commits the style reference comes from. */
export type StyleSource = "author" | "repository";

export interface StyleReference {
  subjects: string[];
  source: StyleSource;
}

/** One checked file and the diff text the model should describe. */
export interface PromptFile {
  path: string;
  staged: boolean;
  status: string;
  diff: string;
}

/**
 * Compose the prompt for one generation. Pure and capped: each file's diff is
 * trimmed to `MAX_FILE_DIFF_CHARS` and the total to `MAX_TOTAL_DIFF_CHARS`, so
 * a huge selection degrades to "describe the first changes" instead of blowing
 * the model's context window.
 */
export function buildCommitPrompt(
  files: PromptFile[],
  style: StyleReference,
): string {
  const recentSubjects = style.subjects;
  const styleLines = recentSubjects
    .slice(0, MAX_STYLE_SUBJECTS)
    .map((s) => `  - ${s.replace(/\s+/g, " ").trim()}`)
    .join("\n");

  const sections: string[] = [];
  let budget = MAX_TOTAL_DIFF_CHARS;
  for (const file of files) {
    let diff = file.diff.trim();
    if (diff.length > MAX_FILE_DIFF_CHARS) {
      diff = `${diff.slice(0, MAX_FILE_DIFF_CHARS)}\n… (diff truncated)`;
    }
    if (budget <= 0) {
      sections.push(
        `--- file: ${file.path} (${file.staged ? "staged" : "unstaged"}, ${file.status}) ---\n(omitted: context budget exhausted)`,
      );
      continue;
    }
    if (diff.length > budget) {
      diff = `${diff.slice(0, budget)}\n… (diff truncated)`;
    }
    budget -= diff.length;
    sections.push(
      `--- file: ${file.path} (${file.staged ? "staged" : "unstaged"}, ${file.status}) ---\n${diff}`,
    );
  }

  return [
    "Write a git commit message for the changes below.",
    "",
    "Rules:",
    "- Reply with the commit message text ONLY — no markdown fences, no commentary.",
    "- First line: a concise subject, at most 72 characters, imperative mood.",
    "- Then (only if it adds value) a blank line and a short body explaining the why.",
    "- Describe ONLY the changes listed below; ignore anything not shown.",
    styleLines
      ? `- Match the phrasing style of the reference commits below, and WRITE IN THE SAME LANGUAGE they use:\n${styleLines}`
      : "- Write the message in English.",
    "",
    styleLines
      ? `Reference commits (${style.source === "author" ? "by the same author" : "most recent in this repository"}):`
      : "Reference commits:",
    "",
    "Changes:",
    sections.join("\n\n"),
  ].join("\n");
}
