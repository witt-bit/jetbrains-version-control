/**
 * The push flow shared by every entry point: set the upstream on a first
 * push, refuse force pushes to protected branches, and recover from a
 * rejected push by integrating the remote work (or, when the user explicitly
 * asks, by force pushing with a lease).
 *
 * Free of the `vscode` module. The UI is injected through `PushFlowHooks`:
 * the Push panel asks inside the webview, every other entry point asks with a
 * host quick pick.
 */

import type { SaveChangesPolicy } from "./gitSettings.ts";
import { forcePushRefusal } from "./protectedBranches.ts";
import {
  isIntegrableKind,
  isLeaseFailureKind,
  type PushRejection,
  parsePushRejection,
} from "./pushRejection.ts";
import type { PushSettings } from "./pushSettings.ts";

export interface PushRequest {
  /** Local branch: decides the upstream and what an update would integrate into. */
  branchName: string;
  remote: string;
  /** Short name of the remote branch. Protection and update messages use it. */
  targetBranch: string;
  /** Force with lease. Always an explicit user action, never inferred. */
  force: boolean;
  /** What git pushes when it is not the branch tip (`Push All up to Here`). */
  refspecSource?: string;
  /** Destination ref for `refspecSource`, e.g. `refs/heads/feature`. */
  refspecDestination?: string;
}

export interface PushFlowSettings extends PushSettings {
  saveChangesPolicy: SaveChangesPolicy;
}

/** The slice of `GitService` the flow drives. */
export interface PushFlowGit {
  push(
    source: string,
    force: boolean,
    remote: string,
    destination: string,
    options: { setUpstream: boolean },
  ): Promise<string>;
  hasUpstream(branchName: string): Promise<boolean>;
  getCurrentBranch(): Promise<string | null>;
  update(options: {
    method: "merge" | "rebase";
    policy: SaveChangesPolicy;
    branchName: string;
    remote: string;
  }): Promise<void>;
  trackRemoteBranch(
    branchName: string,
    remote: string,
    remoteBranch: string,
  ): Promise<void>;
}

export type RejectedDecision =
  | { action: "merge" | "rebase"; remember?: boolean }
  | { action: "forceWithLease" }
  | { action: "cancel" }
  /** Hand the rejection back to the caller, which asks the user itself. */
  | { action: "defer" };

export interface RejectedPrompt {
  request: PushRequest;
  rejection: PushRejection;
  /** False when merging or rebasing cannot help (not the checked-out branch, commit push). */
  canIntegrate: boolean;
}

export interface PushFlowHooks {
  /** Skipped (treated as `defer`) when absent. */
  chooseRejectedAction?: (prompt: RejectedPrompt) => Promise<RejectedDecision>;
  /** Persist "always merge" / "always rebase". Force is never remembered. */
  rememberRejectedAction?: (action: "merge" | "rebase") => Promise<void>;
}

export interface PushFlowOptions {
  /** A decision the user already made (the Push panel's dialog), ahead of the setting. */
  decision?: RejectedDecision;
  hooks?: PushFlowHooks;
}

export type PushFlowResult =
  | {
      status: "pushed";
      output: string;
      /** `--set-upstream` was applied. */
      setUpstream: boolean;
      integrated?: "merge" | "rebase";
      forced: boolean;
    }
  | { status: "rejected"; rejection: PushRejection; canIntegrate: boolean }
  | { status: "cancelled" };

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Throws the refusal message when a force push targets a protected branch. */
export function assertForcePushAllowed(
  targetBranch: string,
  patterns: readonly string[],
): void {
  const refusal = forcePushRefusal(targetBranch, patterns);
  if (refusal) throw new Error(refusal);
}

export async function pushWithRecovery(
  git: PushFlowGit,
  request: PushRequest,
  settings: PushFlowSettings,
  options: PushFlowOptions = {},
): Promise<PushFlowResult> {
  const { branchName, remote, targetBranch } = request;
  const source = request.refspecSource ?? branchName;
  const destination = request.refspecDestination ?? targetBranch;

  const attempt = async (force: boolean) => {
    const setUpstream =
      settings.autoSetUpstream && !(await git.hasUpstream(branchName));
    let output: string;
    try {
      output = await git.push(source, force, remote, destination, {
        setUpstream,
      });
    } catch (err) {
      const parsed = force ? parsePushRejection(errorText(err)) : null;
      if (parsed && isLeaseFailureKind(parsed.kind)) {
        throw new Error(
          `Force push to ${remote}/${targetBranch} refused: the remote branch changed since your last fetch. Fetch, review the new commits, then push again.`,
        );
      }
      throw err;
    }
    // Pushing a bare commit does not track the branch; do it explicitly.
    const trackExplicitly = setUpstream && request.refspecSource !== undefined;
    if (trackExplicitly) {
      await git.trackRemoteBranch(branchName, remote, targetBranch);
    }
    return { output, setUpstream };
  };

  if (request.force) {
    assertForcePushAllowed(targetBranch, settings.protectedBranches);
  }

  let rejection: PushRejection;
  try {
    const { output, setUpstream } = await attempt(request.force);
    return { status: "pushed", output, setUpstream, forced: request.force };
  } catch (err) {
    const parsed = parsePushRejection(errorText(err));
    if (!parsed) throw err;
    // Hook-declined and every other rejection: merging does not help.
    if (!isIntegrableKind(parsed.kind)) throw err;
    rejection = parsed;
  }

  const canIntegrate =
    request.refspecSource === undefined &&
    (await git.getCurrentBranch()) === branchName;

  let decision = options.decision;
  if (!decision && settings.rejectedAction !== "ask" && canIntegrate) {
    decision = { action: settings.rejectedAction };
  }
  if (!decision) {
    decision = (await options.hooks?.chooseRejectedAction?.({
      request,
      rejection,
      canIntegrate,
    })) ?? { action: "defer" };
  }

  switch (decision.action) {
    case "defer":
      return { status: "rejected", rejection, canIntegrate };
    case "cancel":
      return { status: "cancelled" };
    case "forceWithLease": {
      assertForcePushAllowed(targetBranch, settings.protectedBranches);
      const { output, setUpstream } = await attempt(true);
      return { status: "pushed", output, setUpstream, forced: true };
    }
    case "merge":
    case "rebase": {
      if (!canIntegrate) {
        throw new Error(
          `Cannot ${decision.action} the remote changes: "${branchName}" is not the checked-out branch. Check it out and update it, then push again.`,
        );
      }
      if (decision.remember) {
        await options.hooks?.rememberRejectedAction?.(decision.action);
      }
      await git.update({
        method: decision.action,
        policy: settings.saveChangesPolicy,
        branchName: targetBranch,
        remote,
      });
      const { output, setUpstream } = await attempt(false);
      return {
        status: "pushed",
        output,
        setUpstream,
        integrated: decision.action,
        forced: false,
      };
    }
  }
}
