/**
 * Classify a failed `git push` from its stderr. Free of the `vscode` module.
 *
 * Git prints one status line per refused ref:
 *
 *     ! [rejected]        main -> main (non-fast-forward)
 *     ! [remote rejected] main -> main (pre-receive hook declined)
 *
 * `[rejected]` is decided by the local client (the push would lose commits or
 * overwrite something); `[remote rejected]` is decided by the server (hooks,
 * branch protection) and no amount of merging fixes it.
 */

export type PushRejectionKind =
  /** The remote branch is not an ancestor of what is being pushed. */
  | "non-fast-forward"
  /** The remote has commits that are not even fetched yet. */
  | "fetch-first"
  /** `--force-with-lease`: the remote moved since the last fetch. */
  | "stale-info"
  /** `--force-if-includes`: the remote ref has commits the local ref lacks. */
  | "remote-updated"
  /** A tag (or other ref) already exists on the remote. */
  | "already-exists"
  /** A server-side hook, or branch protection, declined the update. */
  | "hook-declined"
  /** The server refused the update for another reason. */
  | "remote-rejected"
  /** Rejected by the client for a reason not classified above. */
  | "other";

export interface RejectedRef {
  localRef: string | undefined;
  remoteRef: string;
  reason: string;
}

export interface PushRejection {
  /** The kind of the first ref that cannot be fixed by integrating, else of the first ref. */
  kind: PushRejectionKind;
  refs: RejectedRef[];
}

const STATUS_LINE =
  /^\s*!\s+\[(rejected|remote rejected)\]\s+(\S+)(?:\s+->\s+(\S+))?(?:\s+\((.*)\))?\s*$/;

function classifyRef(tag: string, reason: string): PushRejectionKind {
  const text = reason.toLowerCase();
  if (tag === "remote rejected") {
    return text.includes("hook declined") ? "hook-declined" : "remote-rejected";
  }
  if (text.includes("non-fast-forward")) return "non-fast-forward";
  if (text.includes("fetch first")) return "fetch-first";
  if (text.includes("stale info")) return "stale-info";
  if (text.includes("remote ref updated since checkout")) {
    return "remote-updated";
  }
  if (text.includes("already exists")) return "already-exists";
  return "other";
}

/** Merging or rebasing the remote work in, then pushing again, can fix these. */
export function isIntegrableKind(kind: PushRejectionKind): boolean {
  return kind === "non-fast-forward" || kind === "fetch-first";
}

/** The `--force-with-lease` check itself failed: someone pushed in between. */
export function isLeaseFailureKind(kind: PushRejectionKind): boolean {
  return kind === "stale-info" || kind === "remote-updated";
}

/**
 * Git's explanatory hints for runs where no status line survived (a wrapper
 * script, another front end). `hint:` prefixes and line wraps are folded away.
 */
function classifyByHint(text: string): PushRejectionKind | undefined {
  const flat = text.replace(/\n\s*hint:\s*/g, " ").toLowerCase();
  if (flat.includes("the remote contains work that you do not have locally")) {
    return "fetch-first";
  }
  if (
    flat.includes("tip of your current branch is behind") ||
    flat.includes("a pushed branch tip is behind") ||
    flat.includes("non-fast-forward")
  ) {
    return "non-fast-forward";
  }
  return undefined;
}

/**
 * `null` when the text is not a push rejection at all (authentication,
 * network, a missing remote…), so callers fall back to the raw git error.
 */
export function parsePushRejection(stderr: string): PushRejection | null {
  const refs: RejectedRef[] = [];
  const kinds: PushRejectionKind[] = [];
  for (const line of stderr.split(/\r?\n/)) {
    const match = STATUS_LINE.exec(line);
    if (!match) continue;
    const [, tag, source, destination, reason = ""] = match;
    refs.push({
      localRef: destination ? source : undefined,
      remoteRef: destination ?? source,
      reason,
    });
    kinds.push(classifyRef(tag, reason));
  }

  if (refs.length > 0) {
    const kind = kinds.find((k) => !isIntegrableKind(k)) ?? kinds[0];
    return { kind, refs };
  }

  if (!stderr.includes("failed to push some refs")) return null;
  return { kind: classifyByHint(stderr) ?? "other", refs: [] };
}
