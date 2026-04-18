import type { EventRecord } from '../../shared/api/types';

export interface AnrRecord {
  id: string;
  timestamp: number;
  durationMs: number;
  stackHead: string;
  screen: string | null;
  sessionId: string;
}

export interface AnrBucket {
  label: string;
  minMs: number;
  maxMs: number;
  count: number;
}

export interface ScreenOffender {
  screen: string;
  count: number;
  longestMs: number;
}

export interface RecurrenceBin {
  startTs: number;
  endTs: number;
  count: number;
}

/**
 * Filter the event stream down to ANRs, coerce each payload into a typed
 * AnrRecord, and order the result newest-first so the recurrence timeline
 * and stack-head list both show the freshest ANR at the top.
 *
 * Events without a numeric `durationMs` are skipped — better a missing row
 * than a fabricated "0ms ANR" that implies the main thread was fine.
 */
export function extractAnrs(events: EventRecord[]): AnrRecord[] {
  const out: AnrRecord[] = [];
  for (const event of events) {
    if (!isAnrEvent(event)) continue;
    const payload = event.payload as {
      durationMs?: unknown;
      stack?: unknown;
    };
    const durationMs = typeof payload.durationMs === 'number' ? payload.durationMs : null;
    if (durationMs === null || !Number.isFinite(durationMs) || durationMs <= 0) continue;
    const stack = typeof payload.stack === 'string' ? payload.stack : '';
    out.push({
      id: event.id,
      timestamp: event.timestamp,
      durationMs,
      stackHead: stackHeadOf(stack) || '<native ANR>',
      screen: event.screen ?? null,
      sessionId: event.sessionId,
    });
  }
  return out.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Bucket each ANR by how long the main thread was stuck. Bins mirror the
 * user-visible severity ladder: 5s is "laggy", 10s is "hung", 20s+ is
 * "watchdog territory".
 */
export function bucketByDuration(records: AnrRecord[]): AnrBucket[] {
  const buckets: AnrBucket[] = [
    { label: '< 5 s', minMs: 0, maxMs: 5_000, count: 0 },
    { label: '5–10 s', minMs: 5_000, maxMs: 10_000, count: 0 },
    { label: '10–20 s', minMs: 10_000, maxMs: 20_000, count: 0 },
    { label: '20 s+', minMs: 20_000, maxMs: Number.POSITIVE_INFINITY, count: 0 },
  ];
  for (const record of records) {
    const bucket = buckets.find((b) => record.durationMs >= b.minMs && record.durationMs < b.maxMs);
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

/**
 * Group ANRs by screen name, sort by count descending. Records with no
 * screen are collapsed under `<unknown screen>` so they're visible rather
 * than silently dropped.
 */
export function topScreens(records: AnrRecord[], limit = 5): ScreenOffender[] {
  const byScreen = new Map<string, { count: number; longestMs: number }>();
  for (const record of records) {
    const screen = record.screen ?? '<unknown screen>';
    const existing = byScreen.get(screen);
    if (existing) {
      existing.count += 1;
      if (record.durationMs > existing.longestMs) existing.longestMs = record.durationMs;
    } else {
      byScreen.set(screen, { count: 1, longestMs: record.durationMs });
    }
  }
  return [...byScreen.entries()]
    .map(([screen, agg]) => ({ screen, count: agg.count, longestMs: agg.longestMs }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.longestMs - a.longestMs;
    })
    .slice(0, limit);
}

/**
 * Split ANRs into time bins for the recurrence strip. Callers pass the
 * window they want to cover; empty ranges produce a single zero-count bin
 * so the strip still has a consistent shape.
 */
export function recurrenceBins(
  records: AnrRecord[],
  options: { binCount?: number; minTs?: number; maxTs?: number } = {},
): RecurrenceBin[] {
  const binCount = Math.max(1, options.binCount ?? 24);
  if (records.length === 0) {
    const now = Date.now();
    return [{ startTs: now, endTs: now, count: 0 }];
  }
  const timestamps = records.map((r) => r.timestamp);
  const minTs = options.minTs ?? Math.min(...timestamps);
  const maxTs = options.maxTs ?? Math.max(...timestamps);
  const span = Math.max(1, maxTs - minTs);
  const width = span / binCount;
  const bins: RecurrenceBin[] = Array.from({ length: binCount }, (_, i) => ({
    startTs: minTs + i * width,
    endTs: minTs + (i + 1) * width,
    count: 0,
  }));
  for (const record of records) {
    const offset = record.timestamp - minTs;
    let idx = Math.floor(offset / width);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx]!.count += 1;
  }
  return bins;
}

export function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${durationMs} ms`;
  if (durationMs < 10_000) return `${(durationMs / 1_000).toFixed(1)} s`;
  return `${Math.round(durationMs / 1_000)} s`;
}

function isAnrEvent(event: EventRecord): boolean {
  // Tolerates both SDK-native `native_anr` events and any `anr` fallbacks.
  return event.type === 'anr' || event.type === 'native_anr';
}

function stackHeadOf(stack: string): string {
  if (!stack) return '';
  const lines = stack
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return '';
  const firstFrame = lines.find((line) => line.startsWith('at '));
  return firstFrame ?? lines[0]!;
}
