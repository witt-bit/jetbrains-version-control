import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FileStatus } from "../git/types.ts";
import { normalizeRelative, relativeKey, stateOf } from "./statusColors.ts";

/** A porcelain entry with only the two status columns set. */
function entry(
  indexStatus: string,
  workTreeStatus: string,
  extra: Partial<FileStatus> = {},
): FileStatus {
  return {
    indexStatus,
    workTreeStatus,
    path: "src/app.ts",
    oldPath: undefined,
    ...extra,
  } as FileStatus;
}

describe("stateOf", () => {
  it("maps untracked and ignored", () => {
    assert.equal(stateOf(entry("?", " ")), "untracked");
    assert.equal(stateOf(entry("!", " ")), "ignored");
  });

  it("maps modified and staged changes", () => {
    assert.equal(stateOf(entry(" ", "M")), "modified");
    assert.equal(stateOf(entry("M", " ")), "modified");
  });

  it("maps a type change on either side to modified", () => {
    assert.equal(stateOf(entry("T", " ")), "modified");
    assert.equal(stateOf(entry(" ", "T")), "modified");
  });

  it("maps deletions and additions", () => {
    assert.equal(stateOf(entry("D", " ")), "deleted");
    assert.equal(stateOf(entry(" ", "D")), "deleted");
    assert.equal(stateOf(entry("A", " ")), "added");
  });

  it("treats a rename as added content", () => {
    assert.equal(stateOf(entry("R", " ", { oldPath: "src/old.ts" })), "added");
  });

  it("maps unmerged entries to conflict", () => {
    assert.equal(stateOf(entry("U", " ")), "conflict");
    assert.equal(stateOf(entry(" ", "U")), "conflict");
    assert.equal(stateOf(entry("A", "A")), "conflict");
    assert.equal(stateOf(entry("D", "D")), "conflict");
  });

  it("ignores clean entries", () => {
    assert.equal(stateOf(entry(" ", " ")), undefined);
  });
});

describe("relativeKey", () => {
  it("produces a repo-relative, slash-separated key", () => {
    assert.equal(relativeKey("/repo", "/repo/src/app.ts"), "src/app.ts");
  });
});

describe("normalizeRelative", () => {
  it("drops the trailing slash Git puts on directory entries", () => {
    assert.equal(normalizeRelative("dist/"), "dist");
    assert.equal(normalizeRelative("dist/app.js"), "dist/app.js");
  });
});
