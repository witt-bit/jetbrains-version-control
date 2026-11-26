import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { before, describe, it } from "node:test";
import { GitService } from "./gitService.ts";
import {
  type CheckoutBlockers,
  type CheckoutRequest,
  checkoutWithRecovery,
  classifyCheckoutFailure,
  parseCheckoutBlockers,
  type SmartCheckoutChoice,
  type SmartCheckoutPrompts,
  summarizeFiles,
} from "./smartCheckout.ts";
import {
  commitFile,
  createRepo,
  git,
  isolateGitEnvironment,
  makeTempDir,
} from "./testRepo.ts";

describe("parseCheckoutBlockers", () => {
  it("reads the tracked-files block", () => {
    const out = [
      "error: Your local changes to the following files would be overwritten by checkout:",
      "\tsrc/a.txt",
      "\tb.txt",
      "Please commit your changes or stash them before you switch branches.",
      "Aborting",
    ].join("\n");
    assert.deepEqual(parseCheckoutBlockers(out), {
      trackedFiles: ["src/a.txt", "b.txt"],
      untrackedFiles: [],
    });
  });

  it("reads the untracked-files block and keeps it apart from tracked files", () => {
    const out = [
      "error: The following untracked working tree files would be overwritten by checkout:",
      "\tnew.txt",
      "Please move or remove them before you switch branches.",
      "Aborting",
    ].join("\n");
    assert.deepEqual(parseCheckoutBlockers(out), {
      trackedFiles: [],
      untrackedFiles: ["new.txt"],
    });
  });

  it("reads both blocks when git reports both", () => {
    const out = [
      "error: Your local changes to the following files would be overwritten by checkout:",
      "\tf.txt",
      "Please commit your changes or stash them before you switch branches.",
      "error: The following untracked working tree files would be overwritten by checkout:",
      "\tu.txt",
      "Please move or remove them before you switch branches.",
      "Aborting",
    ].join("\n");
    assert.deepEqual(parseCheckoutBlockers(out), {
      trackedFiles: ["f.txt"],
      untrackedFiles: ["u.txt"],
    });
  });

  it("unquotes paths git quotes and tolerates CRLF", () => {
    const out =
      'error: Your local changes to the following files would be overwritten by checkout:\r\n\t"we\\"ird.txt"\r\nPlease commit your changes or stash them before you switch branches.\r\n';
    assert.deepEqual(parseCheckoutBlockers(out)?.trackedFiles, ['we"ird.txt']);
  });

  it("treats the advice line alone as a tracked-changes refusal", () => {
    assert.deepEqual(
      parseCheckoutBlockers(
        "Please commit your changes or stash them before you switch branches.",
      ),
      { trackedFiles: [], untrackedFiles: [] },
    );
  });

  it("ignores every other failure", () => {
    assert.equal(
      parseCheckoutBlockers("error: pathspec 'nope' did not match"),
      null,
    );
    assert.equal(
      parseCheckoutBlockers(
        "error: Your local changes to the following files would be overwritten by merge:\n\tf.txt",
      ),
      null,
    );
    assert.equal(parseCheckoutBlockers(""), null);
  });
});

describe("classifyCheckoutFailure", () => {
  const stderr = [
    "error: Your local changes to the following files would be overwritten by checkout:",
    "\tf.txt",
    "Please commit your changes or stash them before you switch branches.",
  ].join("\n");

  it("reads execFile errors without listing a file twice", () => {
    const err = Object.assign(
      new Error(`Command failed: git checkout x\n${stderr}`),
      {
        stderr,
      },
    );
    assert.deepEqual(classifyCheckoutFailure(err), {
      trackedFiles: ["f.txt"],
      untrackedFiles: [],
    });
  });

  it("returns null for unrelated errors and non-errors", () => {
    assert.equal(classifyCheckoutFailure(new Error("boom")), null);
    assert.equal(classifyCheckoutFailure(undefined), null);
  });
});

describe("summarizeFiles", () => {
  it("lists a few files and counts the rest", () => {
    assert.equal(summarizeFiles(["a", "b"]), "a\nb");
    const many = Array.from({ length: 11 }, (_, i) => `f${i}`);
    const text = summarizeFiles(many, 8);
    assert.equal(text.split("\n").length, 9);
    assert.match(text, /and 3 more$/);
  });
});

