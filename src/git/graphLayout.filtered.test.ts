import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeGraphLayout } from "./graphLayout.ts";
import type { CommitNode } from "./types";

const commit = (hash: string, ...parents: string[]): CommitNode => ({
  hash,
  shortHash: hash,
  parents,
  authorName: "A",
  authorEmail: "a@example.com",
  authorDate: "2024-01-01T00:00:00Z",
  subject: hash,
  body: "",
  refs: [],
});

describe("computeGraphLayout under a filtered list", () => {
  it("ends the lane at a parent the filter removed", () => {
    // `m1` and `m2` match; their parents `x1`/`x2` do not.
    const { graphData, snapshot } = computeGraphLayout(
      [commit("m1", "x1"), commit("m2", "x2")],
      undefined,
      true,
    );
    assert.deepEqual(graphData.lanes.m1.lines, [
      {
        fromColumn: 0,
        toColumn: 0,
        toCommit: "x1",
        type: "straight",
        hiddenParent: true,
      },
    ]);
    assert.equal(graphData.lanes.m2.column, 0, "the freed lane is reused");
    assert.deepEqual(snapshot.activeLanes, []);
  });

  it("does not accumulate a lane per matching commit", () => {
    const page = Array.from({ length: 40 }, (_, i) =>
      commit(`m${i}`, `gone${i}`),
    );
    const { graphData } = computeGraphLayout(page, undefined, true);
    const columns = new Set(
      Object.values(graphData.lanes).map((l) => l.column),
    );
    assert.deepEqual([...columns], [0]);
  });

  it("keeps connecting commits that are all in the filtered list", () => {
    const { graphData } = computeGraphLayout(
      [commit("c", "b"), commit("b", "a"), commit("a")],
      undefined,
      true,
    );
    assert.equal(graphData.lanes.c.lines[0].hiddenParent, undefined);
    assert.equal(graphData.lanes.b.lines[0].hiddenParent, undefined);
    assert.deepEqual(graphData.lanes.a.lines, []);
  });

  it("hides only the missing parent of a merge", () => {
    const { graphData } = computeGraphLayout(
      [commit("merge", "b", "gone"), commit("b")],
      undefined,
      true,
    );
    const lines = graphData.lanes.merge.lines;
    assert.equal(lines[0].toCommit, "b");
    assert.equal(lines[0].hiddenParent, undefined);
    assert.equal(lines[1].toCommit, "gone");
    assert.equal(lines[1].hiddenParent, true);
  });

  it("keeps the lane open for a parent that is on a later page", () => {
    const later = new Set(["b"]);
    const first = computeGraphLayout(
      [commit("c", "b")],
      undefined,
      true,
      later,
    );
    assert.equal(first.graphData.lanes.c.lines[0].hiddenParent, undefined);
    assert.deepEqual(first.snapshot.activeLanes, ["b"]);

    const second = computeGraphLayout(
      [commit("b", "a"), commit("a")],
      first.snapshot,
      true,
    );
    assert.equal(second.graphData.lanes.b.column, 0);
    assert.equal(second.graphData.lanes.b.color, first.graphData.lanes.c.color);
  });

  it("treats an unlisted page-boundary parent as hidden", () => {
    const { graphData, snapshot } = computeGraphLayout(
      [commit("c", "b")],
      undefined,
      true,
    );
    assert.equal(graphData.lanes.c.lines[0].hiddenParent, true);
    assert.deepEqual(snapshot.activeLanes, []);
  });

  it("is unchanged when no filter is active", () => {
    const { graphData, snapshot } = computeGraphLayout([commit("c", "b")]);
    assert.equal(graphData.lanes.c.lines[0].hiddenParent, undefined);
    assert.deepEqual(snapshot.activeLanes, ["b"]);
  });
});
