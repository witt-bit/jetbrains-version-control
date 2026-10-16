/**
 * Which new lines of a mixed diff chunk are edits of an old line.
 *
 * A diff chunk that both replaces old lines and adds new ones is usually one
 * edit wrapped in insertions: a changed statement followed by freshly inserted
 * blank lines. Treating the whole chunk as "modified" paints those blanks blue;
 * pairing the lines up first keeps the edit on the statement and lets the
 * leftovers read as pure additions.
 *
 * This module is deliberately free of `vscode` imports so it can be unit
 * tested.
 */

/**
 * Marks which of `newLines` are edits of an `oldLines` line.
 *
 * Exactly `min(old, new)` lines pair up — the most similar ones win — and the
 * leftovers are pure additions. Big chunks fall back to pairing by position; a
 * full rewrite has no similarity structure worth an O(n*m) scan.
 */
export function pairEdits(oldLines: string[], newLines: string[]): boolean[] {
  const pairs = Math.min(oldLines.length, newLines.length);
  const isEdit = new Array<boolean>(newLines.length).fill(false);

  if (oldLines.length * newLines.length > MAX_SIMILARITY_AREA) {
    for (let i = 0; i < pairs; i++) {
      isEdit[i] = true;
    }
    return isEdit;
  }

  const usedOld = new Set<number>();
  for (let picked = 0; picked < pairs; picked++) {
    let bestNew = -1;
    let bestOld = -1;
    let bestScore = -1;
    for (let j = 0; j < newLines.length; j++) {
      if (isEdit[j]) continue;
      for (let i = 0; i < oldLines.length; i++) {
        if (usedOld.has(i)) continue;
        const score = pairScore(
          oldLines[i],
          newLines[j],
          i,
          j,
          oldLines.length,
        );
        if (score > bestScore) {
          bestScore = score;
          bestOld = i;
          bestNew = j;
        }
      }
    }
    isEdit[bestNew] = true;
    usedOld.add(bestOld);
  }
  return isEdit;
}

/**
 * Similarity above which two lines count as the same line edited. Below it the
 * pair is still allowed (a short rewrite of unrelated text is still an edit),
 * but only once nothing better is left.
 */
const FLOOR = 0.25;

/** Beyond this many line comparisons a chunk is paired by position instead. */
const MAX_SIMILARITY_AREA = 4096;

/**
 * How attractive the pairing of old line `i` with new line `j` is.
 *
 * Similarity decides, but a weak pair only wins when nothing stronger is left:
 * `foo()` rewritten to `bar()` shares nothing, yet the two are plainly the same
 * statement. A positional tiebreak keeps equally scoring candidates from
 * crossing the block, which is what lets an inserted blank line steal the match
 * of a real edit further down.
 */
function pairScore(
  oldLine: string,
  newLine: string,
  i: number,
  j: number,
  oldCount: number,
): number {
  const similarity = lineSimilarity(oldLine, newLine);
  const drift = Math.abs(i - j) / Math.max(oldCount, 1);
  return similarity > FLOOR ? similarity : similarity + 0.2 - 0.2 * drift;
}

/**
 * How much two lines share as a common prefix and suffix relative to the longer
 * one. An edited line scores near 1, unrelated lines near 0.
 *
 * Two blank lines score 1 — they really are the same text — which is why the
 * caller cannot pair on similarity alone.
 */
export function lineSimilarity(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) {
    return a.length === b.length ? 1 : 0;
  }
  const max = Math.min(a.length, b.length);
  let prefix = 0;
  while (prefix < max && a[prefix] === b[prefix]) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < max - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }
  return (prefix + suffix) / Math.max(a.length, b.length);
}
