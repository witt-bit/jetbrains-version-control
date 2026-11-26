import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isIntegrableKind,
  isLeaseFailureKind,
  parsePushRejection,
} from "./pushRejection.ts";

// Strings captured from git 2.53 with LC_ALL=C.
const FETCH_FIRST = `To /srv/origin.git
 ! [rejected]        main -> main (fetch first)
error: failed to push some refs to '/srv/origin.git'
hint: Updates were rejected because the remote contains work that you do not
hint: have locally. This is usually caused by another repository pushing to
hint: the same ref. If you want to integrate the remote changes, use
hint: 'git pull' before pushing again.
hint: See the 'Note about fast-forwards' in 'git push --help' for details.
`;

const NON_FAST_FORWARD = `To /srv/origin.git
 ! [rejected]        main -> main (non-fast-forward)
error: failed to push some refs to '/srv/origin.git'
hint: Updates were rejected because the tip of your current branch is behind
hint: its remote counterpart. If you want to integrate the remote changes,
hint: use 'git pull' before pushing again.
`;

const STALE_INFO = `To /srv/origin.git
 ! [rejected]        main -> main (stale info)
error: failed to push some refs to '/srv/origin.git'
`;

const HOOK_DECLINED = `remote: policy says no
To /srv/origin.git
 ! [remote rejected] main -> main (pre-receive hook declined)
error: failed to push some refs to '/srv/origin.git'
`;

describe("parsePushRejection", () => {
  it("classifies a push that is behind unfetched remote work", () => {
    const rejection = parsePushRejection(FETCH_FIRST);
    assert.equal(rejection?.kind, "fetch-first");
    assert.deepEqual(rejection?.refs, [
      { localRef: "main", remoteRef: "main", reason: "fetch first" },
    ]);
  });

  it("classifies a diverged branch", () => {
    assert.equal(
      parsePushRejection(NON_FAST_FORWARD)?.kind,
      "non-fast-forward",
    );
  });

  it("classifies a failed force-with-lease as stale info", () => {
    assert.equal(parsePushRejection(STALE_INFO)?.kind, "stale-info");
  });

  it("classifies the --force-if-includes refusal", () => {
    const text =
      " ! [rejected]        main -> main (remote ref updated since checkout)\nerror: failed to push some refs to 'x'\n";
    assert.equal(parsePushRejection(text)?.kind, "remote-updated");
  });

  it("tells a server-side hook apart from a rejection merging can fix", () => {
    const rejection = parsePushRejection(HOOK_DECLINED);
    assert.equal(rejection?.kind, "hook-declined");
    assert.equal(isIntegrableKind("hook-declined"), false);
  });

  it("classifies other server refusals and existing tags", () => {
    assert.equal(
      parsePushRejection(
        " ! [remote rejected] main (deletion of the current branch prohibited)\nerror: failed to push some refs to 'x'",
      )?.kind,
      "remote-rejected",
    );
    assert.equal(
      parsePushRejection(
        " ! [rejected]        v1 -> v1 (already exists)\nerror: failed to push some refs to 'x'",
      )?.kind,
      "already-exists",
    );
  });

  it("reports the first ref that merging cannot fix when several are refused", () => {
    const text = [
      " ! [rejected]        main -> main (fetch first)",
      " ! [remote rejected] topic -> topic (pre-receive hook declined)",
      "error: failed to push some refs to 'x'",
    ].join("\n");
    const rejection = parsePushRejection(text);
    assert.equal(rejection?.kind, "hook-declined");
    assert.equal(rejection?.refs.length, 2);
  });

  it("falls back to the hint text when no status line survived", () => {
    const hintsOnly = FETCH_FIRST.split("\n")
      .filter((line) => !line.startsWith(" !"))
      .join("\n");
    assert.equal(parsePushRejection(hintsOnly)?.kind, "fetch-first");
    const behind = NON_FAST_FORWARD.split("\n")
      .filter((line) => !line.startsWith(" !"))
      .join("\n");
    assert.equal(parsePushRejection(behind)?.kind, "non-fast-forward");
  });

  it("returns null for errors that are not a push rejection", () => {
    for (const text of [
      "fatal: Authentication failed for 'https://example.com/x.git/'",
      "fatal: unable to access 'https://example.com/x.git/': Could not resolve host",
      "fatal: 'nowhere' does not appear to be a git repository",
      "",
    ]) {
      assert.equal(parsePushRejection(text), null, text);
    }
  });

  it("splits the kinds into integrable and lease failures", () => {
    assert.equal(isIntegrableKind("non-fast-forward"), true);
    assert.equal(isIntegrableKind("fetch-first"), true);
    assert.equal(isIntegrableKind("stale-info"), false);
    assert.equal(isLeaseFailureKind("stale-info"), true);
    assert.equal(isLeaseFailureKind("remote-updated"), true);
    assert.equal(isLeaseFailureKind("non-fast-forward"), false);
  });
});
