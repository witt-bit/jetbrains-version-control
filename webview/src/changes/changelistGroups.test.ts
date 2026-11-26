import { describe, expect, it } from "vitest";
import {
  type ChangelistsInfo,
  DEFAULT_CHANGELIST_ID,
} from "../shared/types/git";
import {
  changelistKey,
  groupFilesByChangelist,
  MERGE_CONFLICTS_KEY,
  UNVERSIONED_FILES_KEY,
} from "./changelistGroups";

type TestFile = { path: string; status: string; changelist?: string };

const file = (
  path: string,
  changelist?: string,
  status = "modified",
): TestFile => ({ path, status, changelist });

function info(overrides: Partial<ChangelistsInfo> = {}): ChangelistsInfo {
  return {
    enabled: true,
    activeId: DEFAULT_CHANGELIST_ID,
    lists: [{ id: DEFAULT_CHANGELIST_ID, name: "Changes" }],
    offerMoveOnPartialCommit: false,
    ...overrides,
  };
}

const paths = (files: TestFile[]) => files.map((f) => f.path);

describe("groupFilesByChangelist", () => {
  it("hides the default list when it is empty and not active", () => {
    const buckets = groupFilesByChangelist(
      [file("a.ts", "feature")],
      info({
        activeId: "feature",
        lists: [
          { id: DEFAULT_CHANGELIST_ID, name: "Changes" },
          { id: "feature", name: "Feature" },
        ],
      }),
    );

    expect(buckets.map((b) => b.key)).toEqual([changelistKey("feature")]);
  });

  it("shows an empty active default list only when another list exists", () => {
    expect(groupFilesByChangelist([], info())).toEqual([]);

    const [bucket] = groupFilesByChangelist(
      [],
      info({
        lists: [
          { id: DEFAULT_CHANGELIST_ID, name: "Changes" },
          { id: "feature", name: "Feature" },
        ],
      }),
    );
    expect(bucket).toEqual({
      key: changelistKey(DEFAULT_CHANGELIST_ID),
      label: "Changes",
      active: true,
      files: [],
    });
  });

  it("shows the default list when it has files even if another list is active", () => {
    const buckets = groupFilesByChangelist(
      [file("a.ts", DEFAULT_CHANGELIST_ID)],
      info({
        activeId: "feature",
        lists: [
          { id: DEFAULT_CHANGELIST_ID, name: "Changes" },
          { id: "feature", name: "Feature" },
        ],
      }),
    );

    expect(buckets.map((b) => [b.key, b.active])).toEqual([
      [changelistKey(DEFAULT_CHANGELIST_ID), false],
      [changelistKey("feature"), true],
    ]);
  });

  it("always shows a non-default list, even when empty", () => {
    const buckets = groupFilesByChangelist(
      [],
      info({
        lists: [
          { id: DEFAULT_CHANGELIST_ID, name: "Changes" },
          { id: "empty", name: "Empty" },
        ],
      }),
    );

    expect(buckets.map((b) => [b.label, b.files.length])).toEqual([
      ["Changes", 0],
      ["Empty", 0],
    ]);
  });

  it("sends files with a missing or unknown changelist to the default list", () => {
    const [bucket] = groupFilesByChangelist(
      [file("none.ts"), file("ghost.ts", "deleted-list"), file("x.ts", "")],
      info(),
    );

    expect(paths(bucket.files)).toEqual(["none.ts", "ghost.ts", "x.ts"]);
  });

  it("keeps files with a known changelist in that list", () => {
    const buckets = groupFilesByChangelist(
      [file("a.ts", "feature"), file("b.ts"), file("c.ts", "feature")],
      info({
        lists: [
          { id: DEFAULT_CHANGELIST_ID, name: "Changes" },
          { id: "feature", name: "Feature" },
        ],
      }),
    );

    expect(buckets.map((b) => paths(b.files))).toEqual([
      ["b.ts"],
      ["a.ts", "c.ts"],
    ]);
  });

  it("puts conflicted and untracked files in trailing pseudo-groups", () => {
    const buckets = groupFilesByChangelist(
      [
        file("new.ts", undefined, "untracked"),
        file("a.ts", DEFAULT_CHANGELIST_ID),
        file("both.ts", undefined, "conflicted"),
        file("scratch.txt", undefined, "untracked"),
      ],
      info(),
    );

    expect(
      buckets.map((b) => [b.key, b.label, b.active, paths(b.files)]),
    ).toEqual([
      [changelistKey(DEFAULT_CHANGELIST_ID), "Changes", true, ["a.ts"]],
      [MERGE_CONFLICTS_KEY, "Merge Conflicts", false, ["both.ts"]],
      [
        UNVERSIONED_FILES_KEY,
        "Unversioned Files",
        false,
        ["new.ts", "scratch.txt"],
      ],
    ]);
  });

  it("omits pseudo-groups that have no files", () => {
    const buckets = groupFilesByChangelist([file("a.ts")], info());

    expect(buckets.map((b) => b.key)).toEqual([
      changelistKey(DEFAULT_CHANGELIST_ID),
    ]);
  });

  it("preserves the host's list order", () => {
    const buckets = groupFilesByChangelist(
      [],
      info({
        lists: [
          { id: "b", name: "B" },
          { id: DEFAULT_CHANGELIST_ID, name: "Changes" },
          { id: "a", name: "A" },
        ],
      }),
    );

    expect(buckets.map((b) => b.label)).toEqual(["B", "Changes", "A"]);
  });

  it("produces the same keys on every call", () => {
    const input = [
      file("a.ts", "feature"),
      file("u.ts", undefined, "untracked"),
    ];
    const changelists = info({
      lists: [
        { id: DEFAULT_CHANGELIST_ID, name: "Changes" },
        { id: "feature", name: "Feature" },
      ],
    });

    const keys = () =>
      groupFilesByChangelist(input, changelists).map((b) => b.key);

    expect(keys()).toEqual(keys());
    expect(new Set(keys()).size).toBe(keys().length);
  });

  it("keeps a key stable when its list is renamed", () => {
    const list = (name: string) =>
      info({ lists: [{ id: DEFAULT_CHANGELIST_ID, name }] });

    const [before] = groupFilesByChangelist([file("a.ts")], list("Changes"));
    const [after] = groupFilesByChangelist([file("a.ts")], list("Work"));

    expect(after.key).toBe(before.key);
    expect(after.label).toBe("Work");
  });

  it("still groups files when the host omits the default list", () => {
    const buckets = groupFilesByChangelist(
      [file("a.ts")],
      info({
        activeId: "feature",
        lists: [{ id: "feature", name: "Feature" }],
      }),
    );

    expect(buckets.map((b) => [b.label, paths(b.files)])).toEqual([
      ["Changes", ["a.ts"]],
      ["Feature", []],
    ]);
  });
});
