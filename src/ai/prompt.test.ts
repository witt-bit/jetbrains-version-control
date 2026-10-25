import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCommitPrompt,
  MAX_FILE_DIFF_CHARS,
  MAX_TOTAL_DIFF_CHARS,
  type PromptFile,
} from "./prompt.ts";

function file(overrides: Partial<PromptFile> = {}): PromptFile {
  return {
    path: "src/a.ts",
    staged: false,
    status: "modified",
    diff: "@@ -1 +1 @@\n-old\n+new",
    ...overrides,
  };
}

describe("buildCommitPrompt", () => {
  it("includes the checked file's path, staging state and diff", () => {
    const prompt = buildCommitPrompt(
      [file({ path: "中文/文档.md", staged: true, status: "added" })],
      { subjects: [], source: "repository" },
    );
    assert.ok(prompt.includes("--- file: 中文/文档.md (staged, added) ---"));
    assert.ok(prompt.includes("+new"));
  });

  it("lists recent commit subjects as the style reference", () => {
    const prompt = buildCommitPrompt([file()], {
      subjects: ["fix: a", "feat: b"],
      source: "author",
    });
    assert.ok(prompt.includes("- fix: a"));
    assert.ok(prompt.includes("- feat: b"));
  });

  it("falls back to an English instruction when there is no history", () => {
    const prompt = buildCommitPrompt([file()], {
      subjects: [],
      source: "repository",
    });
    assert.ok(prompt.includes("Write the message in English."));
  });

  it("caps a single file's diff at the per-file limit", () => {
    const prompt = buildCommitPrompt(
      [file({ diff: "x".repeat(MAX_FILE_DIFF_CHARS + 500) })],
      { subjects: [], source: "repository" },
    );
    assert.ok(prompt.includes("(diff truncated)"));
    assert.ok(!prompt.includes("x".repeat(MAX_FILE_DIFF_CHARS + 500)));
  });

  it("omits files once the total budget is exhausted, keeping the header", () => {
    // Each big file is first truncated to MAX_FILE_DIFF_CHARS, so it takes
    // ceil(MAX_TOTAL_DIFF_CHARS / MAX_FILE_DIFF_CHARS) files to exhaust the
    // total budget and push the next one into the omitted branch.
    const bigCount = Math.ceil(MAX_TOTAL_DIFF_CHARS / MAX_FILE_DIFF_CHARS);
    const bigs = Array.from({ length: bigCount }, (_, i) =>
      file({
        path: `big-${i}.ts`,
        diff: "y".repeat(MAX_FILE_DIFF_CHARS + 500),
      }),
    );
    const prompt = buildCommitPrompt(
      [...bigs, file({ path: "small.ts", diff: "z" })],
      { subjects: [], source: "repository" },
    );
    assert.ok(prompt.includes("--- file: small.ts (unstaged, modified) ---"));
    assert.ok(prompt.includes("(diff truncated)"));
    assert.ok(prompt.includes("(omitted: context budget exhausted)"));
    assert.ok(!prompt.includes("modified) ---\nz"));
  });

  it("trims whitespace inside style subjects", () => {
    const prompt = buildCommitPrompt([file()], {
      subjects: ["fix:  broken\nmulti line"],
      source: "author",
    });
    assert.ok(prompt.includes("- fix: broken multi line"));
  });

  it("labels the style source: author vs repository fallback", () => {
    const byAuthor = buildCommitPrompt([file()], {
      subjects: ["fix: a"],
      source: "author",
    });
    assert.ok(byAuthor.includes("Reference commits (by the same author):"));
    assert.ok(byAuthor.includes("WRITE IN THE SAME LANGUAGE"));

    const byRepo = buildCommitPrompt([file()], {
      subjects: ["fix: a"],
      source: "repository",
    });
    assert.ok(
      byRepo.includes("Reference commits (most recent in this repository):"),
    );
  });
});
