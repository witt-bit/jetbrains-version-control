/** Upstream selection helpers, free of `vscode` so they can be unit-tested. */

/**
 * Remote branches to offer as an upstream, as `remote/branch`. The branch
 * with the same name as the local one comes first (the usual choice), and the
 * branch's present upstream is dropped: picking it again is a no-op.
 */
export function rankUpstreamCandidates(
  localBranch: string,
  remotes: { remote: string; branches: string[] }[],
  currentUpstream?: string,
): string[] {
  const sameName: string[] = [];
  const others: string[] = [];
  for (const { remote, branches } of remotes) {
    for (const branch of branches) {
      const full = `${remote}/${branch}`;
      if (full === currentUpstream) continue;
      (branch === localBranch ? sameName : others).push(full);
    }
  }
  return [...sameName, ...others];
}
