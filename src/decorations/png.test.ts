import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseHex, solidColorPng } from "./png.ts";

describe("parseHex", () => {
  it("parses #rrggbb", () => {
    assert.deepEqual(parseHex("#6bae71"), [107, 174, 113]);
  });

  it("expands #rgb", () => {
    assert.deepEqual(parseHex("#abc"), [170, 187, 204]);
  });

  it("tolerates surrounding whitespace and case", () => {
    assert.deepEqual(parseHex("  #6BAE71 "), [107, 174, 113]);
  });

  it("rejects anything else", () => {
    assert.equal(parseHex(undefined), undefined);
    assert.equal(parseHex("red"), undefined);
    assert.equal(parseHex("#12345"), undefined);
  });
});

describe("solidColorPng", () => {
  it("writes a PNG signature", () => {
    const png = solidColorPng(1, 1, "#6bae71");
    assert.deepEqual(
      [...png.subarray(0, 8)],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    );
  });

  it("accepts the transparent keyword", () => {
    assert.ok(solidColorPng(1, 1, "transparent").length > 0);
  });
});
