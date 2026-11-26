/**
 * Typed changelist settings (`jgc.changelists.*`).
 *
 * Kept free of the `vscode` module so the rules can be unit-tested. The
 * extension host adapts `workspace.getConfiguration` to `SettingsReader`.
 */

import type { SettingsReader } from "./gitSettings.ts";

export interface ChangelistSettings {
  /** Off restores the Commit panel to a single "Changes" group. */
  enabled: boolean;
  /** After committing part of a list, offer to move the rest to a new list. */
  offerMoveOnPartialCommit: boolean;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function readChangelistSettings(
  read: SettingsReader,
): ChangelistSettings {
  return {
    enabled: bool(read("changelists.enabled"), true),
    offerMoveOnPartialCommit: bool(
      read("changelists.offerMoveOnPartialCommit"),
      true,
    ),
  };
}
