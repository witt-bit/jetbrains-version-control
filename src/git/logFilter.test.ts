import assert from "node:assert/strict";
import * as path from "node:path";
import { describe, it } from "node:test";
import {
  buildLogFilterArgs,
  danglingParents,
  describeLogError,
  hasHistoryFilter,
  isTextFilterActive,
  normalizeLogPath,
  parseLogParams,
} from "./logFilter.ts";
import type { CommitNode } from "./types";

const commit = (hash: string, parents: string[] = []): CommitNode => ({
  hash,
  shortHash: hash.slice(0, 7),
  parents,
  authorName: "A",
  authorEmail: "a@example.com",
  authorDate: "2024-01-01T00:00:00Z",
  subject: hash,
  body: "",
  refs: [],
});

describe("buildLogFilterArgs", () => {
  it("adds nothing for an empty or blank text filter", () => {
    assert.deepEqual(buildLogFilterArgs({}), []);
    assert.deepEqual(buildLogFilterArgs({ search: "   " }), []);
    assert.equal(isTextFilterActive({ search: " \t" }), false);
  });

  it("matches literal, case-insensitive text by default", () => {
    assert.deepEqual(buildLogFilterArgs({ search: " fix(a) " }), [
      "--grep=fix(a)",
      "--fixed-strings",
      "--regexp-ignore-case",
    ]);
  });

  it("drops case-insensitivity for Match Case and switches to ERE for regex", () => {
    assert.deepEqual(buildLogFilterArgs({ search: "a|b", matchCase: true }), [
      "--grep=a|b",
      "--fixed-strings",
    ]);
    assert.deepEqual(buildLogFilterArgs({ search: "a|b", regex: true }), [
      "--grep=a|b",
      "--extended-regexp",
      "--regexp-ignore-case",
    ]);
    assert.deepEqual(
      buildLogFilterArgs({ search: "^fix", regex: true, matchCase: true }),
      ["--grep=^fix", "--extended-regexp"],
    );
  });

  it("leaves --author on git's own matching when there is no text filter", () => {
    assert.deepEqual(buildLogFilterArgs({ author: "Ann", regex: true }), [
      "--author=Ann",
    ]);
  });

  it("passes the date range through", () => {
    assert.deepEqual(buildLogFilterArgs({ since: "2024-01-01", until: "x" }), [
      "--since=2024-01-01",
      "--until=x",
    ]);
  });
});

describe("hasHistoryFilter", () => {
  it("is false for paging and revision options only", () => {
    assert.equal(
      hasHistoryFilter({ maxCount: 10, skip: 5, branch: "main" }),
      false,
    );
    assert.equal(hasHistoryFilter({ search: " " }), false);
  });

  it("is true for any filter that removes commits", () => {
    for (const options of [
      { search: "x" },
      { author: "x" },
      { since: "x" },
      { until: "x" },
      { file: "x" },
    ]) {
      assert.equal(hasHistoryFilter(options), true, JSON.stringify(options));
    }
  });
});

describe("normalizeLogPath", () => {
  const root = path.resolve("/work/repo");

  it("treats blank and the root itself as no path filter", () => {
    assert.equal(normalizeLogPath(root, undefined), undefined);
    assert.equal(normalizeLogPath(root, "  "), undefined);
    assert.equal(normalizeLogPath(root, "."), undefined);
    assert.equal(normalizeLogPath(root, root), undefined);
  });

  it("keeps relative paths and pathspec magic as typed", () => {
    assert.equal(normalizeLogPath(root, " src/a.ts "), "src/a.ts");
    assert.equal(normalizeLogPath(root, ":(glob)**/*.ts"), ":(glob)**/*.ts");
  });

  it("makes picker paths relative to the repository root", () => {
    assert.equal(
      normalizeLogPath(root, path.join(root, "src", "a.ts")),
      "src/a.ts",
    );
  });

  it("refuses a path outside the repository", () => {
    assert.throws(
      () => normalizeLogPath(root, path.resolve("/work/other/a.ts")),
      /outside the repository/,
    );
  });

  it("does not mistake a file named ..foo for a parent directory", () => {
    assert.equal(normalizeLogPath(root, path.join(root, "..foo")), "..foo");
  });

  it("converts Windows separators", () => {
    assert.equal(
      normalizeLogPath("C:\\repo", "C:\\repo\\src\\a.ts", path.win32),
      "src/a.ts",
    );
    assert.equal(
      normalizeLogPath("C:\\repo", "src\\a.ts", path.win32),
      "src/a.ts",
    );
  });
});

describe("danglingParents", () => {
  it("lists parents that are not in the page, once", () => {
    const page = [
      commit("c", ["b", "x"]),
      commit("b", ["a"]),
      commit("d", ["a"]),
    ];
    assert.deepEqual(danglingParents(page).sort(), ["a", "x"]);
    assert.deepEqual(danglingParents([commit("a")]), []);
  });
});

describe("parseLogParams", () => {
  it("reads the filter parameters and ignores everything else", () => {
    assert.deepEqual(
      parseLogParams({
        maxCount: 50,
        skip: 100,
        branch: "main",
        search: "fix",
        matchCase: true,
        regex: true,
        author: "ann",
        file: "src",
        since: "1 week ago",
        until: "yesterday",
        snapshot: {},
        query: "abc",
      }),
      {
        maxCount: 50,
        skip: 100,
        branch: "main",
        search: "fix",
        matchCase: true,
        regex: true,
        author: "ann",
        file: "src",
        since: "1 week ago",
        until: "yesterday",
      },
    );
  });

  it("accepts count as the page size and drops wrongly typed values", () => {
    assert.deepEqual(parseLogParams({ count: 25 }), { maxCount: 25 });
    assert.deepEqual(
      parseLogParams({
        maxCount: "10",
        skip: -1,
        branch: "",
        search: 5,
        file: null,
        matchCase: "true",
        regex: 1,
      }),
      {},
    );
  });
});

describe("describeLogError", () => {
  it("rewrites git's invalid-pattern message", () => {
    const err = Object.assign(new Error("Command failed"), {
      stderr: "fatal: command line, '(': parentheses not balanced\n",
    });
    assert.equal(
      describeLogError(err).message,
      "Invalid regular expression: parentheses not balanced",
    );
  });

  it("passes other failures through", () => {
    const err = new Error("boom");
    assert.equal(describeLogError(err), err);
    assert.equal(describeLogError("text").message, "text");
  });
});
