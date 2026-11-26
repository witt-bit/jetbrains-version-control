import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type CommitCheckInput,
  formatBytes,
  formatCommitWarnings,
  parseBatchCheckSizes,
  parseDiffRawZ,
  parseLsFilesEol,
  runCommitChecks,
} from "./commitChecks.ts";

const MB = 1024 * 1024;

function input(overrides: Partial<CommitCheckInput>): CommitCheckInput {
  return { files: [], checkCrlf: false, ...overrides };
}

describe("runCommitChecks", () => {
  it("has nothing to say about a clean commit", () => {
    assert.deepEqual(
      runCommitChecks(
        input({
          files: [{ path: "a.ts", size: 10, indexEol: "lf" }],
          largeFileBytes: MB,
          checkCrlf: true,
          head: { detached: false, rebaseInProgress: false },
          identity: { name: "A", email: "a@example.com" },
        }),
      ),
      [],
    );
  });

  it("flags only files strictly above the threshold", () => {
    const warnings = runCommitChecks(
      input({
        largeFileBytes: MB,
        files: [
          { path: "exact.bin", size: MB },
          { path: "over.bin", size: MB + 1 },
          { path: "unknown.bin" },
        ],
      }),
    );
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].kind, "largeFiles");
    assert.deepEqual(warnings[0].details, ["over.bin (1.0 MB)"]);
  });

  it("skips the size check without a threshold", () => {
    assert.deepEqual(
      runCommitChecks(input({ files: [{ path: "huge", size: 10 ** 12 }] })),
      [],
    );
  });

  it("warns about CRLF and mixed index line endings, not LF or binary", () => {
    const warnings = runCommitChecks(
      input({
        checkCrlf: true,
        files: [
          { path: "crlf.txt", indexEol: "crlf" },
          { path: "mixed.txt", indexEol: "mixed" },
          { path: "lf.txt", indexEol: "lf" },
          { path: "bin.dat", indexEol: "-text" },
          { path: "empty.txt", indexEol: "none" },
          { path: "unknown.txt" },
        ],
      }),
    );
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].kind, "crlf");
    assert.deepEqual(warnings[0].details, ["crlf.txt", "mixed.txt"]);
  });

  it("skips the CRLF check when disabled", () => {
    assert.deepEqual(
      runCommitChecks(
        input({ files: [{ path: "crlf.txt", indexEol: "crlf" }] }),
      ),
      [],
    );
  });

  it("warns about a detached HEAD, and a rebase instead of it", () => {
    const detached = runCommitChecks(
      input({ head: { detached: true, rebaseInProgress: false } }),
    );
    assert.deepEqual(
      detached.map((w) => w.kind),
      ["detachedHead"],
    );
    const rebasing = runCommitChecks(
      input({ head: { detached: true, rebaseInProgress: true } }),
    );
    assert.deepEqual(
      rebasing.map((w) => w.kind),
      ["rebaseInProgress"],
    );
  });

  it("names exactly the identity parts that are missing", () => {
    const both = runCommitChecks(input({ identity: {} }));
    assert.match(both[0].message, /user\.name and user\.email are not set/);
    const emailOnly = runCommitChecks(input({ identity: { name: "A" } }));
    assert.match(emailOnly[0].message, /user\.email is not set/);
    const blank = runCommitChecks(
      input({ identity: { name: " ", email: "x" } }),
    );
    assert.match(blank[0].message, /user\.name is not set/);
  });

  it("reports every problem together", () => {
    const kinds = runCommitChecks({
      files: [{ path: "big.txt", size: 2 * MB, indexEol: "crlf" }],
      largeFileBytes: MB,
      checkCrlf: true,
      head: { detached: true, rebaseInProgress: false },
      identity: {},
    }).map((w) => w.kind);
    assert.deepEqual(kinds.sort(), [
      "crlf",
      "detachedHead",
      "largeFiles",
      "missingIdentity",
    ]);
  });
});

describe("formatting", () => {
  it("formats sizes", () => {
    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(1023), "1023 B");
    assert.equal(formatBytes(1536), "1.5 KB");
    assert.equal(formatBytes(10 * MB), "10.0 MB");
    assert.equal(formatBytes(250 * MB), "250 MB");
    assert.equal(formatBytes(3 * 1024 * MB), "3.0 GB");
  });

  it("lists at most five files per warning", () => {
    const text = formatCommitWarnings([
      {
        kind: "crlf",
        message: "Many files have CRLF.",
        details: ["a", "b", "c", "d", "e", "f", "g"],
      },
      { kind: "detachedHead", message: "HEAD is detached.", details: [] },
    ]);
    assert.equal(
      text,
      [
        "• Many files have CRLF.",
        "    a",
        "    b",
        "    c",
        "    d",
        "    e",
        "    … and 2 more",
        "",
        "• HEAD is detached.",
      ].join("\n"),
    );
  });
});

describe("git output parsers", () => {
  const sha = (c: string) => c.repeat(40);

  it("parses diff --raw -z and drops deletions", () => {
    const out = [
      `:100644 100644 ${sha("a")} ${sha("b")} M`,
      "src/mod.ts",
      `:000000 100644 ${sha("0")} ${sha("c")} A`,
      "dir with space/new file.txt",
      `:100644 000000 ${sha("d")} ${sha("0")} D`,
      "gone.txt",
      `:160000 160000 ${sha("e")} ${sha("f")} M`,
      "vendor/sub",
      "",
    ].join("\0");
    assert.deepEqual(parseDiffRawZ(out), [
      { path: "src/mod.ts", sha: sha("b"), mode: "100644" },
      { path: "dir with space/new file.txt", sha: sha("c"), mode: "100644" },
      { path: "vendor/sub", sha: sha("f"), mode: "160000" },
    ]);
  });

  it("drops unmerged entries, which have no blob", () => {
    const out = `:000000 000000 ${sha("0")} ${sha("0")} U\0conflict.txt\0`;
    assert.deepEqual(parseDiffRawZ(out), []);
  });

  it("parses cat-file --batch-check, keeping positions for missing objects", () => {
    assert.deepEqual(
      parseBatchCheckSizes(
        `${sha("a")} blob 12\n${sha("b")} missing\n${sha("c")} blob 0\n`,
      ),
      [12, undefined, 0],
    );
    assert.deepEqual(parseBatchCheckSizes(""), []);
  });

  it("parses ls-files --eol -z by index side", () => {
    const out = [
      "i/lf    w/crlf  attr/text=auto  \ta b.txt",
      "i/crlf  w/crlf  attr/           \tdos.txt",
      "i/-text w/-text attr/           \tbin.dat",
      "i/mixed w/mixed attr/           \tmix.txt",
      "",
    ].join("\0");
    const result = parseLsFilesEol(out);
    assert.equal(result.get("a b.txt"), "lf");
    assert.equal(result.get("dos.txt"), "crlf");
    assert.equal(result.get("bin.dat"), "-text");
    assert.equal(result.get("mix.txt"), "mixed");
    assert.equal(result.size, 4);
  });
});
