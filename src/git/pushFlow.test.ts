import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { before, describe, it } from "node:test";
import { GitService } from "./gitService.ts";
import {
  type PushFlowSettings,
  type PushRequest,
  pushWithRecovery,
} from "./pushFlow.ts";
import {
  commitFile,
  createRemotePair,
  git,
  isolateGitEnvironment,
  makeTempDir,
} from "./testRepo.ts";

const settings = (
  overrides: Partial<PushFlowSettings> = {},
): PushFlowSettings => ({
  autoSetUpstream: true,
  rejectedAction: "ask",
  protectedBranches: [],
  saveChangesPolicy: "stash",
  ...overrides,
});

describe("pushWithRecovery against a real remote", () => {
  let root: string;
  let origin: string;
  let a: string;
  let b: string;
  let service: GitService;

  before(() => isolateGitEnvironment());

  // A fresh pair for every test: each one mutates history.
  const setup = async () => {
    root = await makeTempDir();
    ({ origin, a, b } = await createRemotePair(root));
    service = new GitService(a);
  };

  const teardown = async () => {
    await fs.rm(root, { recursive: true, force: true });
  };

  const request = (
    branchName: string,
    extra: Partial<PushRequest> = {},
  ): PushRequest => ({
    branchName,
    remote: "origin",
    targetBranch: branchName,
    force: false,
    ...extra,
  });

  /** The bare remote refuses implicit discovery under `safe.bareRepository=explicit`. */
  const bare = (...args: string[]) => git(root, "--git-dir", origin, ...args);

  const originTip = async (branch = "main") =>
    (await bare("rev-parse", branch)).trim();

  const originSubjects = async (branch: string) =>
    (await bare("log", "--reverse", "--format=%s", branch))
      .trim()
      .split("\n")
      .filter(Boolean);

  /** `b` pushes a commit to `main` that `a` has not fetched. */
  const pushFromB = async () => {
    await commitFile(b, "remote.txt", "from b\n", "Remote commit");
    await git(b, "push", "-q", "origin", "main");
  };

  describe("first push", () => {
    it("sets the upstream when the branch has none", async () => {
      await setup();
      try {
        await git(a, "checkout", "-q", "-b", "feat");
        await commitFile(a, "f.txt", "f\n", "Feature work");
        assert.equal(await service.hasUpstream("feat"), false);

        const result = await pushWithRecovery(
          service,
          request("feat"),
          settings(),
        );

        assert.equal(result.status, "pushed");
        assert.equal(result.status === "pushed" && result.setUpstream, true);
        assert.equal(await service.hasUpstream("feat"), true);
        assert.equal(
          (await git(a, "config", "branch.feat.remote")).trim(),
          "origin",
        );
        assert.equal(
          (await git(a, "config", "branch.feat.merge")).trim(),
          "refs/heads/feat",
        );
        assert.deepEqual(await originSubjects("feat"), [
          "Initial commit",
          "Feature work",
        ]);
      } finally {
        await teardown();
      }
    });

    it("leaves tracking alone when jgc.push.autoSetUpstream is off", async () => {
      await setup();
      try {
        await git(a, "checkout", "-q", "-b", "feat");
        await commitFile(a, "f.txt", "f\n", "Feature work");

        const result = await pushWithRecovery(
          service,
          request("feat"),
          settings({ autoSetUpstream: false }),
        );

        assert.equal(result.status === "pushed" && result.setUpstream, false);
        assert.equal(await service.hasUpstream("feat"), false);
        assert.deepEqual(await originSubjects("feat"), [
          "Initial commit",
          "Feature work",
        ]);
      } finally {
        await teardown();
      }
    });

    it("does not touch a branch that already tracks something", async () => {
      await setup();
      try {
        await commitFile(a, "f.txt", "f\n", "Local commit");
        const result = await pushWithRecovery(
          service,
          request("main"),
          settings(),
        );
        assert.equal(result.status === "pushed" && result.setUpstream, false);
      } finally {
        await teardown();
      }
    });

    it("tracks the branch after pushing a bare commit", async () => {
      await setup();
      try {
        await git(a, "checkout", "-q", "-b", "feat");
        const first = await commitFile(a, "1.txt", "1\n", "First");
        await commitFile(a, "2.txt", "2\n", "Second");

        const result = await pushWithRecovery(
          service,
          request("feat", {
            refspecSource: first,
            refspecDestination: "refs/heads/feat",
          }),
          settings(),
        );

        assert.equal(result.status, "pushed");
        assert.equal(await originTip("feat"), first);
        assert.equal(await service.hasUpstream("feat"), true);
      } finally {
        await teardown();
      }
    });
  });

  describe("rejected push", () => {
    it("detects a push that is behind unfetched remote work", async () => {
      await setup();
      try {
        await pushFromB();
        const remoteTip = await originTip();
        await commitFile(a, "local.txt", "a\n", "Local commit");

        const result = await pushWithRecovery(
          service,
          request("main"),
          settings(),
        );

        assert.equal(result.status, "rejected");
        if (result.status !== "rejected") return;
        assert.equal(result.rejection.kind, "fetch-first");
        assert.equal(result.canIntegrate, true);
        assert.equal(await originTip(), remoteTip, "remote is untouched");
      } finally {
        await teardown();
      }
    });

    it("classifies a diverged branch once the remote work is fetched", async () => {
      await setup();
      try {
        await pushFromB();
        await git(a, "fetch", "-q", "origin");
        await commitFile(a, "local.txt", "a\n", "Local commit");

        const result = await pushWithRecovery(
          service,
          request("main"),
          settings(),
        );

        assert.equal(result.status, "rejected");
        assert.equal(
          result.status === "rejected" && result.rejection.kind,
          "non-fast-forward",
        );
      } finally {
        await teardown();
      }
    });

    it("merges the remote work, then pushes once", async () => {
      await setup();
      try {
        await pushFromB();
        await commitFile(a, "local.txt", "a\n", "Local commit");

        const result = await pushWithRecovery(
          service,
          request("main"),
          settings(),
          { decision: { action: "merge" } },
        );

        assert.equal(result.status, "pushed");
        assert.equal(result.status === "pushed" && result.integrated, "merge");
        assert.equal(
          await originTip(),
          (await git(a, "rev-parse", "HEAD")).trim(),
        );
        const history = await originSubjects("main");
        assert.ok(history.includes("Remote commit"));
        assert.ok(history.includes("Local commit"));
        assert.equal(
          (await bare("rev-list", "--merges", "--count", "main")).trim(),
          "1",
        );
      } finally {
        await teardown();
      }
    });

    it("rebases onto the remote work, then pushes a linear history", async () => {
      await setup();
      try {
        await pushFromB();
        await commitFile(a, "local.txt", "a\n", "Local commit");

        const result = await pushWithRecovery(
          service,
          request("main"),
          settings(),
          { decision: { action: "rebase" } },
        );

        assert.equal(result.status === "pushed" && result.integrated, "rebase");
        assert.deepEqual(await originSubjects("main"), [
          "Initial commit",
          "Remote commit",
          "Local commit",
        ]);
      } finally {
        await teardown();
      }
    });

    it("applies jgc.push.rejectedAction without asking", async () => {
      await setup();
      try {
        await pushFromB();
        await commitFile(a, "local.txt", "a\n", "Local commit");
        let asked = false;

        const result = await pushWithRecovery(
          service,
          request("main"),
          settings({ rejectedAction: "rebase" }),
          {
            hooks: {
              chooseRejectedAction: async () => {
                asked = true;
                return { action: "cancel" };
              },
            },
          },
        );

        assert.equal(asked, false);
        assert.equal(result.status === "pushed" && result.integrated, "rebase");
      } finally {
        await teardown();
      }
    });

    it("asks the hook when the setting is ask, and honours cancel", async () => {
      await setup();
      try {
        await pushFromB();
        const remoteTip = await originTip();
        await commitFile(a, "local.txt", "a\n", "Local commit");
        const localTip = (await git(a, "rev-parse", "HEAD")).trim();
        const prompts: string[] = [];

        const result = await pushWithRecovery(
          service,
          request("main"),
          settings(),
          {
            hooks: {
              chooseRejectedAction: async (prompt) => {
                prompts.push(prompt.rejection.kind);
                return { action: "cancel" };
              },
            },
          },
        );

        assert.equal(result.status, "cancelled");
        assert.deepEqual(prompts, ["fetch-first"]);
        assert.equal(await originTip(), remoteTip);
        assert.equal((await git(a, "rev-parse", "HEAD")).trim(), localTip);
      } finally {
        await teardown();
      }
    });

    it("remembers the choice only when asked to", async () => {
      await setup();
      try {
        await pushFromB();
        await commitFile(a, "local.txt", "a\n", "Local commit");
        const remembered: string[] = [];

        await pushWithRecovery(service, request("main"), settings(), {
          decision: { action: "merge", remember: true },
          hooks: {
            rememberRejectedAction: async (action) => {
              remembered.push(action);
            },
          },
        });

        assert.deepEqual(remembered, ["merge"]);
      } finally {
        await teardown();
      }
    });

    it("cannot integrate a branch that is not checked out, nor a commit push", async () => {
      await setup();
      try {
        await git(a, "checkout", "-q", "-b", "other");
        await commitFile(a, "o.txt", "o\n", "Other one");
        await git(a, "push", "-q", "-u", "origin", "other");
        await git(b, "fetch", "-q", "origin");
        await git(b, "checkout", "-q", "other");
        await commitFile(b, "b.txt", "b\n", "Other from b");
        await git(b, "push", "-q", "origin", "other");
        await commitFile(a, "o2.txt", "o\n", "Other two");
        await git(a, "checkout", "-q", "main");

        const viaBranch = await pushWithRecovery(
          service,
          request("other"),
          settings({ rejectedAction: "merge" }),
        );
        assert.equal(viaBranch.status, "rejected");
        assert.equal(
          viaBranch.status === "rejected" && viaBranch.canIntegrate,
          false,
        );

        await assert.rejects(
          pushWithRecovery(service, request("other"), settings(), {
            decision: { action: "merge" },
          }),
          /not the checked-out branch/,
        );

        await git(a, "checkout", "-q", "other");
        const head = (await git(a, "rev-parse", "HEAD")).trim();
        const viaCommit = await pushWithRecovery(
          service,
          request("other", {
            refspecSource: head,
            refspecDestination: "refs/heads/other",
          }),
          settings({ rejectedAction: "rebase" }),
        );
        assert.equal(
          viaCommit.status === "rejected" && viaCommit.canIntegrate,
          false,
        );
      } finally {
        await teardown();
      }
    });

    it("rethrows a server-side hook rejection instead of offering a merge", async () => {
      await setup();
      try {
        const hook = path.join(origin, "hooks", "pre-receive");
        await fs.writeFile(hook, "#!/bin/sh\necho 'policy says no'\nexit 1\n");
        await fs.chmod(hook, 0o755);
        await commitFile(a, "local.txt", "a\n", "Local commit");
        let asked = false;

        await assert.rejects(
          pushWithRecovery(service, request("main"), settings(), {
            hooks: {
              chooseRejectedAction: async () => {
                asked = true;
                return { action: "cancel" };
              },
            },
          }),
          /pre-receive hook declined/,
        );
        assert.equal(asked, false);
      } finally {
        await teardown();
      }
    });

    it("does not mistake an auth or network failure for a rejection", async () => {
      await setup();
      try {
        await commitFile(a, "local.txt", "a\n", "Local commit");
        await assert.rejects(
          pushWithRecovery(
            service,
            request("main", { remote: "nowhere" }),
            settings(),
          ),
          /nowhere/,
        );
      } finally {
        await teardown();
      }
    });
  });

  describe("force with lease", () => {
    it("refuses when the remote moved since the last fetch", async () => {
      await setup();
      try {
        await pushFromB();
        const remoteTip = await originTip();
        await commitFile(a, "local.txt", "a\n", "Local commit");

        await assert.rejects(
          pushWithRecovery(
            service,
            request("main", { force: true }),
            settings(),
          ),
          /changed since your last fetch/,
        );
        assert.equal(await originTip(), remoteTip, "remote is untouched");
      } finally {
        await teardown();
      }
    });

    it("refuses the explicit choice after an unfetched rejection too", async () => {
      await setup();
      try {
        await pushFromB();
        const remoteTip = await originTip();
        await commitFile(a, "local.txt", "a\n", "Local commit");

        await assert.rejects(
          pushWithRecovery(service, request("main"), settings(), {
            decision: { action: "forceWithLease" },
          }),
          /changed since your last fetch/,
        );
        assert.equal(await originTip(), remoteTip);
      } finally {
        await teardown();
      }
    });

    it("overwrites the remote once the remote work has been fetched", async () => {
      await setup();
      try {
        await pushFromB();
        await git(a, "fetch", "-q", "origin");
        const localTip = await commitFile(
          a,
          "local.txt",
          "a\n",
          "Local commit",
        );

        const result = await pushWithRecovery(
          service,
          request("main"),
          settings(),
          { decision: { action: "forceWithLease" } },
        );

        assert.equal(result.status === "pushed" && result.forced, true);
        assert.equal(await originTip(), localTip);
      } finally {
        await teardown();
      }
    });
  });

  describe("protected branches", () => {
    it("refuses a force push before git runs", async () => {
      await setup();
      try {
        const remoteTip = await originTip();
        await commitFile(a, "local.txt", "a\n", "Local commit");

        await assert.rejects(
          pushWithRecovery(
            service,
            request("main", { force: true }),
            settings({ protectedBranches: ["main"] }),
          ),
          /protected branch "main"/,
        );
        assert.equal(await originTip(), remoteTip);
      } finally {
        await teardown();
      }
    });

    it("also refuses force with lease chosen after a rejection", async () => {
      await setup();
      try {
        await pushFromB();
        await git(a, "fetch", "-q", "origin");
        const remoteTip = await originTip();
        await commitFile(a, "local.txt", "a\n", "Local commit");

        await assert.rejects(
          pushWithRecovery(
            service,
            request("main"),
            settings({ protectedBranches: ["m*"] }),
            { decision: { action: "forceWithLease" } },
          ),
          /protected branch "main"/,
        );
        assert.equal(await originTip(), remoteTip);
      } finally {
        await teardown();
      }
    });

    it("still allows a normal push and a merge to a protected branch", async () => {
      await setup();
      try {
        await pushFromB();
        await commitFile(a, "local.txt", "a\n", "Local commit");

        const result = await pushWithRecovery(
          service,
          request("main"),
          settings({ protectedBranches: ["main"] }),
          { decision: { action: "merge" } },
        );

        assert.equal(result.status, "pushed");
      } finally {
        await teardown();
      }
    });
  });
});
