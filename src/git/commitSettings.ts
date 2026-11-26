/**
 * Typed commit behaviour settings (`jgc.commit.*`) and the `git commit`
 * argument list they produce.
 *
 * Kept free of the `vscode` module so the rules can be unit-tested. The
 * extension host adapts `workspace.getConfiguration` to `SettingsReader`.
 */

import type { SettingsReader } from "./gitSettings.ts";

/** `auto` leaves signing to git config; the others override it per commit. */
export type GpgSignMode = "auto" | "always" | "never";

export interface CommitSettings {
  signOff: boolean;
  runHooks: boolean;
  gpgSign: GpgSignMode;
  warnLargeFiles: boolean;
  largeFileThresholdMB: number;
  warnCrlf: boolean;
  warnDetachedHead: boolean;
  warnMissingIdentity: boolean;
}

/** Flags that change how `git commit` runs. */
export interface CommitOptions {
  signOff?: boolean;
  /** Skip the pre-commit and commit-msg hooks (`--no-verify`). */
  noVerify?: boolean;
  gpgSign?: GpgSignMode;
}

export const DEFAULT_LARGE_FILE_THRESHOLD_MB = 10;

const BYTES_PER_MB = 1024 * 1024;

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function parseGpgSignMode(value: unknown): GpgSignMode {
  return value === "always" || value === "never" ? value : "auto";
}

export function parseThresholdMB(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_LARGE_FILE_THRESHOLD_MB;
}

export function thresholdBytes(thresholdMB: number): number {
  return Math.round(thresholdMB * BYTES_PER_MB);
}

export function readCommitSettings(read: SettingsReader): CommitSettings {
  return {
    signOff: bool(read("commit.signOff"), false),
    runHooks: bool(read("commit.runHooks"), true),
    gpgSign: parseGpgSignMode(read("commit.gpgSign")),
    warnLargeFiles: bool(read("commit.warnLargeFiles"), true),
    largeFileThresholdMB: parseThresholdMB(read("commit.largeFileThresholdMB")),
    warnCrlf: bool(read("commit.warnCrlf"), true),
    warnDetachedHead: bool(read("commit.warnDetachedHead"), true),
    warnMissingIdentity: bool(read("commit.warnMissingIdentity"), true),
  };
}

export function commitOptionsFromSettings(
  settings: CommitSettings,
): CommitOptions {
  return {
    signOff: settings.signOff,
    noVerify: !settings.runHooks,
    gpgSign: settings.gpgSign,
  };
}

/** The settings the commit panel's options menu may change. */
export type CommitOptionKey = "signOff" | "runHooks" | "gpgSign";

/**
 * Check a `setCommitOption` request from the webview: bridge params arrive
 * untyped, and a wrong value written to settings would be silently ignored
 * by `readCommitSettings`.
 */
export function parseCommitOption(
  key: unknown,
  value: unknown,
): { key: CommitOptionKey; value: boolean | GpgSignMode } | undefined {
  if ((key === "signOff" || key === "runHooks") && typeof value === "boolean") {
    return { key, value };
  }
  if (
    key === "gpgSign" &&
    (value === "auto" || value === "always" || value === "never")
  ) {
    return { key, value };
  }
  return undefined;
}

export function buildCommitArgs(
  message: string,
  amend: boolean,
  options: CommitOptions = {},
): string[] {
  const args = ["commit", "-m", message];
  if (amend) args.push("--amend");
  if (options.signOff) args.push("--signoff");
  if (options.noVerify) args.push("--no-verify");
  if (options.gpgSign === "always") args.push("--gpg-sign");
  else if (options.gpgSign === "never") args.push("--no-gpg-sign");
  return args;
}
