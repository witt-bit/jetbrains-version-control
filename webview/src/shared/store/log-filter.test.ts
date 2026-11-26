import { describe, expect, it } from "vitest";
import {
  buildLogParams,
  hasLogFilter,
  isAbsolutePath,
  isRegexFilterInvalid,
  type LogQueryFilter,
  pathMatchesFilter,
  sameLogParams,
  toRepoRelativePath,
} from "./log-filter";

const empty: LogQueryFilter = {
  searchQuery: "",
  matchCase: false,
  regex: false,
  branch: "",
  file: "",
};

describe("buildLogParams", () => {
  it("is empty without filters", () => {
    expect(buildLogParams(empty)).toEqual({});
  });

  it("trims the text and only sends toggles that are on", () => {
    expect(buildLogParams({ ...empty, searchQuery: "  fix  " })).toEqual({
      search: "fix",
    });
    expect(
      buildLogParams({
        ...empty,
        searchQuery: "fix",
        matchCase: true,
        regex: true,
      }),
    ).toEqual({ search: "fix", matchCase: true, regex: true });
  });

  it("does not send toggles without text", () => {
    expect(buildLogParams({ ...empty, matchCase: true, regex: true })).toEqual(
      {},
    );
  });

  it("combines text, path and branch", () => {
    expect(
      buildLogParams({
        ...empty,
        searchQuery: "fix",
        file: "src/git",
        branch: "main",
      }),
    ).toEqual({ search: "fix", file: "src/git", branch: "main" });
  });

  it("keeps the previous text params while the regex does not compile", () => {
    const previous = { search: "fix", regex: true, file: "old" };
    expect(
      buildLogParams(
        { ...empty, searchQuery: "fix(", regex: true, file: "src" },
        previous,
      ),
    ).toEqual({ search: "fix", regex: true, file: "src" });
  });

  it("drops the text params when there was none before an invalid regex", () => {
    expect(
      buildLogParams({ ...empty, searchQuery: "(", regex: true }, {}),
    ).toEqual({});
  });

  it("treats the same text as literal when Regex is off", () => {
    expect(buildLogParams({ ...empty, searchQuery: "(" })).toEqual({
      search: "(",
    });
  });
});

describe("isRegexFilterInvalid", () => {
  it("flags only a regex that does not compile", () => {
    expect(isRegexFilterInvalid({ searchQuery: "(", regex: true })).toBe(true);
    expect(isRegexFilterInvalid({ searchQuery: "(", regex: false })).toBe(
      false,
    );
    expect(isRegexFilterInvalid({ searchQuery: "a|b", regex: true })).toBe(
      false,
    );
    expect(isRegexFilterInvalid({ searchQuery: "  ", regex: true })).toBe(
      false,
    );
  });
});

describe("sameLogParams / hasLogFilter", () => {
  it("compares every host-side field, treating absent and false alike", () => {
    expect(sameLogParams({}, { matchCase: false })).toBe(true);
    expect(sameLogParams({ search: "a" }, { search: "a" })).toBe(true);
    expect(sameLogParams({ search: "a" }, { search: "b" })).toBe(false);
    expect(sameLogParams({ file: "a" }, {})).toBe(false);
    expect(sameLogParams({ regex: true }, {})).toBe(false);
    expect(sameLogParams({ branch: "x" }, { branch: "y" })).toBe(false);
  });

  it("ignores toggles when judging whether the log is narrowed", () => {
    expect(hasLogFilter({})).toBe(false);
    expect(hasLogFilter({ matchCase: true, regex: true })).toBe(false);
    expect(hasLogFilter({ search: "a" })).toBe(true);
    expect(hasLogFilter({ file: "a" })).toBe(true);
    expect(hasLogFilter({ branch: "a" })).toBe(true);
  });
});

describe("toRepoRelativePath", () => {
  it("strips the workspace root from a picker result", () => {
    expect(toRepoRelativePath("/work/repo/src/git", "/work/repo")).toBe(
      "src/git",
    );
    expect(toRepoRelativePath("/work/repo/src/git/", "/work/repo/")).toBe(
      "src/git",
    );
  });

  it("normalizes Windows separators and drive roots", () => {
    expect(
      toRepoRelativePath("C:\\work\\repo\\src\\a.ts", "C:\\work\\repo"),
    ).toBe("src/a.ts");
  });

  it("does not treat a sibling folder with the same prefix as inside", () => {
    expect(toRepoRelativePath("/work/repo2/a.ts", "/work/repo")).toBe(
      "/work/repo2/a.ts",
    );
  });

  it("maps the root itself to an empty filter", () => {
    expect(toRepoRelativePath("/work/repo", "/work/repo")).toBe("");
  });

  it("leaves relative input, pathspecs and a missing root alone", () => {
    expect(toRepoRelativePath("./src/a.ts", "/work/repo")).toBe("src/a.ts");
    expect(toRepoRelativePath(":(glob)**/*.ts", "/work/repo")).toBe(
      ":(glob)**/*.ts",
    );
    expect(toRepoRelativePath("  src/a.ts ", null)).toBe("src/a.ts");
  });
});

describe("isAbsolutePath", () => {
  it("recognizes POSIX, drive and UNC paths", () => {
    expect(isAbsolutePath("/etc/hosts")).toBe(true);
    expect(isAbsolutePath("C:\\x")).toBe(true);
    expect(isAbsolutePath("c:/x")).toBe(true);
    expect(isAbsolutePath("\\\\server\\share")).toBe(true);
    expect(isAbsolutePath("src/a.ts")).toBe(false);
    expect(isAbsolutePath("")).toBe(false);
  });
});

describe("pathMatchesFilter", () => {
  it("matches a file exactly and a folder by prefix", () => {
    expect(pathMatchesFilter("src/a.ts", "src/a.ts")).toBe(true);
    expect(pathMatchesFilter("src/git/a.ts", "src/git")).toBe(true);
    expect(pathMatchesFilter("src/gitx/a.ts", "src/git")).toBe(false);
    expect(pathMatchesFilter("src/a.ts", "other")).toBe(false);
  });

  it("cannot judge a pathspec, so it keeps every file", () => {
    expect(pathMatchesFilter("src/a.ts", ":(glob)**/*.md")).toBe(true);
  });
});
