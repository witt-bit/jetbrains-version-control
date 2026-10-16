import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lineSimilarity, pairEdits } from "./editPairing.ts";

// A diff chunk that replaces lines and adds others is one edit wrapped in
// insertions: the edited statement must come out "modified" and the inserted
// blank lines must read as pure additions (green, not blue).

describe("pairEdits", () => {
  it("keeps the edit on the statement and reads inserted blanks as additions", () => {
    // The reported case: an import line rewritten, with blank lines added
    // around it inside the same chunk.
    const oldLines = ["import json1"];
    const newLines = ["", "import json", "", ""];
    assert.deepEqual(pairEdits(oldLines, newLines), [
      false,
      true,
      false,
      false,
    ]);
  });

  it("pairs by position when nothing is similar", () => {
    const oldLines = ["a()", "b()", "c()"];
    const newLines = ["x()", "y()", "z()", ""];
    // Three pairs for three old lines; the extra line is an addition.
    assert.deepEqual(pairEdits(oldLines, newLines), [true, true, true, false]);
  });

  it("marks fewer lines than the chunk when old lines run out", () => {
    const oldLines = ["keep = 1"];
    const newLines = ["keep = 1", "", "", ""];
    assert.deepEqual(pairEdits(oldLines, newLines), [
      true,
      false,
      false,
      false,
    ]);
  });

  it("does not let a blank line steal the match of a real edit", () => {
    // Two blank lines in the chunk: greedy pairing by raw similarity would take
    // the (blank, blank) pair first and then force the edit onto leftovers.
    const oldLines = ["value = 1", ""];
    const newLines = ["value = 2", "", ""];
    const isEdit = pairEdits(oldLines, newLines);
    assert.equal(isEdit[0], true, "the edited statement is modified");
    // The blank that pairs with the old blank keeps its own position; the
    // inserted one is an addition.
    assert.equal(isEdit.filter(Boolean).length, 2);
    assert.equal(isEdit[2], false, "the inserted blank is an addition");
  });

  it("falls back to positional pairing for huge chunks", () => {
    const oldLines = new Array(80).fill("old line");
    const newLines = new Array(90).fill("new line");
    const isEdit = pairEdits(oldLines, newLines);
    assert.equal(isEdit.filter(Boolean).length, 80);
    assert.deepEqual(isEdit.slice(80), new Array(10).fill(false));
  });
});

describe("lineSimilarity", () => {
  it("scores an edited line near 1", () => {
    assert.ok(lineSimilarity("value = 1", "value = 2") > 0.5);
  });

  it("scores unrelated lines near 0", () => {
    // Only the shared "a" of "alpha"/"beta" counts, and it is the last
    // character, so it lands in the suffix.
    assert.ok(lineSimilarity("alpha", "beta") < 0.5);
    assert.equal(lineSimilarity("print(x)", "return y"), 0);
  });

  it("scores identical blank lines as identical", () => {
    assert.equal(lineSimilarity("", ""), 1);
    assert.equal(lineSimilarity("", "x"), 0);
  });
});
