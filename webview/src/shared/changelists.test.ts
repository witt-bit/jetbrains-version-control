import { describe, expect, it } from "vitest";
import {
  groupByChangelist,
  isChangelistsInfo,
  isMovable,
  movablePaths,
  partialCommitOffers,
} from "./changelists";
import type { WorkingTreeFile } from "./store/commit-store";
import type { ChangelistsInfo } from "./types/git";

function file(
  path: string,
  changelist: string | undefined,
  overrides: Partial<WorkingTreeFile> = {},
): WorkingTreeFile {
  return { path, status: "modified", staged: false, changelist, ...overrides };
}

function info(overrides: Partial<ChangelistsInfo> = {}): ChangelistsInfo {
  return {
    enabled: true,
    activeId: "default",
    offerMoveOnPartialCommit: true,
    lists: [
      { id: "default", name: "Changes" },
      { id: "fix", name: "Bug fix" },
    ],
    ...overrides,
  };
}

describe("isChangelistsInfo", () => {
  it("accepts the host payload and rejects the not-a-repository stub", () => {
    expect(isChangelistsInfo(info())).toBe(true);
    expect(isChangelistsInfo({ status: "not_git_repo", data: null })).toBe(
      false,
    );
    expect(isChangelistsInfo({ success: true })).toBe(false);
    expect(isChangelistsInfo(null)).toBe(false);
  });
});

describe("groupByChangelist", () => {
  it("returns the groups in list order with their files", () => {
    const groups = groupByChangelist(
      [file("a.ts", "fix"), file("b.ts", "default"), file("c.ts", "fix")],
      info(),
    );
    expect(groups.map((g) => [g.id, g.files.map((f) => f.path)])).toEqual([
      ["default", ["b.ts"]],
      ["fix", ["a.ts", "c.ts"]],
    ]);
  });

  it("marks only the active list", () => {
    const groups = groupByChangelist(
      [file("a.ts", "fix"), file("b.ts", "default")],
      info({ activeId: "fix" }),
    );
    expect(groups.map((g) => [g.id, g.active])).toEqual([
      ["default", false],
      ["fix", true],
    ]);
  });

  it("keeps an empty named list so it can receive a drop", () => {
    const groups = groupByChangelist([file("b.ts", "default")], info());
    expect(groups.map((g) => g.id)).toEqual(["default", "fix"]);
    expect(groups[1].files).toEqual([]);
  });

  it("puts untagged files and files in an unknown list into the default list", () => {
    const groups = groupByChangelist(
      [file("a.ts", undefined), file("b.ts", "gone")],
      info(),
    );
    expect(groups[0].id).toBe("default");
    expect(groups[0].files.map((f) => f.path)).toEqual(["a.ts", "b.ts"]);
  });

  it("hides an empty default list unless it is the active drop target", () => {
    const onlyNamed = [file("a.ts", "fix")];
    expect(
      groupByChangelist(onlyNamed, info({ activeId: "fix" })).map((g) => g.id),
    ).toEqual(["fix"]);
    expect(groupByChangelist(onlyNamed, info()).map((g) => g.id)).toEqual([
      "default",
      "fix",
    ]);
  });

  it("shows nothing for an empty tree with no named lists", () => {
    expect(
      groupByChangelist(
        [],
        info({ lists: [{ id: "default", name: "Changes" }] }),
      ),
    ).toEqual([]);
  });

  it("adds a missing default list under the name Changes", () => {
    const groups = groupByChangelist(
      [file("b.ts", "default")],
      info({ lists: [{ id: "fix", name: "Bug fix" }] }),
    );
    expect(groups.map((g) => [g.id, g.name])).toEqual([
      ["default", "Changes"],
      ["fix", "Bug fix"],
    ]);
  });
});

describe("movablePaths", () => {
  const changes = [
    file("a.ts", "default"),
    file("b.ts", "fix"),
    file("c.ts", "default", { staged: true }),
    file("d.ts", undefined, { status: "untracked" }),
  ];

  it("is just the row when nothing else is highlighted", () => {
    expect(movablePaths(changes[0], changes, new Set())).toEqual(["a.ts"]);
    expect(movablePaths(changes[0], changes, new Set(["a.ts:false"]))).toEqual([
      "a.ts",
    ]);
  });

  it("takes the whole highlight when the row is part of it, minus rows that cannot move", () => {
    const highlighted = new Set([
      "a.ts:false",
      "b.ts:false",
      "c.ts:true",
      "d.ts:false",
    ]);
    expect(movablePaths(changes[1], changes, highlighted)).toEqual([
      "a.ts",
      "b.ts",
    ]);
  });

  it("ignores the highlight when the row is outside it", () => {
    const highlighted = new Set(["a.ts:false", "b.ts:false"]);
    expect(movablePaths(file("e.ts", "default"), changes, highlighted)).toEqual(
      ["e.ts"],
    );
  });

  it("moves nothing for staged and unversioned rows", () => {
    expect(isMovable(changes[2])).toBe(false);
    expect(isMovable(changes[3])).toBe(false);
    expect(movablePaths(changes[2], changes, new Set())).toEqual([]);
  });
});

describe("partialCommitOffers", () => {
  const changes = [
    file("a.ts", "fix"),
    file("b.ts", "fix"),
    file("c.ts", "default"),
    file("d.ts", "default"),
  ];

  it("offers the leftover files of a named list that was only partly checked", () => {
    expect(
      partialCommitOffers(changes, new Set(["a.ts:false"]), info()),
    ).toEqual([{ listId: "fix", listName: "Bug fix", leftover: ["b.ts"] }]);
  });

  it("does not offer when the whole list or none of it was checked", () => {
    expect(
      partialCommitOffers(
        changes,
        new Set(["a.ts:false", "b.ts:false"]),
        info(),
      ),
    ).toEqual([]);
    expect(
      partialCommitOffers(changes, new Set(["c.ts:false"]), info()),
    ).toEqual([]);
  });

  it("never offers for the default list", () => {
    expect(
      partialCommitOffers(changes, new Set(["c.ts:false"]), info()),
    ).toEqual([]);
  });

  it("counts a staged row as part of the list its path belongs to", () => {
    const withStaged = [
      file("a.ts", "fix"),
      file("a.ts", "fix", { staged: true }),
      file("b.ts", "fix"),
    ];
    expect(
      partialCommitOffers(withStaged, new Set(["a.ts:true"]), info()),
    ).toEqual([{ listId: "fix", listName: "Bug fix", leftover: ["b.ts"] }]);
  });

  it("is silent when changelists or the offer setting are off, or unknown", () => {
    const checked = new Set(["a.ts:false"]);
    expect(
      partialCommitOffers(changes, checked, info({ enabled: false })),
    ).toEqual([]);
    expect(
      partialCommitOffers(
        changes,
        checked,
        info({ offerMoveOnPartialCommit: false }),
      ),
    ).toEqual([]);
    expect(partialCommitOffers(changes, checked, null)).toEqual([]);
  });
});
