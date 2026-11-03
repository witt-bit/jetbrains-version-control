import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_FILE_STEM_CHARS,
  patchFileName,
  safeFileStem,
} from "./exportFileName.ts";

describe("safeFileStem", () => {
  it("keeps simple ASCII subjects intact", () => {
    assert.equal(safeFileStem("Fix login redirect"), "Fix_login_redirect");
  });

  it("collapses punctuation runs into a single underscore", () => {
    assert.equal(
      safeFileStem("feat: add --force / --keep"),
      "feat_add_--force_--keep",
    );
  });

  it("trims leading and trailing separators", () => {
    assert.equal(safeFileStem("...Merge commit..."), "Merge_commit");
  });

  it("falls back when nothing usable remains", () => {
    assert.equal(safeFileStem(""), "commit");
    assert.equal(safeFileStem("中文提交"), "commit");
    assert.equal(safeFileStem("///"), "commit");
  });

  it("caps the stem so the file name stays under the filesystem limit", () => {
    const subject = "a".repeat(400);
    const stem = safeFileStem(subject);
    assert.equal(stem.length, MAX_FILE_STEM_CHARS);
  });
});

describe("patchFileName", () => {
  it("builds <short>-<slug>.patch", () => {
    assert.equal(
      patchFileName("5b4aaa9c", "Fix bug"),
      "5b4aaa9c-Fix_bug.patch",
    );
  });

  it("a 400-char subject still yields a short, valid file name", () => {
    const name = patchFileName("5b4aaa9c", "x".repeat(400));
    assert.ok(name.length < 100, `name too long: ${name.length}`);
    assert.ok(name.endsWith(".patch"));
    // ASCII only → byte length equals char length, well under 255.
    assert.match(name, /^[\x20-\x7e]+$/);
  });
});
