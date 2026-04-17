import type { EventRecord } from '../../shared/api/types';

export interface FpsSeries {
  timestamps: number[];
  jsThread: number[];
  uiThread: number[];
}

export interface ResourceSeries {
  timestamps: number[];
  cpuPercent: number[];
  memoryMb: number[];
}

export interface FabricBucket {
  label: string;
  minMs: number;
  maxMs: number;
  count: number;
}

export type StartupKind = 'cold' | 'warm' | 'hot';

export interface StartupRecord {
  kind: StartupKind;
  timestamp: number;
  totalMs: number;
  phases: Array<{ label: string; startMs: number; durationMs: number }>;
}

/**
 * Extract a FPS time-series from the event stream. Looks for events of
 * type `dual_thread_fps` with numeric `jsThread` / `uiThread` samples in
 * their payload (what the SDK's DualThreadFPS collector emits).
 *
 * Returns parallel arrays so downstream charting can index by sample
 * without allocating tuples. Sorted ascending by timestamp.
 */
export function extractFpsSeries(events: EventRecord[]): FpsSeries {
  const relevant = events
    .filter((e) => e.type === 'dual_thread_fps')
    .sort((a, b) => a.timestamp - b.timestamp);

  const timestamps: number[] = [];
  const jsThread: number[] = [];
  const uiThread: number[] = [];

  for (const event of relevant) {
    const p = event.payload as { jsThread?: unknown; uiThread?: unknown };
    const js = toFiniteNumber(p.jsThread);
    const ui = toFiniteNumber(p.uiThread);
    if (js === null && ui === null) continue;
    timestamps.push(event.timestamp);
    jsThread.push(js ?? 0);
    uiThread.push(ui ?? 0);
  }
  return { timestamps, jsThread, uiThread };
}

/**
 * Extract CPU + memory trends from `native_metrics` events. Memory is
 * converted to MB so the chart reads naturally even for multi-GB values.
 */
export function extractResourceSeries(events: EventRecord[]): ResourceSeries {
  const relevant = events
    .filter((e) => e.type === 'native_metrics')
    .sort((a, b) => a.timestamp - b.timestamp);

  const timestamps: number[] = [];
  const cpuPercent: number[] = [];
  const memoryMb: number[] = [];

  for (const event of relevant) {
    const p = event.payload as {
      cpuUsagePercent?: unknown;
      memoryUsedBytes?: unknown;
    };
    const cpu = toFiniteNumber(p.cpuUsagePercent);
    const memBytes = toFiniteNumber(p.memoryUsedBytes);
    if (cpu === null && memBytes === null) continue;
    timestamps.push(event.timestamp);
    cpuPercent.push(cpu ?? 0);
    memoryMb.push(memBytes !== null ? memBytes / (1024 * 1024) : 0);
  }
  return { timestamps, cpuPercent, memoryMb };
}

/**
 * Bucketise Fabric commit latencies into the standard [0, 8, 16, 33, 50, 100, 250, ∞)
 * ms ranges that line up with 120/60/30/20/10 fps frame budgets.
 */
export function buildFabricHistogram(events: EventRecord[]): FabricBucket[] {
  const edges = [0, 8, 16, 33, 50, 100, 250];
  const buckets: FabricBucket[] = edges.map((min, i) => ({
    label: i === edges.length - 1 ? `${min}+ ms` : `${min}–${edges[i + 1]} ms`,
    minMs: min,
    maxMs: i === edges.length - 1 ? Number.POSITIVE_INFINITY : edges[i + 1]!,
    count: 0,
  }));
  for (const event of events) {
    if (event.type !== 'fabric_commit') continue;
    const payload = event.payload as { durationMs?: unknown };
    const duration = toFiniteNumber(payload.durationMs);
    if (duration === null || duration < 0) continue;
    const bucket = buckets.find((b) => duration >= b.minMs && duration < b.maxMs);
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

const STARTUP_KINDS: ReadonlySet<StartupKind> = new Set(['cold', 'warm', 'hot']);

/**
 * Pull the most recent startup record per kind out of the event stream.
 * The SDK emits `startup` events at launch; we keep only one per kind so
 * the waterfall chart renders the freshest snapshot.
 */
export function extractStartupPhases(events: EventRecord[]): StartupRecord[] {
  const byKind = new Map<StartupKind, StartupRecord>();
  const ordered = [...events].sort((a, b) => a.timestamp - b.timestamp);
  for (const event of ordered) {
    if (event.type !== 'startup') continue;
    const p = event.payload as {
      kind?: unknown;
      totalMs?: unknown;
      phases?: unknown;
    };
    if (typeof p.kind !== 'string' || !STARTUP_KINDS.has(p.kind as StartupKind)) continue;
    const kind = p.kind as StartupKind;
    const totalMs = toFiniteNumber(p.totalMs) ?? 0;
    const phases = Array.isArray(p.phases) ? p.phases.filter(isPhase) : [];
    byKind.set(kind, { kind, timestamp: event.timestamp, totalMs, phases });
  }
  return (['cold', 'warm', 'hot'] as const)
    .map((k) => byKind.get(k))
    .filter((x): x is StartupRecord => Boolean(x));
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

interface Phase {
  label: string;
  startMs: number;
  durationMs: number;
}

function isPhase(value: unknown): value is Phase {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.label === 'string' && typeof v.startMs === 'number' && typeof v.durationMs === 'number'
  );
}
