import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readChangelistSettings } from "./changelistSettings.ts";

describe("changelist settings", () => {
  it("is on by default, with the partial-commit offer on", () => {
    assert.deepEqual(
      readChangelistSettings(() => undefined),
      { enabled: true, offerMoveOnPartialCommit: true },
    );
  });

  it("reads each value and ignores values of the wrong type", () => {
    assert.deepEqual(
      readChangelistSettings((key) =>
        key === "changelists.enabled" ? false : "no",
      ),
      { enabled: false, offerMoveOnPartialCommit: true },
    );
  });
});
