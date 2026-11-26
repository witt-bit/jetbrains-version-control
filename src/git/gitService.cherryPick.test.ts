import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { computeCherryMarks, parseCherryMarks } from "./cherryMarks.ts";
import {
  buildCherryPickArgs,
  type CherryPickEmptyStrategy,
  type CherryPickOptions,
  DEFAULT_CHERRY_PICK_OPTIONS,
  describeCherryPickOutcome,
  gitSupportsCherryPickEmpty,
  parseCherryPickOptions,
  runCherryPick,
} from "./cherryPick.ts";
import { GitService } from "./gitService.ts";
import {
  commitFile,
  createRepo,
  git,
  isolateGitEnvironment,
  makeTempDir,
} from "./testRepo.ts";

const options = (
  emptyStrategy: CherryPickEmptyStrategy,
  appendSourceHash = false,
): CherryPickOptions => ({ emptyStrategy, appendSourceHash });

describe("cherry-pick options", () => {
  it("defaults to what a plain `git cherry-pick <hash>` does", () => {
    assert.deepEqual(DEFAULT_CHERRY_PICK_OPTIONS, options("ask", false));
    assert.deepEqual(
      buildCherryPickArgs("abc", DEFAULT_CHERRY_PICK_OPTIONS, true),
      ["cherry-pick", "abc"],
    );
    assert.deepEqual(
      buildCherryPickArgs("abc", DEFAULT_CHERRY_PICK_OPTIONS, false),
      ["cherry-pick", "abc"],
    );
  });

  it("parses settings and ignores junk", () => {
    assert.deepEqual(
      parseCherryPickOptions(() => undefined),
      DEFAULT_CHERRY_PICK_OPTIONS,
    );
    assert.deepEqual(
      parseCherryPickOptions((k) => (k === "emptyStrategy" ? "sideways" : 1)),
      DEFAULT_CHERRY_PICK_OPTIONS,
    );
    assert.deepEqual(
      parseCherryPickOptions((k) =>
        k === "emptyStrategy" ? "createEmpty" : true,
      ),
      options("createEmpty", true),
    );
  });

  it("builds the flags per strategy, with and without --empty support", () => {
    const args = (o: CherryPickOptions, supported: boolean) =>
      buildCherryPickArgs("h", o, supported);
    assert.deepEqual(args(options("skip", true), true), [
      "cherry-pick",
      "-x",
      "--empty=drop",
      "h",
    ]);
    assert.deepEqual(args(options("createEmpty"), true), [
      "cherry-pick",
      "--empty=keep",
      "h",
    ]);
    assert.deepEqual(args(options("createEmpty", true), false), [
      "cherry-pick",
      "-x",
      "--keep-redundant-commits",
      "h",
    ]);
    // Old git has no flag for skipping; runCherryPick does it after the stop.
    assert.deepEqual(args(options("skip"), false), ["cherry-pick", "h"]);
  });

  it("detects --empty support from `git --version`", () => {
    assert.equal(gitSupportsCherryPickEmpty("git version 2.53.0"), true);
    assert.equal(gitSupportsCherryPickEmpty("git version 2.45.0"), true);
    assert.equal(
      gitSupportsCherryPickEmpty("git version 2.39.5 (Apple Git-154)"),
      false,
    );
    assert.equal(gitSupportsCherryPickEmpty("git version 3.0.0"), true);
    assert.equal(gitSupportsCherryPickEmpty("nonsense"), false);
  });

  it("names the strategy in the message for every empty outcome", () => {
    assert.match(
      describeCherryPickOutcome("droppedEmpty", "abc1234") ?? "",
      /abc1234.*emptyStrategy: skip/,
    );
    assert.match(
      describeCherryPickOutcome("committedEmpty", "abc1234") ?? "",
      /empty commit.*emptyStrategy: createEmpty/,
    );
    assert.match(
      describeCherryPickOutcome("pausedEmpty", "abc1234") ?? "",
      /in progress.*emptyStrategy: ask/,
    );
    assert.equal(describeCherryPickOutcome("picked", "abc1234"), undefined);
  });
});

