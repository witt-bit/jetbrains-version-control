import { diffArrays } from "diff";

/** Per-line change classification, in 0-based indices of the current text. */
export interface LineClassification {
  added: number[];
  modified: number[];
  /**
   * Lines a deletion marker sits on: the first line after the gap in the
   * current text, so the half-height bar straddles the boundary.
   */
  deleted: number[];
}

/** One contiguous change: a span of base lines mapped to a span of current lines. */
interface Change {
  baseStart: number;
  baseCount: number;
  curStart: number;
  curCount: number;
}

/**
 * Classify changed lines with block semantics, the way the editor's own
 * quick-diff does: a change block is a pair of a removed and an added part;
 * removed-only is a deletion, added-only an insertion, and a paired
 * removed+added block is a modification of *every* replaced line.
 *
 * There is deliberately no per-line similarity pairing inside a block: when an
 * insertion above an edit re-runs the diff, the edit stays inside its own
 * modified block instead of being re-matched against the fresh lines, which is
 * what used to turn modified lines green.
 *
 * The diff runs on line arrays rather than joined text: `diffLines` folds the
 * trailing newline into each line's token, so a line that survives to become
 * the new last line (`a\n` vs `a`) would read as changed.
 */
export function classifyLines(
  base: string[],
  current: string[],
): LineClassification {
  const result: LineClassification = {
    added: [],
    modified: [],
    deleted: [],
  };
  if (base.length === 0 && current.length === 0) return result;

  const changes = diffToChanges(base, current);
  joinChangesAcrossShortGaps(changes, base);

  const lastCurrent = Math.max(current.length - 1, 0);
  for (const change of changes) {
    if (change.baseCount > 0 && change.curCount > 0) {
      for (let i = 0; i < change.curCount; i++) {
        result.modified.push(change.curStart + i);
      }
    } else if (change.curCount > 0) {
      for (let i = 0; i < change.curCount; i++) {
        result.added.push(change.curStart + i);
      }
    } else {
      // Pure deletion: anchor the short bar on the line after the gap.
      result.deleted.push(Math.min(change.curStart, lastCurrent));
    }
  }

  return result;
}

/** Walk the diff blocks into contiguous change spans on both sides. */
function diffToChanges(base: string[], current: string[]): Change[] {
  const changes: Change[] = [];
  let basePos = 0;
  let curPos = 0;
  for (const part of diffArrays(base, current)) {
    const count = part.count ?? 0;
    if (part.added || part.removed) {
      const change: Change = {
        baseStart: basePos,
        baseCount: part.removed ? count : 0,
        curStart: curPos,
        curCount: part.added ? count : 0,
      };
      const last = changes[changes.length - 1];
      if (
        last &&
        last.baseStart + last.baseCount === change.baseStart &&
        last.curStart + last.curCount === change.curStart
      ) {
        // Adjacent removed/added blocks are one replacement (one hunk), not
        // two changes separated by nothing.
        last.baseCount += change.baseCount;
        last.curCount += change.curCount;
      } else {
        changes.push(change);
      }
      if (part.removed) basePos += count;
      if (part.added) curPos += count;
    } else {
      basePos += count;
      curPos += count;
    }
  }
  return changes;
}

/**
 * Line-level port of the editor's `removeVeryShortMatchingLinesBetweenDiffs`:
 * two changes separated only by unchanged lines that carry almost no content
 * (a blank line, a brace) are one edit, so they join into a single change —
 * this is what makes an edit blue instead of green+gray when a blank line
 * happens to sit between the old and new lines. Without it the diff is free to
 * keep the blank as context, splitting one replacement into a deletion and an
 * insertion.
 */
function joinChangesAcrossShortGaps(changes: Change[], base: string[]): void {
  for (let round = 0; round < 10; round++) {
    let merged = false;
    const joined: Change[] = [];
    for (const change of changes) {
      const prev = joined[joined.length - 1];
      if (prev && shouldJoin(prev, change, base)) {
        joined[joined.length - 1] = {
          baseStart: prev.baseStart,
          baseCount: change.baseStart + change.baseCount - prev.baseStart,
          curStart: prev.curStart,
          curCount: change.curStart + change.curCount - prev.curStart,
        };
        merged = true;
      } else {
        joined.push(change);
      }
    }
    changes.length = 0;
    changes.push(...joined);
    if (!merged) break;
  }
}

function shouldJoin(prev: Change, next: Change, base: string[]): boolean {
  const gapStart = prev.baseStart + prev.baseCount;
  const gapEnd = next.baseStart;
  let nonWhitespace = 0;
  for (let i = gapStart; i < gapEnd; i++) {
    nonWhitespace += base[i].replace(/\s/g, "").length;
    if (nonWhitespace > 4) return false;
  }
  return (
    prev.baseCount + prev.curCount > 5 || next.baseCount + next.curCount > 5
  );
}
