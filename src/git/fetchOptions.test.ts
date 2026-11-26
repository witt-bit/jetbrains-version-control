import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFetchArgs,
  parseAutoFetchInterval,
  parseFetchTagsMode,
  readFetchSettings,
} from "./fetchOptions.ts";

describe("buildFetchArgs", () => {
  it("is a plain fetch of the remote without options", () => {
    assert.deepEqual(buildFetchArgs("origin"), ["fetch", "origin"]);
    assert.deepEqual(
      buildFetchArgs("origin", { prune: false, tagsMode: "default" }),
      ["fetch", "origin"],
    );
  });

  it("adds --prune", () => {
    assert.deepEqual(buildFetchArgs("origin", { prune: true }), [
      "fetch",
      "--prune",
      "origin",
    ]);
  });

  it("maps every tags mode to its flag", () => {
    assert.deepEqual(buildFetchArgs("origin", { tagsMode: "allTags" }), [
      "fetch",
      "--tags",
      "origin",
    ]);
    assert.deepEqual(buildFetchArgs("origin", { tagsMode: "noTags" }), [
      "fetch",
      "--no-tags",
      "origin",
    ]);
  });

  it("makes prune-tags imply --prune, once", () => {
    // git ignores --prune-tags unless --prune is on as well.
    assert.deepEqual(buildFetchArgs("origin", { tagsMode: "pruneTags" }), [
      "fetch",
      "--prune",
      "--prune-tags",
      "origin",
    ]);
    assert.deepEqual(
      buildFetchArgs("origin", { prune: true, tagsMode: "pruneTags" }),
      ["fetch", "--prune", "--prune-tags", "origin"],
    );
  });

  it("fetches every remote for a null remote", () => {
    assert.deepEqual(buildFetchArgs(null, { prune: true }), [
      "fetch",
      "--prune",
      "--all",
    ]);
  });
});

describe("fetch settings", () => {
  it("defaults to today's behaviour for anything unset or unknown", () => {
    assert.deepEqual(
      readFetchSettings(() => undefined),
      {
        prune: false,
        tagsMode: "default",
        autoFetch: false,
        autoFetchIntervalMinutes: 15,
      },
    );
    assert.equal(parseFetchTagsMode("everything"), "default");
    assert.equal(parseFetchTagsMode(3), "default");
  });

  it("reads each key", () => {
    const values: Record<string, unknown> = {
      "fetch.prune": true,
      "fetch.tagsMode": "noTags",
      "fetch.autoFetch": true,
      "fetch.autoFetchIntervalMinutes": 5,
    };
    assert.deepEqual(
      readFetchSettings((k) => values[k]),
      {
        prune: true,
        tagsMode: "noTags",
        autoFetch: true,
        autoFetchIntervalMinutes: 5,
      },
    );
  });

  it("clamps the interval to at least a minute and rejects non-numbers", () => {
    assert.equal(parseAutoFetchInterval(0), 1);
    assert.equal(parseAutoFetchInterval(-4), 1);
    assert.equal(parseAutoFetchInterval(2.9), 2);
    assert.equal(parseAutoFetchInterval("5"), 15);
    assert.equal(parseAutoFetchInterval(Number.NaN), 15);
  });
});