describe("cherry-pick empty strategies against real git", () => {
  let dir: string;
  let service: GitService;
  let addA: string;

  before(() => {
    isolateGitEnvironment();
    // Any attempt to open an editor fails instead of hanging the test.
    process.env.GIT_EDITOR = "false";
  });
  after(() => {
    delete process.env.GIT_EDITOR;
  });

  /** `main` already holds the change of `addA`, a commit on `feature`. */
  const setup = async () => {
    dir = await makeTempDir();
    await createRepo(dir);
    await git(dir, "checkout", "-q", "-b", "feature");
    addA = await commitFile(dir, "a.txt", "one\n", "Add a");
    await git(dir, "checkout", "-q", "main");
    await commitFile(dir, "a.txt", "one\n", "Add a on main");
    service = new GitService(dir);
  };

  const teardown = () => fs.rm(dir, { recursive: true, force: true });
  const head = async () => (await git(dir, "rev-parse", "HEAD")).trim();
  const picking = async () =>
    git(dir, "rev-parse", "-q", "--verify", "CHERRY_PICK_HEAD").then(
      () => true,
      () => false,
    );
  const gitExec = (args: string[]) => git(dir, ...args);

  it("ask: stops and leaves the cherry-pick in progress, like plain git", async () => {
    await setup();
    try {
      const before = await head();
      const outcome = await service.cherryPick(addA, options("ask"));
      assert.equal(outcome, "pausedEmpty");
      assert.equal(await head(), before);
      assert.equal(await picking(), true);
      assert.equal((await service.getCherryPickState()).isCherryPicking, true);
    } finally {
      await teardown();
    }
  });

  it("ask is the default when no options are given", async () => {
    await setup();
    try {
      assert.equal(await service.cherryPick(addA), "pausedEmpty");
    } finally {
      await teardown();
    }
  });

  it("ask: the paused pick can be skipped or committed empty afterwards", async () => {
    await setup();
    try {
      const before = await head();
      await service.cherryPick(addA, options("ask"));
      await service.cherryPickAction("skip");
      assert.equal(await picking(), false);
      assert.equal(await head(), before);

      await service.cherryPick(addA, options("ask"));
      await service.cherryPickAction("continue");
      assert.equal(await picking(), false);
      assert.notEqual(await head(), before);
      assert.equal(
        (await git(dir, "log", "-1", "--format=%s")).trim(),
        "Add a",
      );
      assert.equal(
        await git(dir, "rev-parse", "HEAD^{tree}"),
        await git(dir, "rev-parse", `${before}^{tree}`),
      );
    } finally {
      await teardown();
    }
  });

  it("skip: drops the commit and leaves nothing in progress", async () => {
    await setup();
    try {
      const before = await head();
      assert.equal(
        await service.cherryPick(addA, options("skip")),
        "droppedEmpty",
      );
      assert.equal(await head(), before);
      assert.equal(await picking(), false);
      assert.equal((await git(dir, "status", "--porcelain")).trim(), "");
    } finally {
      await teardown();
    }
  });

  it("createEmpty: records an empty commit with the original message", async () => {
    await setup();
    try {
      const before = await head();
      assert.equal(
        await service.cherryPick(addA, options("createEmpty")),
        "committedEmpty",
      );
      assert.notEqual(await head(), before);
      assert.equal(await picking(), false);
      assert.equal(
        (await git(dir, "log", "-1", "--format=%s")).trim(),
        "Add a",
      );
      assert.equal(
        (await git(dir, "diff", "--name-only", "HEAD^", "HEAD")).trim(),
        "",
      );
    } finally {
      await teardown();
    }
  });

  for (const strategy of ["ask", "skip", "createEmpty"] as const) {
    it(`${strategy}: behaves the same on git without --empty`, async () => {
      await setup();
      try {
        const before = await head();
        const outcome = await runCherryPick(
          gitExec,
          addA,
          options(strategy),
          false,
        );
        const expected = {
          ask: "pausedEmpty",
          skip: "droppedEmpty",
          createEmpty: "committedEmpty",
        }[strategy];
        assert.equal(outcome, expected);
        assert.equal(await picking(), strategy === "ask");
        assert.equal((await head()) === before, strategy !== "createEmpty");
      } finally {
        await teardown();
      }
    });
  }

  it("settles a commit that was empty to begin with", async () => {
    await setup();
    try {
      await git(dir, "checkout", "-q", "feature");
      await git(dir, "commit", "-q", "--allow-empty", "-m", "Nothing here");
      const emptyCommit = await head();
      await git(dir, "checkout", "-q", "main");
      const before = await head();

      assert.equal(
        await service.cherryPick(emptyCommit, options("skip")),
        "droppedEmpty",
      );
      assert.equal(await head(), before);
      assert.equal(await picking(), false);

      assert.equal(
        await service.cherryPick(emptyCommit, options("createEmpty")),
        "committedEmpty",
      );
      assert.equal(
        (await git(dir, "log", "-1", "--format=%s")).trim(),
        "Nothing here",
      );
    } finally {
      await teardown();
    }
  });

  it("reports an ordinary pick as picked", async () => {
    await setup();
    try {
      await git(dir, "checkout", "-q", "feature");
      const addB = await commitFile(dir, "b.txt", "bee\n", "Add b");
      await git(dir, "checkout", "-q", "main");
      const mainHead = await head();
      for (const strategy of ["ask", "skip", "createEmpty"] as const) {
        await git(dir, "reset", "-q", "--hard", mainHead);
        assert.equal(
          await service.cherryPick(addB, options(strategy)),
          "picked",
          strategy,
        );
        assert.equal(
          (await git(dir, "log", "-1", "--format=%s")).trim(),
          "Add b",
        );
      }
    } finally {
      await teardown();
    }
  });

  it("rethrows a conflict and leaves it in progress, whatever the strategy", async () => {
    await setup();
    try {
      await git(dir, "checkout", "-q", "feature");
      const change = await commitFile(dir, "c.txt", "feature\n", "Feature c");
      await git(dir, "checkout", "-q", "main");
      await commitFile(dir, "c.txt", "main\n", "Main c");
      // Both sides add c.txt differently: an add/add conflict.
      for (const strategy of ["ask", "skip", "createEmpty"] as const) {
        await assert.rejects(
          service.cherryPick(change, options(strategy)),
          /conflict/i,
          strategy,
        );
        assert.equal(await picking(), true, strategy);
        await service.cherryPickAction("abort");
        assert.equal(await picking(), false, strategy);
      }
    } finally {
      await teardown();
    }
  });

  it("-x appends the source hash only when asked", async () => {
    await setup();
    try {
      await git(dir, "checkout", "-q", "feature");
      const addB = await commitFile(dir, "b.txt", "bee\n", "Add b");
      const addC = await commitFile(dir, "c.txt", "sea\n", "Add c");
      await git(dir, "checkout", "-q", "main");

      await service.cherryPick(addB, options("ask", true));
      assert.match(
        await git(dir, "log", "-1", "--format=%B"),
        new RegExp(`\\(cherry picked from commit ${addB}\\)`),
      );

      await service.cherryPick(addC, options("ask", false));
      assert.doesNotMatch(
        await git(dir, "log", "-1", "--format=%B"),
        /cherry picked from commit/,
      );
    } finally {
      await teardown();
    }
  });
});

