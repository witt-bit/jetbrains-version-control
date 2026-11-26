import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterDeletable,
  parseLocalBranchRefs,
  selectCleanupCandidates,
} from "./branchCleanup.ts";
import { rankUpstreamCandidates } from "./branchUpstream.ts";

describe("filterDeletable", () => {
  it("passes every branch through when nothing is protected", () => {
    assert.deepEqual(filterDeletable(["a", "feature/b"]), ["a", "feature/b"]);
    assert.deepEqual(filterDeletable([]), []);
  });

  it("drops protected branches, including glob matches with slashes", () => {
    assert.deepEqual(
      filterDeletable(
        ["main", "feature/x", "release/1.0", "release/1.0/hotfix"],
        ["main", "release/*"],
      ),
      ["feature/x"],
    );
  });
});

describe("parseLocalBranchRefs", () => {
  it("strips refs/heads/ and keeps slashes in names", () => {
    assert.deepEqual(
      parseLocalBranchRefs("refs/heads/main\nrefs/heads/feature/x\n"),
      ["main", "feature/x"],
    );
  });

  it("ignores the detached-HEAD pseudo entry and blank lines", () => {
    assert.deepEqual(
      parseLocalBranchRefs("\n(HEAD detached at 1234abc)\nrefs/heads/main\n"),
      ["main"],
    );
  });
});

describe("selectCleanupCandidates", () => {
  const merged = ["main", "done", "other", "wt"];

  it("drops the current branch, the base and worktree branches", () => {
    assert.deepEqual(
      selectCleanupCandidates(merged, {
        base: "main",
        currentBranch: "other",
        worktreeBranches: ["wt"],
      }),
      ["done"],
    );
  });

  it("accepts a full ref as the base and a detached HEAD", () => {
    assert.deepEqual(
      selectCleanupCandidates(merged, {
        base: "refs/heads/main",
        currentBranch: null,
        worktreeBranches: [],
      }),
      ["done", "other", "wt"],
    );
  });
});

describe("rankUpstreamCandidates", () => {
  const remotes = [
    { remote: "origin", branches: ["dev", "feature", "main"] },
    { remote: "fork", branches: ["feature"] },
  ];

  it("lists same-named branches first, in remote order", () => {
    assert.deepEqual(rankUpstreamCandidates("feature", remotes), [
      "origin/feature",
      "fork/feature",
      "origin/dev",
      "origin/main",
    ]);
  });

  it("drops the branch's present upstream", () => {
    assert.deepEqual(
      rankUpstreamCandidates("feature", remotes, "origin/feature"),
      ["fork/feature", "origin/dev", "origin/main"],
    );
  });

  it("is empty without remote branches", () => {
    assert.deepEqual(rankUpstreamCandidates("main", []), []);
  });
});
