/**
 * Task 117.32 — JS + native temporal correlation timeline.
 *
 * IMPORTANT — this is *temporal* correlation, NOT causal inference. We only
 * assert that two events occurred close together in time; we make no claim
 * that one caused the other. Co-occurrence within the window is a hint for a
 * human (or a downstream model) to investigate, nothing more. The naming
 * (`correlate`, `correlatedWith`, "co-occurring") reflects that deliberately.
 *
 * Pure functions, no IO, no clock: every entry's position is derived solely
 * from its timestamp. Merges JS-side events (crashes, navigation, network…)
 * and native events (native crashes, ANRs, metrics snapshots) into one
 * time-ordered timeline, and groups a JS event with a native event as
 * "co-occurring" when their timestamps fall within a configurable window
 * (default 100ms).
 */

/** Which side of the bridge an event originated on. */
export type TimelineOrigin = 'js' | 'native';

/**
 * Minimal shape required to place an item on the timeline. Both JS
 * `MonitorEvent`s and native reports satisfy this via their `timestamp`
 * field, so callers can pass either without adapters.
 */
export interface TemporalEvent {
  /** Wall-clock time in ms since the unix epoch. */
  readonly timestamp: number;
  /** Optional discriminator surfaced on the entry for display/grouping. */
  readonly type?: string;
}

/**
 * A single ordered slot in the merged timeline.
 *
 * `correlatedWith` links a JS entry to a co-occurring native entry (or vice
 * versa) by `id`. It is a *temporal* link only — see the file header.
 */
export interface TimelineEntry<E extends TemporalEvent = TemporalEvent> {
  /** Stable id within a single buildTimeline call: `${origin}-${index}`. */
  readonly id: string;
  readonly origin: TimelineOrigin;
  readonly timestamp: number;
  /** The original event, untouched. */
  readonly event: E;
  /**
   * Ids of entries from the *other* origin that fall within the correlation
   * window. Present only when at least one co-occurring entry was found.
   */
  readonly correlatedWith?: readonly string[];
}

export const TEMPORAL_CORRELATION_DEFAULTS = Object.freeze({
  windowMs: 100,
});

/**
 * A pair of co-occurring entries from opposite origins, produced by
 * {@link correlate}.
 */
export interface CorrelationLink {
  readonly jsId: string;
  readonly nativeId: string;
  /** Absolute timestamp delta in ms between the two entries. */
  readonly deltaMs: number;
}

/**
 * Stable, total ordering for timeline entries:
 *  1. by timestamp ascending;
 *  2. on a tie, JS before native (JS instrumentation is the closer-to-user
 *     vantage point, so it reads first in a co-occurrence);
 *  3. on a further tie, by original index (insertion order) so equal
 *     timestamps from the same origin keep their relative order.
 */
function compareEntries(a: TimelineEntry, b: TimelineEntry): number {
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
  if (a.origin !== b.origin) return a.origin === 'js' ? -1 : 1;
  // Same timestamp + same origin → fall back to the numeric suffix of the id
  // (`js-3` / `native-7`) which encodes original index.
  const ai = Number.parseInt(a.id.slice(a.id.indexOf('-') + 1), 10);
  const bi = Number.parseInt(b.id.slice(b.id.indexOf('-') + 1), 10);
  return ai - bi;
}

/**
 * Computes the co-occurrence links between JS and native events within
 * `windowMs`. Two events co-occur when `|jsTimestamp - nativeTimestamp| <=
 * windowMs`. Pure: returns links keyed by the ids that {@link buildTimeline}
 * assigns (`js-${i}` / `native-${i}`).
 *
 * Negative or non-finite windows are coerced to 0 (exact-timestamp matching).
 */
export function correlate(
  jsEvents: readonly TemporalEvent[],
  nativeEvents: readonly TemporalEvent[],
  windowMs: number = TEMPORAL_CORRELATION_DEFAULTS.windowMs,
): readonly CorrelationLink[] {
  const w = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 0;
  const links: CorrelationLink[] = [];
  for (let i = 0; i < jsEvents.length; i++) {
    const js = jsEvents[i] as TemporalEvent;
    for (let j = 0; j < nativeEvents.length; j++) {
      const nat = nativeEvents[j] as TemporalEvent;
      const delta = Math.abs(js.timestamp - nat.timestamp);
      if (delta <= w) {
        links.push({ jsId: `js-${i}`, nativeId: `native-${j}`, deltaMs: delta });
      }
    }
  }
  return links;
}

/**
 * Merges JS and native events into one time-ordered timeline, attaching
 * `correlatedWith` links for entries that co-occur (within `windowMs`) with
 * one or more entries from the opposite origin.
 *
 * Pure and deterministic: same inputs always yield the same output. Empty
 * inputs yield an empty timeline. Equal timestamps are broken deterministically
 * (JS before native, then insertion order) — see {@link compareEntries}.
 */
export function buildTimeline<J extends TemporalEvent, N extends TemporalEvent>(
  jsEvents: readonly J[],
  nativeEvents: readonly N[],
  windowMs: number = TEMPORAL_CORRELATION_DEFAULTS.windowMs,
): readonly TimelineEntry<J | N>[] {
  const links = correlate(jsEvents, nativeEvents, windowMs);

  // Build the reverse-lookup of co-occurring ids per entry id.
  const correlations = new Map<string, string[]>();
  const add = (from: string, to: string): void => {
    const existing = correlations.get(from);
    if (existing) existing.push(to);
    else correlations.set(from, [to]);
  };
  for (const link of links) {
    add(link.jsId, link.nativeId);
    add(link.nativeId, link.jsId);
  }

  const entries: TimelineEntry<J | N>[] = [];
  jsEvents.forEach((event, i) => {
    const id = `js-${i}`;
    const linked = correlations.get(id);
    entries.push({
      id,
      origin: 'js',
      timestamp: event.timestamp,
      event,
      ...(linked ? { correlatedWith: linked } : {}),
    });
  });
  nativeEvents.forEach((event, i) => {
    const id = `native-${i}`;
    const linked = correlations.get(id);
    entries.push({
      id,
      origin: 'native',
      timestamp: event.timestamp,
      event,
      ...(linked ? { correlatedWith: linked } : {}),
    });
  });

  entries.sort(compareEntries);
  return entries;
}