describe("not cherry-picked commits against real git", () => {
  let dir: string;
  let service: GitService;

  before(() => isolateGitEnvironment());

  it("splits a branch into picked and not-yet-picked commits", async () => {
    dir = await makeTempDir();
    try {
      await createRepo(dir);
      await git(dir, "checkout", "-q", "-b", "feature");
      const f1 = await commitFile(dir, "f1.txt", "one\n", "Feature 1");
      const f2 = await commitFile(dir, "f2.txt", "two\n", "Feature 2");
      const f3 = await commitFile(dir, "f3.txt", "three\n", "Feature 3");
      await git(dir, "checkout", "-q", "main");
      await commitFile(dir, "m1.txt", "mine\n", "Main 1");
      await git(dir, "cherry-pick", f1);
      const copy1 = (await git(dir, "rev-parse", "HEAD")).trim();
      await git(dir, "cherry-pick", f2);
      const copy2 = (await git(dir, "rev-parse", "HEAD")).trim();

      service = new GitService(dir);
      const marks = await service.getCherryMarks("feature");
      assert.deepEqual(marks.notCherryPicked, [f3]);
      assert.deepEqual(
        [...marks.cherryPicked].sort(),
        [f1, f2, copy1, copy2].sort(),
      );

      // A single commit works as the reference too.
      const fromCommit = await service.getCherryMarks(f3);
      assert.deepEqual(fromCommit.notCherryPicked, [f3]);
      assert.deepEqual(
        [...fromCommit.cherryPicked].sort(),
        [f1, f2, copy1, copy2].sort(),
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("follows the pick: nothing is left once the commit is cherry-picked", async () => {
    dir = await makeTempDir();
    try {
      await createRepo(dir);
      await git(dir, "checkout", "-q", "-b", "feature");
      const f1 = await commitFile(dir, "f1.txt", "one\n", "Feature 1");
      await git(dir, "checkout", "-q", "main");
      // Without a commit of its own, main would fast-forward to the same hash.
      await commitFile(dir, "m1.txt", "mine\n", "Main 1");
      service = new GitService(dir);
      assert.deepEqual(
        (await service.getCherryMarks("feature")).notCherryPicked,
        [f1],
      );
      await service.cherryPick(f1);
      const marks = await service.getCherryMarks("feature");
      assert.deepEqual(marks.notCherryPicked, []);
      assert.equal(marks.cherryPicked.length, 2);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("returns nothing for an unknown ref and refuses an option-like one", async () => {
    dir = await makeTempDir();
    try {
      await createRepo(dir);
      service = new GitService(dir);
      assert.deepEqual(await service.getCherryMarks("no-such-branch"), {
        notCherryPicked: [],
        cherryPicked: [],
      });
      await assert.rejects(service.getCherryMarks("--all"), /Invalid revision/);
      await assert.rejects(
        computeCherryMarks((args) => git(dir, ...args), "-n1"),
        /Invalid revision/,
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("parses the rev-list marks and skips headers", () => {
    const h = (c: string) => c.repeat(40);
    const parsed = parseCherryMarks(
      [
        `<${h("a")}`,
        `>${h("b")}`,
        `=${h("c")}`,
        "garbage",
        `=${h("d")}`,
        "",
      ].join("\n"),
    );
    assert.deepEqual(parsed, {
      notCherryPicked: [h("b")],
      cherryPicked: [h("c"), h("d")],
    });
  });
});
