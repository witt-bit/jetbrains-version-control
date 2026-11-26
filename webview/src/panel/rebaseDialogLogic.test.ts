import { describe, expect, it } from "vitest";
import {
  DEFAULT_REBASE_OPTIONS,
  describeCommand,
  isUnchanged,
  messageOf,
  moveRow,
  type RebaseCommitInfo,
  setAction,
  setMessage,
  toRows,
  toTodoEntries,
  validateRows,
} from "./rebaseDialogLogic";

function commit(
  n: number,
  overrides: Partial<RebaseCommitInfo> = {},
): RebaseCommitInfo {
  return {
    hash: String(n).repeat(40),
    shortHash: String(n).repeat(7),
    subject: `commit ${n}`,
    body: "",
    authorName: "A",
    authorDate: "2024-01-01",
    action: "pick",
    ...overrides,
  };
}

// Oldest first, the way the host lists them.
const COMMITS = [commit(1), commit(2), commit(3)];

describe("toRows / toTodoEntries", () => {
  it("lists newest first and sends the todo oldest first", () => {
    const rows = toRows(COMMITS);
    expect(rows.map((r) => r.subject)).toEqual([
      "commit 3",
      "commit 2",
      "commit 1",
    ]);
    expect(toTodoEntries(rows).map((e) => e.subject)).toEqual([
      "commit 1",
      "commit 2",
      "commit 3",
    ]);
  });

  it("keeps the action autosquash chose, with its fixup flag", () => {
    const rows = toRows([
      commit(1),
      commit(2, { action: "fixup", flag: "-C" }),
    ]);
    expect(toTodoEntries(rows)[1]).toMatchObject({
      action: "fixup",
      flag: "-C",
    });
  });
});

describe("moveRow", () => {
  it("swaps with the neighbour", () => {
    const rows = toRows(COMMITS);
    expect(moveRow(rows, 0, 1).map((r) => r.subject)).toEqual([
      "commit 2",
      "commit 3",
      "commit 1",
    ]);
    expect(moveRow(rows, 2, -1).map((r) => r.subject)).toEqual([
      "commit 3",
      "commit 1",
      "commit 2",
    ]);
  });

  it("ignores a move off either end or from a bad index", () => {
    const rows = toRows(COMMITS);
    expect(moveRow(rows, 0, -1)).toEqual(rows);
    expect(moveRow(rows, 2, 1)).toEqual(rows);
    expect(moveRow(rows, 9, 1)).toEqual(rows);
  });

  it("does not mutate its input", () => {
    const rows = toRows(COMMITS);
    const copy = structuredClone(rows);
    moveRow(rows, 0, 1);
    expect(rows).toEqual(copy);
  });
});

describe("setAction", () => {
  it("drops the fixup flag when the row stops being a fixup", () => {
    const rows = toRows([
      commit(1),
      commit(2, { action: "fixup", flag: "-c" }),
    ]);
    const next = setAction(rows, 0, "pick");
    expect(next[0].flag).toBeUndefined();
    expect(setAction(rows, 0, "fixup")[0].flag).toBe("-c");
  });

  it("forgets a typed message when the row stops being a reword", () => {
    let rows = setAction(toRows(COMMITS), 0, "reword");
    rows = setMessage(rows, 0, "new words");
    expect(setAction(rows, 0, "pick")[0].message).toBeUndefined();
  });
});

describe("messages", () => {
  it("shows the commit's own message until it is edited", () => {
    const rows = toRows([commit(1, { subject: "s", body: "b" })]);
    expect(messageOf(rows[0])).toBe("s\n\nb");
    expect(messageOf(setMessage(rows, 0, "x")[0])).toBe("x");
  });

  it("sends a message only for a reword that changed it", () => {
    let rows = setAction(toRows([commit(1, { subject: "s" })]), 0, "reword");
    expect(toTodoEntries(rows)[0].message).toBeUndefined();

    rows = setMessage(rows, 0, "s");
    expect(toTodoEntries(rows)[0].message).toBeUndefined();

    rows = setMessage(rows, 0, "   ");
    expect(toTodoEntries(rows)[0].message).toBeUndefined();

    rows = setMessage(rows, 0, "renamed\n\nwith a body");
    expect(toTodoEntries(rows)[0]).toMatchObject({
      action: "reword",
      message: "renamed\n\nwith a body",
    });
  });
});

describe("validateRows", () => {
  it("accepts an ordinary list", () => {
    expect(validateRows(toRows(COMMITS))).toBeNull();
  });

  it("rejects an empty list", () => {
    expect(validateRows([])).not.toBeNull();
  });

  it("rejects a squash or fixup on the oldest kept commit", () => {
    const rows = toRows(COMMITS);
    expect(validateRows(setAction(rows, 2, "squash"))).toMatch(/squash/);
    expect(validateRows(setAction(rows, 2, "fixup"))).toMatch(/fixup/);
  });

  it("looks past dropped commits for the oldest kept one", () => {
    let rows = toRows(COMMITS);
    rows = setAction(rows, 2, "drop");
    expect(validateRows(setAction(rows, 1, "fixup"))).not.toBeNull();
    expect(validateRows(setAction(rows, 0, "fixup"))).toBeNull();
  });

  it("allows a meld once an earlier commit is kept", () => {
    expect(validateRows(setAction(toRows(COMMITS), 0, "squash"))).toBeNull();
  });

  it("allows dropping every commit", () => {
    let rows = toRows(COMMITS);
    for (let i = 0; i < rows.length; i++) rows = setAction(rows, i, "drop");
    expect(validateRows(rows)).toBeNull();
  });
});

describe("isUnchanged", () => {
  it("is true for the loaded list and false after any edit", () => {
    const rows = toRows(COMMITS);
    expect(isUnchanged(rows, COMMITS)).toBe(true);
    expect(isUnchanged(moveRow(rows, 0, 1), COMMITS)).toBe(false);
    expect(isUnchanged(setAction(rows, 0, "drop"), COMMITS)).toBe(false);
    expect(
      isUnchanged(setMessage(setAction(rows, 0, "reword"), 0, "new"), COMMITS),
    ).toBe(false);
  });
});

describe("describeCommand", () => {
  it("lists only the flags that are on", () => {
    expect(describeCommand(DEFAULT_REBASE_OPTIONS, { ref: "abc1234" })).toBe(
      "git rebase --interactive --keep-empty abc1234",
    );
    expect(
      describeCommand(
        {
          onto: " main ",
          autosquash: true,
          keepEmpty: false,
          updateRefs: true,
          rebaseMerges: true,
        },
        { root: true },
      ),
    ).toBe(
      "git rebase --interactive --autosquash --no-keep-empty --update-refs --rebase-merges --onto main --root",
    );
  });
});
