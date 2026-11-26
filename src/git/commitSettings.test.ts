import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCommitArgs,
  commitOptionsFromSettings,
  parseCommitOption,
  parseThresholdMB,
  readCommitSettings,
  thresholdBytes,
} from "./commitSettings.ts";

describe("commit settings", () => {
  it("defaults to today's behaviour with every warning on", () => {
    assert.deepEqual(
      readCommitSettings(() => undefined),
      {
        signOff: false,
        runHooks: true,
        gpgSign: "auto",
        warnLargeFiles: true,
        largeFileThresholdMB: 10,
        warnCrlf: true,
        warnDetachedHead: true,
        warnMissingIdentity: true,
      },
    );
  });

  it("reads each value through the adapter and ignores wrong types", () => {
    const values: Record<string, unknown> = {
      "commit.signOff": true,
      "commit.runHooks": false,
      "commit.gpgSign": "always",
      "commit.warnLargeFiles": false,
      "commit.largeFileThresholdMB": 2.5,
      "commit.warnCrlf": "yes",
      "commit.warnDetachedHead": false,
    };
    const settings = readCommitSettings((k) => values[k]);
    assert.equal(settings.signOff, true);
    assert.equal(settings.runHooks, false);
    assert.equal(settings.gpgSign, "always");
    assert.equal(settings.warnLargeFiles, false);
    assert.equal(settings.largeFileThresholdMB, 2.5);
    assert.equal(settings.warnCrlf, true);
    assert.equal(settings.warnDetachedHead, false);
    assert.equal(settings.warnMissingIdentity, true);
  });

  it("falls back to auto signing for an unknown mode", () => {
    assert.equal(readCommitSettings(() => "sometimes").gpgSign, "auto");
  });

  it("rejects threshold values that would warn about everything or nothing", () => {
    for (const bad of [
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "5",
      null,
    ]) {
      assert.equal(parseThresholdMB(bad), 10, String(bad));
    }
    assert.equal(thresholdBytes(1.5), 1.5 * 1024 * 1024);
  });

  it("maps the settings to commit options", () => {
    const settings = readCommitSettings((k) =>
      k === "commit.runHooks"
        ? false
        : k === "commit.signOff"
          ? true
          : undefined,
    );
    assert.deepEqual(commitOptionsFromSettings(settings), {
      signOff: true,
      noVerify: true,
      gpgSign: "auto",
    });
  });
});

describe("buildCommitArgs", () => {
  it("is the plain commit when no option is set", () => {
    assert.deepEqual(buildCommitArgs("msg", false), ["commit", "-m", "msg"]);
    assert.deepEqual(buildCommitArgs("msg", false, { gpgSign: "auto" }), [
      "commit",
      "-m",
      "msg",
    ]);
  });

  it("adds each flag only for its option", () => {
    assert.deepEqual(
      buildCommitArgs("msg", true, {
        signOff: true,
        noVerify: true,
        gpgSign: "always",
      }),
      [
        "commit",
        "-m",
        "msg",
        "--amend",
        "--signoff",
        "--no-verify",
        "--gpg-sign",
      ],
    );
    assert.deepEqual(buildCommitArgs("msg", false, { gpgSign: "never" }), [
      "commit",
      "-m",
      "msg",
      "--no-gpg-sign",
    ]);
  });

  it("keeps a message that looks like a flag as the -m value", () => {
    assert.deepEqual(buildCommitArgs("--amend", false), [
      "commit",
      "-m",
      "--amend",
    ]);
  });
});

describe("parseCommitOption", () => {
  it("accepts the three options with matching value types", () => {
    assert.deepEqual(parseCommitOption("signOff", true), {
      key: "signOff",
      value: true,
    });
    assert.deepEqual(parseCommitOption("runHooks", false), {
      key: "runHooks",
      value: false,
    });
    assert.deepEqual(parseCommitOption("gpgSign", "never"), {
      key: "gpgSign",
      value: "never",
    });
  });

  it("rejects unknown keys and mismatched values", () => {
    assert.equal(parseCommitOption("signOff", "yes"), undefined);
    assert.equal(parseCommitOption("gpgSign", true), undefined);
    assert.equal(parseCommitOption("gpgSign", "sometimes"), undefined);
    assert.equal(parseCommitOption("warnCrlf", true), undefined);
    assert.equal(parseCommitOption(undefined, undefined), undefined);
  });
});