describe("checkoutWithRecovery (real repositories)", () => {
  let root: string;
  let service: GitService;

  before(() => isolateGitEnvironment());

  /**
   * `main` and `feature` both have f.txt. `feature` rewrites line 1 and adds
   * u.txt; `main` is checked out afterwards.
   */
  const setup = async () => {
    root = await makeTempDir();
    await createRepo(root);
    await commitFile(root, "f.txt", "a\nb\nc\n", "Add f");
    await git(root, "checkout", "-q", "-b", "feature");
    await commitFile(root, "f.txt", "A\nb\nc\n", "Rewrite line 1");
    await commitFile(root, "u.txt", "from feature\n", "Add u");
    await git(root, "checkout", "-q", "main");
    service = new GitService(root);
  };

  const teardown = () => fs.rm(root, { recursive: true, force: true });

  const read = (file: string) => fs.readFile(path.join(root, file), "utf-8");
  const head = async () =>
    (await git(root, "rev-parse", "--abbrev-ref", "HEAD")).trim();
  const stashes = async () =>
    (await git(root, "stash", "list", "--format=%s"))
      .trim()
      .split("\n")
      .filter(Boolean);

  const request = (target: string): CheckoutRequest => ({
    target,
    checkout: () => service.checkout(target),
    forceCheckout: () => service.checkoutForced(target),
  });

  interface PromptLog {
    resolutions: CheckoutBlockers[];
    forceConfirmations: number;
    untracked: CheckoutBlockers[];
  }

  const prompts = (
    choice: SmartCheckoutChoice,
    confirmForce = true,
  ): { prompts: SmartCheckoutPrompts; log: PromptLog } => {
    const log: PromptLog = {
      resolutions: [],
      forceConfirmations: 0,
      untracked: [],
    };
    return {
      log,
      prompts: {
        async chooseResolution(blockers) {
          log.resolutions.push(blockers);
          return choice;
        },
        async confirmForce() {
          log.forceConfirmations++;
          return confirmForce;
        },
        async reportUntracked(blockers) {
          log.untracked.push(blockers);
        },
      },
    };
  };

  it("git refuses the dirty checkout and the refusal is classified from the real error", async () => {
    await setup();
    try {
      await fs.writeFile(path.join(root, "f.txt"), "a\nb\nC\n");
      let failure: unknown;
      try {
        await service.checkout("feature");
      } catch (err) {
        failure = err;
      }
      assert.deepEqual(classifyCheckoutFailure(failure), {
        trackedFiles: ["f.txt"],
        untrackedFiles: [],
      });
    } finally {
      await teardown();
    }
  });

  it("smart checkout carries a conflicting dirty file across the switch", async () => {
    await setup();
    try {
      await fs.writeFile(path.join(root, "f.txt"), "a\nb\nC\n");
      const { prompts: p, log } = prompts("smart");
      const outcome = await checkoutWithRecovery(
        service,
        request("feature"),
        "stash",
        p,
      );
      assert.deepEqual(outcome, { kind: "done", mode: "smart" });
      assert.equal(await head(), "feature");
      assert.equal(await read("f.txt"), "A\nb\nC\n", "both edits survive");
      assert.deepEqual(await stashes(), [], "the saved stash was popped");
      assert.deepEqual(log.resolutions, [
        { trackedFiles: ["f.txt"], untrackedFiles: [] },
      ]);
      assert.equal(log.forceConfirmations, 0);
    } finally {
      await teardown();
    }
  });

  it("smart checkout works with the shelf policy too", async () => {
    await setup();
    try {
      await fs.writeFile(path.join(root, "f.txt"), "a\nb\nC\n");
      const outcome = await checkoutWithRecovery(
        service,
        request("feature"),
        "shelve",
        prompts("smart").prompts,
      );
      assert.deepEqual(outcome, { kind: "done", mode: "smart" });
      assert.equal(await head(), "feature");
      assert.equal(await read("f.txt"), "A\nb\nC\n");
      assert.deepEqual(await stashes(), []);
    } finally {
      await teardown();
    }
  });

  it("keeps the saved changes and says so when restoring conflicts", async () => {
    await setup();
    try {
      await fs.writeFile(path.join(root, "f.txt"), "LOCAL\nb\nc\n");
      const outcome = await checkoutWithRecovery(
        service,
        request("feature"),
        "stash",
        prompts("smart").prompts,
      );
      assert.equal(outcome.kind, "restoreFailed");
      if (outcome.kind === "restoreFailed") {
        assert.match(outcome.message, /still saved in the stash/);
      }
      assert.equal(await head(), "feature", "the checkout itself happened");
      assert.deepEqual(await stashes(), [
        "On main: Checkout feature (changes saved by JGC)",
      ]);
      assert.equal(
        await git(root, "show", "stash@{0}:f.txt"),
        "LOCAL\nb\nc\n",
        "the stash still holds the local edit",
      );
    } finally {
      await teardown();
    }
  });

  it("force checkout discards the local change after confirmation", async () => {
    await setup();
    try {
      await fs.writeFile(path.join(root, "f.txt"), "a\nb\nC\n");
      const { prompts: p, log } = prompts("force");
      const outcome = await checkoutWithRecovery(
        service,
        request("feature"),
        "stash",
        p,
      );
      assert.deepEqual(outcome, { kind: "done", mode: "force" });
      assert.equal(log.forceConfirmations, 1);
      assert.equal(await head(), "feature");
      assert.equal(await read("f.txt"), "A\nb\nc\n", "local edit is gone");
      assert.deepEqual(await stashes(), []);
    } finally {
      await teardown();
    }
  });

  it("changes nothing when force is not confirmed", async () => {
    await setup();
    try {
      await fs.writeFile(path.join(root, "f.txt"), "a\nb\nC\n");
      const outcome = await checkoutWithRecovery(
        service,
        request("feature"),
        "stash",
        prompts("force", false).prompts,
      );
      assert.deepEqual(outcome, { kind: "cancelled" });
      assert.equal(await head(), "main");
      assert.equal(await read("f.txt"), "a\nb\nC\n");
      assert.deepEqual(await stashes(), []);
    } finally {
      await teardown();
    }
  });

  it("changes nothing on cancel", async () => {
    await setup();
    try {
      await fs.writeFile(path.join(root, "f.txt"), "a\nb\nC\n");
      const outcome = await checkoutWithRecovery(
        service,
        request("feature"),
        "stash",
        prompts("cancel").prompts,
      );
      assert.deepEqual(outcome, { kind: "cancelled" });
      assert.equal(await head(), "main");
      assert.equal(await read("f.txt"), "a\nb\nC\n");
      assert.deepEqual(await stashes(), []);
    } finally {
      await teardown();
    }
  });

  it("leaves a clean checkout untouched and never prompts", async () => {
    await setup();
    try {
      // A dirty file git can carry over by itself is not a conflict.
      await fs.writeFile(path.join(root, "README.md"), "edited\n");
      const { prompts: p, log } = prompts("cancel");
      const outcome = await checkoutWithRecovery(
        service,
        request("feature"),
        "stash",
        p,
      );
      assert.deepEqual(outcome, { kind: "done", mode: "plain" });
      assert.equal(await head(), "feature");
      assert.equal(await read("README.md"), "edited\n");
      assert.deepEqual(await stashes(), []);
      assert.equal(log.resolutions.length, 0);
    } finally {
      await teardown();
    }
  });

  it("does not offer to save or discard untracked files in the way", async () => {
    await setup();
    try {
      await fs.writeFile(path.join(root, "u.txt"), "precious\n");
      const { prompts: p, log } = prompts("force");
      const outcome = await checkoutWithRecovery(
        service,
        request("feature"),
        "stash",
        p,
      );
      assert.deepEqual(outcome, { kind: "blocked", files: ["u.txt"] });
      assert.equal(log.resolutions.length, 0, "no smart or force choice");
      assert.equal(log.untracked.length, 1);
      assert.equal(await head(), "main");
      assert.equal(await read("u.txt"), "precious\n", "no data loss");
      assert.deepEqual(await stashes(), []);
    } finally {
      await teardown();
    }
  });

  it("rethrows failures that are not local-change refusals", async () => {
    await setup();
    try {
      const { prompts: p, log } = prompts("smart");
      await assert.rejects(
        checkoutWithRecovery(service, request("no-such-ref"), "stash", p),
        /no-such-ref/,
      );
      assert.equal(log.resolutions.length, 0);
    } finally {
      await teardown();
    }
  });

  it("checkoutNewBranch is atomic: a refused switch creates no branch", async () => {
    await setup();
    try {
      await fs.writeFile(path.join(root, "f.txt"), "a\nb\nC\n");
      await assert.rejects(service.checkoutNewBranch("topic", "feature"));
      assert.equal(
        (await git(root, "branch", "--list", "topic")).trim(),
        "",
        "no stray branch",
      );
      assert.equal(await head(), "main");

      const outcome = await checkoutWithRecovery(
        service,
        {
          target: "topic",
          checkout: () => service.checkoutNewBranch("topic", "feature"),
          forceCheckout: () =>
            service.checkoutNewBranch("topic", "feature", {
              discardChanges: true,
            }),
        },
        "stash",
        prompts("smart").prompts,
      );
      assert.deepEqual(outcome, { kind: "done", mode: "smart" });
      assert.equal(await head(), "topic");
      assert.equal(await read("f.txt"), "A\nb\nC\n");
    } finally {
      await teardown();
    }
  });

  it("checkoutNewBranch can reset an existing branch", async () => {
    await setup();
    try {
      await service.checkoutNewBranch("topic", "feature");
      await git(root, "checkout", "-q", "main");
      await assert.rejects(service.checkoutNewBranch("topic", "main"));
      await service.checkoutNewBranch("topic", "main", { reset: true });
      assert.equal(await head(), "topic");
      assert.equal(
        (await git(root, "rev-parse", "topic")).trim(),
        (await git(root, "rev-parse", "main")).trim(),
      );
    } finally {
      await teardown();
    }
  });
});
