import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { before, describe, it } from "node:test";
import {
  type BlameDetectMovements,
  type BlameOptions,
  blameFlags,
  blameOptionsKey,
  DEFAULT_BLAME_OPTIONS,
  isBlameSnapshotReusable,
  parseBlameOptions,
} from "./blameOptions.ts";
import { GitService } from "./gitService.ts";
import {
  commitFile,
  createRepo,
  git,
  isolateGitEnvironment,
  makeTempDir,
} from "./testRepo.ts";

describe("blame options", () => {
  it("builds the flags for every combination", () => {
    const flags = (
      ignoreWhitespace: boolean,
      detectMovements: BlameDetectMovements,
    ) => blameFlags({ ignoreWhitespace, detectMovements });
    assert.deepEqual(flags(true, "inner"), ["-w", "-M"]);
    assert.deepEqual(flags(true, "none"), ["-w"]);
    assert.deepEqual(flags(true, "outer"), ["-w", "-M", "-C"]);
    assert.deepEqual(flags(false, "none"), []);
    assert.deepEqual(flags(false, "inner"), ["-M"]);
    assert.deepEqual(flags(false, "outer"), ["-M", "-C"]);
  });

  it("defaults to the previous hardcoded behavior and ignores junk", () => {
    assert.deepEqual(blameFlags(DEFAULT_BLAME_OPTIONS), ["-w", "-M"]);
    assert.deepEqual(
      parseBlameOptions(() => undefined),
      DEFAULT_BLAME_OPTIONS,
    );
    assert.deepEqual(
      parseBlameOptions((k) => (k === "ignoreWhitespace" ? "yes" : "sideways")),
      DEFAULT_BLAME_OPTIONS,
    );
    assert.deepEqual(
      parseBlameOptions((k) => (k === "ignoreWhitespace" ? false : "outer")),
      { ignoreWhitespace: false, detectMovements: "outer" },
    );
  });

  it("only reuses a cached blame made with the same options", () => {
    const inner = blameOptionsKey(DEFAULT_BLAME_OPTIONS);
    const outer = blameOptionsKey({
      ignoreWhitespace: true,
      detectMovements: "outer",
    });
    assert.notEqual(inner, outer);
    const snapshot = { docVersion: 3, optionsKey: inner };
    assert.equal(
      isBlameSnapshotReusable(snapshot, {
        docVersion: 3,
        isDirty: false,
        optionsKey: inner,
      }),
      true,
    );
    // A new version re-blames, unless the document is dirty.
    assert.equal(
      isBlameSnapshotReusable(snapshot, {
        docVersion: 4,
        isDirty: false,
        optionsKey: inner,
      }),
      false,
    );
    assert.equal(
      isBlameSnapshotReusable(snapshot, {
        docVersion: 4,
        isDirty: true,
        optionsKey: inner,
      }),
      true,
    );
    // Changing an option wins over both, even for an unchanged dirty document.
    for (const isDirty of [false, true]) {
      assert.equal(
        isBlameSnapshotReusable(snapshot, {
          docVersion: 3,
          isDirty,
          optionsKey: outer,
        }),
        false,
        `dirty=${isDirty}`,
      );
    }
  });
});

