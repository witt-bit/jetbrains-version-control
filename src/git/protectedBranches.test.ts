import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PROTECTED_BRANCHES,
  forcePushRefusal,
  isProtectedBranch,
  parseProtectedBranches,
  remoteBranchShortName,
} from "./protectedBranches.ts";

describe("isProtectedBranch", () => {
  it("matches whole names, not prefixes or substrings", () => {
    assert.equal(isProtectedBranch("main", ["main"]), true);
    assert.equal(isProtectedBranch("main-2", ["main"]), false);
    assert.equal(isProtectedBranch("domain", ["main"]), false);
    assert.equal(isProtectedBranch("feature/main", ["main"]), false);
  });

  it("expands * to any run of characters, slashes included", () => {
    assert.equal(isProtectedBranch("release/1.0", ["release/*"]), true);
    assert.equal(isProtectedBranch("release/1.0/hotfix", ["release/*"]), true);
    assert.equal(isProtectedBranch("release", ["release/*"]), false);
    assert.equal(isProtectedBranch("hotfix-prod", ["*-prod"]), true);
    assert.equal(isProtectedBranch("anything", ["*"]), true);
  });

  it("treats every other character in a pattern literally", () => {
    assert.equal(isProtectedBranch("v1.0", ["v1.0"]), true);
    assert.equal(isProtectedBranch("v1x0", ["v1.0"]), false);
    assert.equal(isProtectedBranch("a(b)", ["a(b)"]), true);
    assert.equal(isProtectedBranch("a+b", ["a+b"]), true);
    assert.equal(isProtectedBranch("ab", ["a+b"]), false);
  });

  it("is case-sensitive", () => {
    assert.equal(isProtectedBranch("Main", ["main"]), false);
  });

  it("ignores blank patterns instead of protecting everything", () => {
    assert.equal(isProtectedBranch("feature", ["", "   "]), false);
    assert.equal(isProtectedBranch("feature", []), false);
  });

  it("never protects an empty name", () => {
    assert.equal(isProtectedBranch("", ["*"]), false);
  });

  it("trims whitespace around a pattern", () => {
    assert.equal(isProtectedBranch("main", ["  main  "]), true);
  });
});

describe("parseProtectedBranches", () => {
  it("falls back to main and master when the value is not an array", () => {
    for (const value of [undefined, null, "main", 3, {}]) {
      assert.deepEqual(parseProtectedBranches(value), [
        ...DEFAULT_PROTECTED_BRANCHES,
      ]);
    }
  });

  it("keeps an explicit empty list: the user turned protection off", () => {
    assert.deepEqual(parseProtectedBranches([]), []);
  });

  it("drops non-strings and blanks and trims the rest", () => {
    assert.deepEqual(
      parseProtectedBranches([" develop ", "", 7, null, "release/*"]),
      ["develop", "release/*"],
    );
  });
});

describe("remoteBranchShortName", () => {
  it("strips the remote, keeping slashes inside the branch name", () => {
    assert.equal(remoteBranchShortName("origin/main"), "main");
    assert.equal(remoteBranchShortName("origin/feature/x"), "feature/x");
    assert.equal(remoteBranchShortName("main"), "main");
  });
});

describe("forcePushRefusal", () => {
  it("explains the refusal for a protected target only", () => {
    const refusal = forcePushRefusal("main", ["main"]);
    assert.match(refusal ?? "", /protected branch "main"/);
    assert.match(refusal ?? "", /jgc\.protectedBranches/);
    assert.equal(forcePushRefusal("feature", ["main"]), undefined);
  });
});
