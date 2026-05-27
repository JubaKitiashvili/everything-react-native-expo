/**
 * Pure crash aggregation. No `vscode` import — fully unit-tested.
 */
import type { CrashGroup, CrashIndex, CrashIndexEntry } from './types';

/**
 * Aggregate crash groups by their `topScreen` hint.
 *
 * For each screen:
 * - `count` is the sum of eventCount across all groups on that screen.
 * - `topFingerprint` is the fingerprint of the highest-eventCount group
 *   (first-seen wins on a tie, so the result is deterministic).
 *
 * Groups without a `topScreen` are ignored — there's nowhere to attach a lens.
 */
export function buildCrashIndex(groups: readonly CrashGroup[]): CrashIndex {
  const index: CrashIndex = new Map();
  // Track the winning eventCount per screen so we can pick topFingerprint.
  const topCountByScreen = new Map<string, number>();

  for (const group of groups) {
    const screen = group.topScreen;
    if (!screen) {
      continue;
    }

    const existing = index.get(screen);
    if (!existing) {
      index.set(screen, { count: group.eventCount, topFingerprint: group.fingerprint });
      topCountByScreen.set(screen, group.eventCount);
      continue;
    }

    existing.count += group.eventCount;
    const currentTop = topCountByScreen.get(screen) ?? -Infinity;
    if (group.eventCount > currentTop) {
      existing.topFingerprint = group.fingerprint;
      topCountByScreen.set(screen, group.eventCount);
    }
  }

  return index;
}

/**
 * Human-readable CodeLens label for a crash index entry.
 * e.g. `"⚠ 12 crashes — open in ERNE"` / `"⚠ 1 crash — open in ERNE"`.
 */
export function codeLensText(entry: CrashIndexEntry): string {
  const noun = entry.count === 1 ? 'crash' : 'crashes';
  return `⚠ ${entry.count} ${noun} — open in ERNE`;
}