describe("GitService blame options against real git", () => {
  let dir: string;
  let service: GitService;

  before(() => isolateGitEnvironment());

  const setup = async () => {
    dir = await makeTempDir();
    await createRepo(dir);
    service = new GitService(dir);
  };

  const teardown = async () => {
    await fs.rm(dir, { recursive: true, force: true });
  };

  const options = (
    detectMovements: BlameDetectMovements,
    ignoreWhitespace = true,
  ): BlameOptions => ({ ignoreWhitespace, detectMovements });

  /** Hash that git blames each line of `file` on, in line order. */
  const blamedHashes = async (file: string, opts: BlameOptions) =>
    (await service.blame(file, opts)).map((l) => l.hash);

  // Moved blocks must carry 20+ alphanumeric characters for git to follow them.
  const ALPHA = "alpha: the quick brown fox jumps over the lazy dog\n";
  const BETA = "beta: pack my box with five dozen liquor jugs\n";
  const GAMMA = "gamma: sphinx of black quartz judge my vow\n";

  it("follows lines moved within a file only for inner and outer", async () => {
    await setup();
    try {
      const first = await commitFile(
        dir,
        "moved.txt",
        `head\n${ALPHA}${BETA}${GAMMA}tail\n`,
        "Create",
      );
      const second = await commitFile(
        dir,
        "moved.txt",
        `head\n${GAMMA}tail\n${ALPHA}${BETA}`,
        "Move the alpha and beta lines to the end",
      );

      // none: the moved lines look new; inner and outer see them as old.
      assert.deepEqual(await blamedHashes("moved.txt", options("none")), [
        first,
        first,
        first,
        second,
        second,
      ]);
      for (const mode of ["inner", "outer"] as const) {
        assert.deepEqual(
          await blamedHashes("moved.txt", options(mode)),
          [first, first, first, first, first],
          mode,
        );
      }
    } finally {
      await teardown();
    }
  });

  it("follows lines moved between files only for outer", async () => {
    await setup();
    try {
      const first = await commitFile(
        dir,
        "source.txt",
        `keep\n${ALPHA}${BETA}end\n`,
        "Create source",
      );
      await commitFile(dir, "target.txt", "first line\n", "Create target");
      // One commit takes the lines out of source.txt and puts them in
      // target.txt: only -C looks at the other files that commit modified.
      await fs.writeFile(`${dir}/source.txt`, "keep\nend\n");
      await fs.writeFile(`${dir}/target.txt`, `first line\n${ALPHA}${BETA}`);
      await git(dir, "add", "--", "source.txt", "target.txt");
      await git(dir, "commit", "-q", "-m", "Move lines to target");
      const moved = (await git(dir, "rev-parse", "HEAD")).trim();
      const targetCreate = (
        await git(dir, "log", "--format=%H", "--", "target.txt")
      )
        .trim()
        .split("\n")
        .pop();

      for (const mode of ["none", "inner"] as const) {
        assert.deepEqual(
          await blamedHashes("target.txt", options(mode)),
          [targetCreate, moved, moved],
          mode,
        );
      }
      assert.deepEqual(await blamedHashes("target.txt", options("outer")), [
        targetCreate,
        first,
        first,
      ]);
    } finally {
      await teardown();
    }
  });

  it("ignores whitespace-only edits only when asked to", async () => {
    await setup();
    try {
      const first = await commitFile(
        dir,
        "indent.txt",
        "if (ready) {\nrun();\n}\n",
        "Create",
      );
      const second = await commitFile(
        dir,
        "indent.txt",
        "if (ready) {\n    run();\n}\n",
        "Indent",
      );
      assert.deepEqual(
        await blamedHashes("indent.txt", options("none", true)),
        [first, first, first],
      );
      assert.deepEqual(
        await blamedHashes("indent.txt", options("none", false)),
        [first, second, first],
      );
    } finally {
      await teardown();
    }
  });

  it("applies the options to a blame of a past revision", async () => {
    await setup();
    try {
      const first = await commitFile(
        dir,
        "moved.txt",
        `head\n${ALPHA}${BETA}${GAMMA}tail\n`,
        "Create",
      );
      const second = await commitFile(
        dir,
        "moved.txt",
        `head\n${GAMMA}tail\n${ALPHA}${BETA}`,
        "Move",
      );
      await commitFile(dir, "moved.txt", "rewritten\n", "Rewrite");
      const at = async (mode: BlameDetectMovements) =>
        (await service.blameAt(second, "moved.txt", options(mode))).map(
          (l) => l.hash,
        );
      assert.deepEqual(await at("none"), [first, first, first, second, second]);
      assert.deepEqual(await at("inner"), [first, first, first, first, first]);
    } finally {
      await teardown();
    }
  });
});
