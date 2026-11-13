import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import {
  buildIncludeFileContent,
  copyIncludedFiles,
  parseIncludePatterns,
} from "./worktreeInclude.ts";

describe("parseIncludePatterns", () => {
  it("drops comments and blank lines", () => {
    const patterns = parseIncludePatterns(
      ["# local setup", "", ".env", "  .vscode/settings.json  ", "#x"].join(
        "\n",
      ),
    );
    assert.deepEqual(patterns, [".env", ".vscode/settings.json"]);
  });

  it("treats the freshly created template as no patterns", () => {
    // The template is all comments. An empty pattern would make git match
    // everything, so this must not leak a blank entry.
    assert.deepEqual(parseIncludePatterns(buildIncludeFileContent()), []);
  });

  it("keeps negation and directory patterns verbatim", () => {
    const patterns = parseIncludePatterns("node_modules/\n!keep.txt\n");
    assert.deepEqual(patterns, ["node_modules/", "!keep.txt"]);
  });

  it("handles CRLF files", () => {
    assert.deepEqual(parseIncludePatterns(".env\r\n.env.local\r\n"), [
      ".env",
      ".env.local",
    ]);
  });
});

describe("copyIncludedFiles", () => {
  let root = "";

  before(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "jgc-include-"));
  });

  after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("recreates the directory structure and overwrites the destination", async () => {
    const source = path.join(root, "src");
    const target = path.join(root, "dst");
    await fs.mkdir(path.join(source, ".vscode"), { recursive: true });
    await fs.writeFile(path.join(source, ".vscode", "settings.json"), "new");
    await fs.mkdir(target, { recursive: true });
    await fs.mkdir(path.join(target, ".vscode"), { recursive: true });
    await fs.writeFile(path.join(target, ".vscode", "settings.json"), "old");

    const result = await copyIncludedFiles(source, target, [
      ".vscode/settings.json",
    ]);

    assert.equal(result.copied, 1);
    assert.deepEqual(result.failed, []);
    assert.equal(
      await fs.readFile(path.join(target, ".vscode", "settings.json"), "utf-8"),
      "new",
    );
  });

  it("reports a missing source file instead of failing the batch", async () => {
    const source = path.join(root, "src2");
    const target = path.join(root, "dst2");
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, "present"), "x");

    const result = await copyIncludedFiles(source, target, [
      "present",
      "missing",
    ]);

    assert.equal(result.copied, 1);
    assert.deepEqual(result.failed, ["missing"]);
  });

  it("refuses paths that would escape either root", async () => {
    const source = path.join(root, "src3");
    const target = path.join(root, "dst3");
    await fs.mkdir(source, { recursive: true });

    const result = await copyIncludedFiles(source, target, [
      "../outside",
      "/etc/passwd",
      "",
    ]);

    assert.equal(result.copied, 0);
    assert.deepEqual(result.failed, ["../outside", "/etc/passwd", ""]);
  });
});
