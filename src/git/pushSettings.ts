/**
 * Typed push behaviour settings (`jgc.push.*`, `jgc.protectedBranches`).
 *
 * Kept free of the `vscode` module so the parsing rules can be unit-tested;
 * the extension host adapts `workspace.getConfiguration` to `SettingsReader`.
 */

import type { SettingsReader } from "./gitSettings.ts";
import { parseProtectedBranches } from "./protectedBranches.ts";

/** What to do when a push is rejected because the remote has new commits. */
export type RejectedPushAction = "ask" | "merge" | "rebase";

export interface PushSettings {
  /** Add `--set-upstream` when the pushed branch has no upstream yet. */
  autoSetUpstream: boolean;
  rejectedAction: RejectedPushAction;
  protectedBranches: string[];
}

export function parseRejectedPushAction(value: unknown): RejectedPushAction {
  return value === "merge" || value === "rebase" ? value : "ask";
}

export function readPushSettings(read: SettingsReader): PushSettings {
  return {
    autoSetUpstream: read("push.autoSetUpstream") !== false,
    rejectedAction: parseRejectedPushAction(read("push.rejectedAction")),
    protectedBranches: parseProtectedBranches(read("protectedBranches")),
  };
}
