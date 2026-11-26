import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  annotateChangelists,
  type ChangelistResult,
  type ChangelistState,
  changedPathsOf,
  changelistOf,
  createChangelist,
  createDefaultState,
  DEFAULT_CHANGELIST_ID,
  deleteChangelist,
  forgetUnchanged,
  moveToChangelist,
  parseState,
  pathsInChangelist,
  reconcile,
  renameChangelist,
  STALE_AFTER_DAYS,
  serializeState,
  setActiveChangelist,
  validateName,
} from "./changelists.ts";

function ok(result: ChangelistResult): ChangelistState {
  assert.ok(result.ok, result.ok ? "" : result.error);
  return result.state;
}

function withList(
  state: ChangelistState,
  name: string,
  id: string,
): ChangelistState {
  const result = createChangelist(state, name, { id });
  assert.ok(result.ok);
  return result.state;
}

describe("changelist names", () => {
  const state = withList(createDefaultState(), "Feature X", "x");

  it("trims, and rejects empty names", () => {
    assert.deepEqual(validateName(state, "  Bugfix  "), {
      ok: true,
      name: "Bugfix",
    });
    assert.equal(validateName(state, "   ").ok, false);
    assert.equal(validateName(state, undefined).ok, false);
  });

  it("rejects a duplicate ignoring case, but lets a list keep its own name", () => {
    assert.equal(validateName(state, "feature x").ok, false);
    assert.equal(validateName(state, "CHANGES").ok, false);
    assert.equal(validateName(state, "FEATURE X", "x").ok, true);
  });

  it("rejects an over-long name", () => {
    assert.equal(validateName(state, "a".repeat(201)).ok, false);
  });
});

describe("changelist lifecycle", () => {
  it("starts with only the default list, active", () => {
    const state = createDefaultState();
    assert.equal(state.activeId, DEFAULT_CHANGELIST_ID);
    assert.deepEqual(
      state.lists.map((list) => list.name),
      ["Changes"],
    );
  });

  it("creates a list, optionally making it active", () => {
    const created = createChangelist(createDefaultState(), "Hotfix", {
      makeActive: true,
    });
    assert.ok(created.ok);
    assert.equal(created.state.activeId, created.id);
    assert.equal(created.state.lists.length, 2);
  });

  it("renames, including the default list", () => {
    const state = ok(
      renameChangelist(createDefaultState(), DEFAULT_CHANGELIST_ID, "Main"),
    );
    assert.equal(state.lists[0].name, "Main");
  });

  it("refuses to rename onto an existing name or an unknown list", () => {
    const state = withList(createDefaultState(), "A", "a");
    assert.equal(renameChangelist(state, "a", "Changes").ok, false);
    assert.equal(renameChangelist(state, "gone", "B").ok, false);
  });

  it("a no-op rename returns the same state", () => {
    const state = withList(createDefaultState(), "A", "a");
    assert.equal(ok(renameChangelist(state, "a", " A ")), state);
  });

  it("never deletes the default list", () => {
    assert.equal(
      deleteChangelist(createDefaultState(), DEFAULT_CHANGELIST_ID).ok,
      false,
    );
  });

  it("deleting a list moves its files to the default list and fixes active", () => {
    let state = withList(createDefaultState(), "A", "a");
    state = ok(setActiveChangelist(state, "a"));
    state = ok(moveToChangelist(state, ["f.ts", "g.ts"], "a", 10));
    state = ok(moveToChangelist(state, ["h.ts"], DEFAULT_CHANGELIST_ID, 10));

    state = ok(deleteChangelist(state, "a"));

    assert.equal(state.activeId, DEFAULT_CHANGELIST_ID);
    assert.deepEqual(pathsInChangelist(state, DEFAULT_CHANGELIST_ID), [
      "f.ts",
      "g.ts",
      "h.ts",
    ]);
    assert.equal(state.lists.length, 1);
  });

  it("deleting a non-active list keeps the active one", () => {
    let state = withList(createDefaultState(), "A", "a");
    state = withList(state, "B", "b");
    state = ok(setActiveChangelist(state, "b"));
    state = ok(deleteChangelist(state, "a"));
    assert.equal(state.activeId, "b");
  });

  it("setting the active list rejects an unknown id", () => {
    assert.equal(setActiveChangelist(createDefaultState(), "nope").ok, false);
  });
});

