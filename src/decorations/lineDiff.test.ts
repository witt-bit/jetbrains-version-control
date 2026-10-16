import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyLines } from "./lineDiff.ts";

describe("classifyLines", () => {
  it("marks a changed line as modified", () => {
    const base = ["line one", "line two", "line three"];
    const current = ["line one", "line two CHANGED", "line three"];
    assert.deepEqual(classifyLines(base, current), {
      added: [],
      modified: [1],
      deleted: [],
    });
  });

  it("merges an insertion adjacent to an edit into one modified block", () => {
    // No unchanged line separates the inserted lines from the edit, so the
    // diff pairs the removed `line two` with all three new lines: one
    // replacement block, painted blue as a whole — the same thing the editor's
    // own gutter does. The original bug (the run reading as added / green and
    // spreading) is gone: only the block itself is painted.
    const base = ["line one", "line two", "line three"];
    const current = [
      "line one",
      "NEW LINE A",
      "NEW LINE B",
      "line two CHANGED",
      "line three",
    ];
    assert.deepEqual(classifyLines(base, current), {
      added: [],
      modified: [1, 2, 3],
      deleted: [],
    });
  });

  it("keeps an edit blue when an insertion above it is separated by an unchanged line", () => {
    // The unchanged `line three` splits the two changes, so they classify
    // independently: the insertion reads as added, the edit as modified.
    const base = ["line one", "line two", "line three", "line four"];
    const current = [
      "line one",
      "NEW LINE A",
      "NEW LINE B",
      "line two",
      "line three",
      "line four CHANGED",
    ];
    assert.deepEqual(classifyLines(base, current), {
      added: [1, 2],
      modified: [5],
      deleted: [],
    });
  });

  it("keeps the classification when the edits sit in separate runs", () => {
    // Two independent replacement blocks; neither leaks into the untouched
    // `c`, `d` lines between them.
    const base = ["a", "b", "c", "d", "e"];
    const current = ["a", "X", "b CHANGED", "c", "d", "Y", "Z", "e CHANGED"];
    const result = classifyLines(base, current);
    assert.deepEqual(result.added, []);
    assert.deepEqual(result.modified, [1, 2, 5, 6, 7]);
    assert.deepEqual(result.deleted, []);
  });

  it("marks a pure insertion as added", () => {
    const base = ["a", "b"];
    const current = ["a", "INSERTED", "b"];
    assert.deepEqual(classifyLines(base, current), {
      added: [1],
      modified: [],
      deleted: [],
    });
  });

  it("marks a pure deletion on the line after the gap", () => {
    const base = ["a", "b", "c"];
    const current = ["a", "c"];
    assert.deepEqual(classifyLines(base, current), {
      added: [],
      modified: [],
      deleted: [1],
    });
  });

  it("clamps a deletion at the end of the file to the last line", () => {
    const base = ["a", "b", "c"];
    const current = ["a", "b"];
    assert.deepEqual(classifyLines(base, current), {
      added: [],
      modified: [],
      deleted: [1],
    });
  });

  it("marks every line of a replacement block as modified", () => {
    const base = ["a", "b", "c"];
    const current = ["a", "x", "y", "c"];
    assert.deepEqual(classifyLines(base, current), {
      added: [],
      modified: [1, 2],
      deleted: [],
    });
  });

  it("marks a new file as entirely added", () => {
    const result = classifyLines([], ["a", "b", "c"]);
    assert.deepEqual(result.added, [0, 1, 2]);
    assert.deepEqual(result.modified, []);
    assert.deepEqual(result.deleted, []);
  });

  it("reports nothing for identical texts", () => {
    const base = ["a", "b", "c"];
    assert.deepEqual(classifyLines(base, [...base]), {
      added: [],
      modified: [],
      deleted: [],
    });
  });

  it("reports nothing for two empty texts", () => {
    assert.deepEqual(classifyLines([], []), {
      added: [],
      modified: [],
      deleted: [],
    });
  });

  it("handles a file emptied down to one line", () => {
    const result = classifyLines(["a", "b", "c"], ["a"]);
    assert.deepEqual(result.added, []);
    assert.deepEqual(result.modified, []);
    assert.deepEqual(result.deleted, [0]);
  });

  it("joins an edit and its new lines when a blank line sits between them", () => {
    // Real-world shape (30-rockets.py): the diff keeps the unchanged blank as
    // context between the old lines and the rewritten ones, splitting one
    // replacement into a deletion and an insertion. The editor's own gutter
    // joins changes across blank separators, so the rewritten lines must read
    // as modified, not added.
    const base = ["}", "prod = blue", "prd = blue", "gray = hd", "", "# log"];
    const current = [
      "}",
      "",
      "prod = blue1",
      "prd = blue1",
      "gray = hd1",
      "1",
      "",
      "1",
      "# log",
    ];
    const result = classifyLines(base, current);
    assert.deepEqual(result.added, []);
    assert.deepEqual(result.modified, [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(result.deleted, []);
  });

  it("does not join changes separated by a content line", () => {
    // The unchanged separator carries real code, so the insertion and the
    // edit stay independent: green insertion, blue edit.
    const base = ["a", "b", "c", "d", "e"];
    const current = ["a", "b", "NEW1", "NEW2", "c", "d", "e CHANGED"];
    const result = classifyLines(base, current);
    assert.deepEqual(result.added, [2, 3]);
    assert.deepEqual(result.modified, [6]);
    assert.deepEqual(result.deleted, []);
  });

  it("does not join two small changes across a blank line", () => {
    // Both changes are below the size threshold, so a blank separator keeps
    // them apart: one insertion, one edit.
    const base = ["a", "b", "c"];
    const current = ["a", "NEW", "b", "c CHANGED"];
    const result = classifyLines(base, current);
    assert.deepEqual(result.added, [1]);
    assert.deepEqual(result.modified, [3]);
    assert.deepEqual(result.deleted, []);
  });

  it("treats an interleaved edit as one modified block", () => {
    // `old2, tail1` vs `ins, new2`: one removed run paired with one added run,
    // so the whole replacement reads as modified — no phantom deletion.
    const base = ["keep", "old1", "mid", "old2", "tail1", "tail2"];
    const current = ["keep", "new1", "mid", "ins", "new2", "tail2"];
    const result = classifyLines(base, current);
    assert.deepEqual(result.added, []);
    assert.deepEqual(result.modified, [1, 3, 4]);
    assert.deepEqual(result.deleted, []);
  });
});
