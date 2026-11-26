/**
 * Fetch options (`jgc.fetch.*`): prune, tags mode and auto-fetch.
 *
 * Free of the `vscode` module so the argument builder and the parsing rules
 * can be unit-tested. Every default reproduces a plain `git fetch <remote>`.
 */

import type { SettingsReader } from "./gitSettings.ts";

/**
 * How tags are handled by a fetch (Rider's `GitFetchTagsMode`):
 * - `default`: git's own behaviour (tags that point into fetched history)
 * - `pruneTags`: also delete local tags that no longer exist on the remote
 * - `allTags`: fetch every tag (`--tags`)
 * - `noTags`: fetch no tags (`--no-tags`)
 */
export type FetchTagsMode = "default" | "pruneTags" | "allTags" | "noTags";

export interface FetchOptions {
  /** Delete remote-tracking branches that no longer exist on the remote. */
  prune: boolean;
  tagsMode: FetchTagsMode;
}

export interface FetchSettings extends FetchOptions {
  autoFetch: boolean;
  autoFetchIntervalMinutes: number;
}

export const DEFAULT_AUTO_FETCH_INTERVAL_MINUTES = 15;

const TAGS_MODES: readonly FetchTagsMode[] = [
  "default",
  "pruneTags",
  "allTags",
  "noTags",
];

export function parseFetchTagsMode(value: unknown): FetchTagsMode {
  return typeof value === "string" &&
    (TAGS_MODES as readonly string[]).includes(value)
    ? (value as FetchTagsMode)
    : "default";
}

export function parseAutoFetchInterval(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_AUTO_FETCH_INTERVAL_MINUTES;
  }
  return Math.max(1, Math.floor(value));
}

export function readFetchSettings(read: SettingsReader): FetchSettings {
  return {
    prune: read("fetch.prune") === true,
    tagsMode: parseFetchTagsMode(read("fetch.tagsMode")),
    autoFetch: read("fetch.autoFetch") === true,
    autoFetchIntervalMinutes: parseAutoFetchInterval(
      read("fetch.autoFetchIntervalMinutes"),
    ),
  };
}

/**
 * Arguments for `git fetch`. `remote === null` fetches every remote.
 *
 * `--prune-tags` is a no-op without `--prune` (git only prunes tags when
 * pruning is on), so the prune-tags mode always implies `--prune`.
 */
export function buildFetchArgs(
  remote: string | null,
  options: Partial<FetchOptions> = {},
): string[] {
  const tagsMode = options.tagsMode ?? "default";
  const args = ["fetch"];
  if (options.prune || tagsMode === "pruneTags") args.push("--prune");
  if (tagsMode === "pruneTags") args.push("--prune-tags");
  if (tagsMode === "allTags") args.push("--tags");
  if (tagsMode === "noTags") args.push("--no-tags");
  args.push(remote === null ? "--all" : remote);
  return args;
}