describe("moving files", () => {
  it("assigns every path and refuses an unknown target", () => {
    const state = withList(createDefaultState(), "A", "a");
    const moved = ok(moveToChangelist(state, ["x", "y"], "a", 5));
    assert.equal(changelistOf(moved, "x"), "a");
    assert.equal(changelistOf(moved, "y"), "a");
    assert.equal(moveToChangelist(state, ["x"], "nope", 5).ok, false);
  });

  it("moving onto the same list on the same day changes nothing", () => {
    const state = withList(createDefaultState(), "A", "a");
    const moved = ok(moveToChangelist(state, ["x"], "a", 5));
    assert.equal(ok(moveToChangelist(moved, ["x"], "a", 5)), moved);
  });

  it("handles a file named __proto__", () => {
    const state = withList(createDefaultState(), "A", "a");
    const moved = ok(moveToChangelist(state, ["__proto__"], "a", 5));
    assert.equal(changelistOf(moved, "__proto__"), "a");
    const roundTrip = parseState(
      JSON.parse(JSON.stringify(serializeState(moved))),
    );
    assert.equal(changelistOf(roundTrip, "__proto__"), "a");
  });
});

describe("reconcile", () => {
  it("puts a newly seen path in the active list", () => {
    let state = withList(createDefaultState(), "A", "a");
    state = ok(setActiveChangelist(state, "a"));
    const next = reconcile(state, [{ path: "new.ts" }], 10);
    assert.equal(changelistOf(next, "new.ts"), "a");
    assert.equal(next.assignments.get("new.ts")?.seen, 10);
  });

  it("a file already assigned keeps its list when the active list changes", () => {
    let state = withList(createDefaultState(), "A", "a");
    state = reconcile(state, [{ path: "f.ts" }], 10);
    state = ok(setActiveChangelist(state, "a"));
    state = reconcile(state, [{ path: "f.ts" }], 10);
    assert.equal(changelistOf(state, "f.ts"), DEFAULT_CHANGELIST_ID);
  });

  it("returns the same object when nothing changed", () => {
    const state = reconcile(createDefaultState(), [{ path: "f.ts" }], 10);
    assert.equal(reconcile(state, [{ path: "f.ts" }], 10), state);
  });

  it("refreshes `seen` once the day changes", () => {
    const state = reconcile(createDefaultState(), [{ path: "f.ts" }], 10);
    const later = reconcile(state, [{ path: "f.ts" }], 11);
    assert.notEqual(later, state);
    assert.equal(later.assignments.get("f.ts")?.seen, 11);
  });

  it("a renamed file inherits the list of its old path", () => {
    let state = withList(createDefaultState(), "A", "a");
    state = ok(moveToChangelist(state, ["old.ts"], "a", 10));
    state = reconcile(state, [{ path: "new.ts", oldPath: "old.ts" }], 10);
    assert.equal(changelistOf(state, "new.ts"), "a");
  });

  it("keeps a vanished path for a week so stash and update round-trips survive", () => {
    let state = withList(createDefaultState(), "A", "a");
    state = ok(moveToChangelist(state, ["f.ts"], "a", 10));
    state = reconcile(state, [], 10 + STALE_AFTER_DAYS);
    assert.equal(state.assignments.get("f.ts")?.list, "a");
  });

  it("forgets a path unseen for longer than the grace period", () => {
    let state = withList(createDefaultState(), "A", "a");
    state = ok(moveToChangelist(state, ["f.ts"], "a", 10));
    state = reconcile(state, [], 10 + STALE_AFTER_DAYS + 1);
    assert.equal(state.assignments.has("f.ts"), false);
  });

  it("does not forget a stale-looking path that is changed right now", () => {
    let state = withList(createDefaultState(), "A", "a");
    state = ok(moveToChangelist(state, ["f.ts"], "a", 10));
    state = reconcile(state, [{ path: "f.ts" }], 100);
    assert.equal(changelistOf(state, "f.ts"), "a");
  });
});

