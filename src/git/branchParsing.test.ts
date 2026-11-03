import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRemoteBranchLines } from "./branchParsing.ts";

const SEP = "\x00";

/** Build one `git branch -r --format=...` line. */
function line(shortName: string, fullRef: string, hash = "714d3a3"): string {
  return [shortName, " ", "", "", hash, fullRef].join(SEP);
}

describe("parseRemoteBranchLines", () => {
  it("keeps real remote branches", () => {
    const output = [
      line("origin/main", "refs/remotes/origin/main"),
      line("origin/feat/i18n", "refs/remotes/origin/feat/i18n"),
    ].join("\n");

    const result = parseRemoteBranchLines(output);
    assert.deepEqual(
      result.map((b) => b.name),
      ["origin/main", "origin/feat/i18n"],
    );
    assert.ok(result.every((b) => b.isRemote));
    assert.equal(result[0].lastCommitHash, "714d3a3");
  });

  it("drops every per-remote HEAD symref", () => {
    // Regression: `%(refname:short)` resolves refs/remotes/origin/HEAD to
    // "origin", so an endsWith("/HEAD") check on the SHORT name missed it and
    // a phantom branch named after the remote showed up in the tree.
    const output = [
      line("origin", "refs/remotes/origin/HEAD", "81b9ce2"),
      line("origin/main", "refs/remotes/origin/main", "81b9ce2"),
      line("dunlingzi", "refs/remotes/dunlingzi/HEAD", "714d3a3"),
      line("dunlingzi/main", "refs/remotes/dunlingzi/main", "714d3a3"),
    ].join("\n");

    const names = parseRemoteBranchLines(output).map((b) => b.name);
    assert.deepEqual(names, ["origin/main", "dunlingzi/main"]);
  });

  it("drops slash-less entries even without a full refname field", () => {
    const output = [
      ["origin", " ", "", "", "81b9ce2"].join(SEP),
      line("origin/main", "refs/remotes/origin/main"),
    ].join("\n");

    assert.deepEqual(
      parseRemoteBranchLines(output).map((b) => b.name),
      ["origin/main"],
    );
  });

  it("ignores blank lines", () => {
    const output = `\n${line("origin/main", "refs/remotes/origin/main")}\n\n`;
    assert.equal(parseRemoteBranchLines(output).length, 1);
  });
});
