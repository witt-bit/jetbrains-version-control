import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BlameLine } from "../git/types.ts";
import {
  CARET_BLAME_DEFAULT_FORMAT,
  CARET_BLAME_MAX_MESSAGE_CHARS,
  caretBlameText,
  isOwnCommit,
} from "./caretBlameText.ts";

function line(overrides: Partial<BlameLine> = {}): BlameLine {
  return {
    hash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
    shortHash: "a1b2c3d4",
    authorName: "Alice",
    authorEmail: "alice@x.com",
    authorTime: 1761350000,
    authorDate: "2026/10/25",
    lineNumber: 3,
    summary: "fix: guard against null user",
    uncommitted: false,
    ...overrides,
  };
}

describe("caretBlameText", () => {
  it("formats committed lines as Who, date * summary", () => {
    assert.equal(
      caretBlameText(line()),
      "Alice, 2026/10/25 * fix: guard against null user",
    );
  });

  it("falls back to the short hash when the commit has no summary", () => {
    const text = caretBlameText(line({ summary: undefined }));
    assert.equal(text, "Alice, 2026/10/25 * a1b2c3d4");
  });

  it("never leaves an empty author", () => {
    assert.equal(
      caretBlameText(line({ authorName: "" })),
      "unknown, 2026/10/25 * fix: guard against null user",
    );
  });

  it("shows You for the current committer's own commits", () => {
    const text = caretBlameText(line(), { self: true });
    assert.equal(text, "You, 2026/10/25 * fix: guard against null user");
  });

  it("renders the localized you label", () => {
    const text = caretBlameText(line(), { self: true, youLabel: "你" });
    assert.equal(text, "你, 2026/10/25 * fix: guard against null user");
  });

  it("caps the message at 50 characters with an ellipsis, prefix untouched", () => {
    const text = caretBlameText(line({ summary: "x".repeat(120) }), {
      self: true,
    });
    // "You, 2026/10/25 * " prefix is intact; the message is 50 chars total.
    assert.ok(text.startsWith("You, 2026/10/25 * "));
    const message = text.slice("You, 2026/10/25 * ".length);
    assert.equal(message.length, CARET_BLAME_MAX_MESSAGE_CHARS);
    assert.ok(message.endsWith("…"));
  });

  it("keeps a message at or under the cap untouched", () => {
    const summary = "s".repeat(CARET_BLAME_MAX_MESSAGE_CHARS);
    const text = caretBlameText(line({ summary }), { self: true });
    assert.ok(text.endsWith(summary));
    assert.ok(!text.endsWith("…"));
  });

  it("renders from a custom GitLens-style template", () => {
    const text = caretBlameText(line(), {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: template tokens are the feature
      format: "${message} — ${who} (${hash}, ${date})",
      messageMaxLength: Number.POSITIVE_INFINITY,
    });
    assert.equal(
      text,
      "fix: guard against null user — Alice (a1b2c3d4, 2026/10/25)",
    );
  });

  it("defaults to the Who, date * message format", () => {
    const text = caretBlameText(line(), { format: CARET_BLAME_DEFAULT_FORMAT });
    assert.equal(text, "Alice, 2026/10/25 * fix: guard against null user");
  });

  it("caps the hash token at 8 characters", () => {
    const text = caretBlameText(line({ summary: undefined }), {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: template tokens are the feature
      format: "${hash}",
      messageMaxLength: Number.POSITIVE_INFINITY,
    });
    assert.equal(text.length, 8);
  });

  it("honors a custom messageMaxLength with the default template", () => {
    const text = caretBlameText(line(), { messageMaxLength: 10 });
    assert.ok(text.startsWith("Alice, 2026/10/25 * "));
    const message = text.slice("Alice, 2026/10/25 * ".length);
    assert.equal(message.length, 10);
    assert.ok(message.endsWith("…"));
  });

  it("isOwnCommit matches email or name case-insensitively", () => {
    const identity = { name: "alice", email: "a@x.com" };
    assert.ok(isOwnCommit(line({ authorEmail: "A@X.com" }), identity));
    assert.ok(isOwnCommit(line({ authorName: "Alice" }), identity));
    assert.ok(!isOwnCommit(line({ authorName: "Bob" }), identity));
    assert.ok(!isOwnCommit(line({ uncommitted: true }), identity));
    assert.ok(!isOwnCommit(line(), undefined));
  });
});