describe("forgetUnchanged", () => {
  const base = ok(
    moveToChangelist(
      withList(createDefaultState(), "A", "a"),
      ["kept", "gone", "other"],
      "a",
      1,
    ),
  );

  it("drops assignments that are no longer changed", () => {
    const next = forgetUnchanged(base, ["kept"]);
    assert.deepEqual([...next.assignments.keys()], ["kept"]);
  });

  it("limits the sweep to the paths the user acted on", () => {
    const next = forgetUnchanged(base, ["kept"], ["gone"]);
    assert.deepEqual([...next.assignments.keys()].sort(), ["kept", "other"]);
  });

  it("returns the same object when there is nothing to forget", () => {
    assert.equal(forgetUnchanged(base, ["kept", "gone", "other"]), base);
  });
});

describe("parseState", () => {
  it("falls back to the default state for junk", () => {
    for (const junk of [null, undefined, 3, "x", []]) {
      assert.deepEqual(parseState(junk), createDefaultState());
    }
  });

  it("round-trips through serializeState", () => {
    let state = withList(createDefaultState(), "A", "a");
    state = ok(setActiveChangelist(state, "a"));
    state = ok(moveToChangelist(state, ["f.ts"], "a", 7));
    assert.deepEqual(
      parseState(JSON.parse(JSON.stringify(serializeState(state)))),
      state,
    );
  });

  it("repairs a hand-edited file", () => {
    const state = parseState({
      activeId: "ghost",
      lists: [
        { id: "a", name: "A" },
        { id: "a", name: "Duplicate id" },
        { id: "b", name: "a" },
        { id: "c", name: "" },
        { id: 4, name: "Bad id" },
        "nonsense",
      ],
      assignments: {
        "x.ts": { list: "a", seen: 3 },
        "y.ts": { list: "ghost", seen: "later" },
        "z.ts": null,
      },
    });
    assert.deepEqual(
      state.lists.map((list) => list.id),
      [DEFAULT_CHANGELIST_ID, "a"],
    );
    assert.equal(state.activeId, DEFAULT_CHANGELIST_ID);
    assert.equal(changelistOf(state, "x.ts"), "a");
    assert.deepEqual(state.assignments.get("y.ts"), {
      list: DEFAULT_CHANGELIST_ID,
      seen: 0,
    });
    assert.equal(state.assignments.has("z.ts"), false);
  });

  it("keeps a renamed default list and always puts it first", () => {
    const state = parseState({
      lists: [
        { id: "a", name: "A" },
        { id: DEFAULT_CHANGELIST_ID, name: "Main" },
      ],
    });
    assert.deepEqual(
      state.lists.map((list) => list.name),
      ["Main", "A"],
    );
  });
});

describe("annotating files", () => {
  const files = [
    { path: "a.ts", status: "modified", staged: false },
    { path: "b.ts", status: "untracked", staged: false },
    { path: "c.ts", status: "conflicted", staged: false },
    { path: "d.ts", status: "renamed", staged: true, oldPath: "old.ts" },
  ];

  it("reconciles only tracked, non-conflicted paths, once each", () => {
    assert.deepEqual(
      changedPathsOf([
        ...files,
        { path: "a.ts", status: "added", staged: true },
      ]),
      [
        { path: "a.ts", oldPath: undefined },
        { path: "d.ts", oldPath: "old.ts" },
      ],
    );
  });

  it("tags listable files and leaves the rest untouched", () => {
    let state = withList(createDefaultState(), "A", "a");
    state = ok(moveToChangelist(state, ["a.ts"], "a", 1));
    const annotated = annotateChangelists(state, files);
    assert.equal(annotated[0].changelist, "a");
    assert.equal("changelist" in annotated[1], false);
    assert.equal("changelist" in annotated[2], false);
    assert.equal(annotated[3].changelist, DEFAULT_CHANGELIST_ID);
  });

  it("does not mutate its input", () => {
    annotateChangelists(createDefaultState(), files);
    assert.equal("changelist" in files[0], false);
  });
});
