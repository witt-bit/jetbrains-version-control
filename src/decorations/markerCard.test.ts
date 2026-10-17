import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { changeBlocks } from "./lineDiff.ts";
import {
  blockAtLine,
  buildCard,
  committedContent,
  nextBlock,
  prevBlock,
  rollbackEdit,
} from "./markerCard.ts";

describe("changeBlocks", () => {
  it("pairs a removed+added run into one modified block", () => {
    const blocks = changeBlocks(["a", "b", "c"], ["a", "x", "y", "c"]);
    assert.equal(blocks.length, 1);
    assert.deepEqual(blocks[0], {
      baseStart: 1,
      baseCount: 1,
      curStart: 1,
      curCount: 2,
    });
  });

  it("splits a lone insertion and a lone deletion into two blocks", () => {
    const blocks = changeBlocks(["a", "old", "b", "c"], ["a", "b", "c", "new"]);
    assert.equal(blocks.length, 2);
    assert.deepEqual(blocks[0], {
      baseStart: 1,
      baseCount: 1,
      curStart: 1,
      curCount: 0,
    });
    assert.deepEqual(blocks[1], {
      baseStart: 4,
      baseCount: 0,
      curStart: 3,
      curCount: 1,
    });
  });
});

describe("blockAtLine", () => {
  const blocks = changeBlocks(
    ["a", "old", "b", "c", "d"],
    ["a", "x", "y", "b", "c", "d"],
  );

  it("finds a modified block by any line it spans", () => {
    const block = blockAtLine(blocks, 2);
    assert.ok(block);
    assert.equal(block.baseCount, 1);
    assert.equal(block.curCount, 2);
  });

  it("finds a deletion block on its anchor line", () => {
    const deleted = changeBlocks(["a", "gone", "b"], ["a", "b"]);
    const block = blockAtLine(deleted, 1);
    assert.ok(block);
    assert.equal(block.baseCount, 1);
    assert.equal(block.curCount, 0);
  });

  it("returns undefined on unchanged lines", () => {
    assert.equal(blockAtLine(blocks, 3), undefined);
  });
});

describe("block navigation", () => {
  const blocks = changeBlocks(
    ["a", "one", "b", "two", "c", "three", "d"],
    ["a", "1", "2", "b", "c", "3", "d"],
  );

  it("walks forward from an unchanged line", () => {
    const target = nextBlock(blocks, 0);
    assert.ok(target);
    assert.equal(target.curStart, 1);
  });

  it("walks backward from a block start", () => {
    const target = prevBlock(blocks, 5);
    assert.ok(target);
    assert.equal(target.curStart, 1);
  });

  it("wraps around at both ends", () => {
    const last = nextBlock(blocks, 5);
    assert.ok(last);
    assert.equal(last.curStart, 1);
    const first = prevBlock(blocks, 1);
    assert.ok(first);
    assert.equal(first.curStart, 5);
  });
});

describe("buildCard", () => {
  it("shows word-level pieces for a modified block", () => {
    const base = ["const value = compute(1);"];
    const now = ["const value = compute(42);"];
    const card = buildCard(changeBlocks(base, now)[0], base, now);
    assert.equal(card.state, "modified");
    assert.equal(card.lines.length, 2);
    assert.equal(card.lines[0].tone, "removed");
    // The removed line marks its old words as changed, the added line its new.
    const removedChanged = card.lines[0].pieces
      ?.filter((p) => p.changed)
      .map((p) => p.text)
      .join("");
    const addedChanged = card.lines[1].pieces
      ?.filter((p) => p.changed)
      .map((p) => p.text)
      .join("");
    assert.equal(removedChanged, "1");
    assert.equal(addedChanged, "42");
  });

  it("shows removed lines for a deletion and no lines for an insertion", () => {
    const deleted = buildCard(
      changeBlocks(["a", "gone", "b"], ["a", "b"])[0],
      ["a", "gone", "b"],
      ["a", "b"],
    );
    assert.equal(deleted.state, "deleted");
    assert.equal(deleted.lines.length, 1);
    assert.equal(deleted.lines[0].tone, "removed");

    const added = buildCard(
      changeBlocks(["a", "b"], ["a", "new", "b"])[0],
      ["a", "b"],
      ["a", "new", "b"],
    );
    assert.equal(added.state, "added");
    assert.equal(added.lines.length, 0);
  });

  it("reports a one-based line span", () => {
    const base = ["l0", "l1", "l2", "l3"];
    const now = ["l0", "x", "y", "l3"];
    const card = buildCard(changeBlocks(base, now)[0], base, now);
    assert.deepEqual([card.from, card.to], [2, 3]);
  });
});

describe("rollbackEdit", () => {
  it("replaces exactly the block's current span with its base lines", () => {
    const base = ["a", "old", "b"];
    const now = ["a", "x", "y", "b"];
    const edit = rollbackEdit(changeBlocks(base, now)[0], base);
    assert.deepEqual(edit, { start: 1, end: 3, replacement: ["old"] });
  });
});

describe("committedContent", () => {
  it("applies only this block to the HEAD content", () => {
    const base = ["a", "old", "b", "tail-old"];
    const now = ["a", "x", "y", "b", "tail-new"];
    const content = committedContent(changeBlocks(base, now)[0], base, now);
    assert.equal(content, "a\nx\ny\nb\ntail-old\n");
  });

  it("keeps the HEAD file's trailing newline decision", () => {
    const base = ["a", "old"];
    const now = ["a", "new"];
    const withNewline = committedContent(
      changeBlocks(base, now)[0],
      base,
      now,
      true,
    );
    const without = committedContent(
      changeBlocks(base, now)[0],
      base,
      now,
      false,
    );
    assert.equal(withNewline, "a\nnew\n");
    assert.equal(without, "a\nnew");
  });

  it("commits the whole buffer for a new file", () => {
    const now = ["hello", "world"];
    const block = { baseStart: 0, baseCount: 0, curStart: 0, curCount: 2 };
    assert.equal(committedContent(block, [], now), "hello\nworld\n");
  });
});
