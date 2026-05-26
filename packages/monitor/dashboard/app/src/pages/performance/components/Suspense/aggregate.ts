/**
 * Pure transform: fold Suspense monitoring events into a per-boundary summary.
 *
 * The SDK's `SuspenseCollector`
 * (packages/monitor/src/collectors/SuspenseCollector.ts) emits one event each
 * time a `<Suspense>` fallback finishes displaying. The collector wraps the
 * payload as `{ type: 'custom', data: { name: 'suspense', attributes: {...} } }`,
 * and the server's canonical ingest promotes that into a stored `EventRecord`
 * of `type: 'suspense'` with the attributes flattened directly into `payload`
 * (boundaryName / fallbackDurationMs / depth / outcome / errorMessage). So we
 * match `event.type === 'suspense'` and read the fields straight off
 * `event.payload`, exactly like every sibling panel.
 *
 * Each event represents one fallback "stall" (the time a fallback was shown
 * before the boundary resolved or errored). We aggregate every stall for a
 * boundary into one row: stall count, avg / p95 stall duration, the longest
 * stall, max nesting depth, and a resolved-vs-errored breakdown. A row's
 * status is derived purely from that data so the panel can render a single
 * status Pill per row.
 */

import { percentile } from '@/shared/ui/HistogramCDF/computeHistogram';
import type { EventRecord } from '@/shared/api/types';

/**
 * The payload shape consumed from a stored `type: 'suspense'` `EventRecord`.
 * Mirrors `SuspenseEventData` in the SDK collector — kept duplicated rather
 * than imported because the dashboard app is browser-side and does not depend
 * on the Node SDK package.
 */
export interface SuspenseEventPayload {
  /** Name of the Suspense boundary that stalled — the row identity. */
  boundaryName?: string;
  /** How long the fallback was shown, in ms. */
  fallbackDurationMs?: number;
  /** Nesting depth of the boundary when it stalled (1 = top-level). */
  depth?: number;
  /** Whether the boundary resolved its content or threw. */
  outcome?: 'resolved' | 'error';
  /** Error message when `outcome === 'error'`. */
  errorMessage?: string;
}

/** Health classification for a boundary, used to colour its status Pill. */
export type SuspenseBoundaryStatus = 'ok' | 'slow' | 'error';

/** One aggregated Suspense boundary. */
export interface SuspenseBoundarySummary {
  /** Boundary name — the row identity. */
  boundary: string;
  /** Number of fallback stalls recorded for this boundary. */
  stalls: number;
  /** Mean stall duration in ms (0 when no stalls recorded). */
  avgMs: number;
  /** 95th-percentile stall duration in ms. */
  p95Ms: number;
  /** Longest single stall observed in ms (0 when none recorded). */
  longestMs: number;
  /** Deepest nesting depth observed for this boundary. */
  maxDepth: number;
  /** Count of stalls that ended in a resolved boundary. */
  resolved: number;
  /** Count of stalls that ended in an error / timeout. */
  errored: number;
  /** Most recent error message seen for this boundary, if any. */
  lastError?: string;
  /** Derived health classification. */
  status: SuspenseBoundaryStatus;
}

export interface SuspenseSummary {
  boundaries: SuspenseBoundarySummary[];
  /** Number of distinct boundaries summarised. */
  boundaryCount: number;
  /** Total stalls summed across every boundary. */
  totalStalls: number;
}

/** Stalls whose p95 is at or above this (ms) are flagged "slow". */
export const SLOW_STALL_P95_MS = 3000;

/**
 * Fold a slice of `type: 'suspense'` event records into a deterministic
 * per-boundary summary. Non-suspense records and malformed payloads are
 * skipped. Boundaries are ordered errored-first, then by p95 descending
 * (slowest first), then by name, so renders and tests are stable.
 */
export function aggregateSuspense(events: readonly EventRecord[]): SuspenseSummary {
  const acc = new Map<string, MutableBoundary>();

  for (const event of events) {
    const payload = extractSuspensePayload(event);
    if (!payload) continue;

    const name =
      typeof payload.boundaryName === 'string' && payload.boundaryName.length > 0
        ? payload.boundaryName
        : '(anonymous)';
    const boundary = getOrCreate(acc, name);

    if (isFinitePositive(payload.fallbackDurationMs)) {
      boundary.durations.push(payload.fallbackDurationMs);
    }
    if (isFinitePositive(payload.depth)) {
      boundary.maxDepth = Math.max(boundary.maxDepth, payload.depth);
    }
    if (payload.outcome === 'error') {
      boundary.errored += 1;
      if (typeof payload.errorMessage === 'string' && payload.errorMessage.length > 0) {
        boundary.lastError = payload.errorMessage;
      }
    } else {
      // Anything that is not an explicit error counts as a resolved stall.
      boundary.resolved += 1;
    }
  }

  const boundaries = [...acc.values()].map(finalizeBoundary).sort(compareBoundaries);

  return {
    boundaries,
    boundaryCount: boundaries.length,
    totalStalls: boundaries.reduce((sum, b) => sum + b.stalls, 0),
  };
}

interface MutableBoundary {
  boundary: string;
  durations: number[];
  maxDepth: number;
  resolved: number;
  errored: number;
  lastError?: string;
}

function getOrCreate(map: Map<string, MutableBoundary>, boundary: string): MutableBoundary {
  let entry = map.get(boundary);
  if (!entry) {
    entry = {
      boundary,
      durations: [],
      maxDepth: 0,
      resolved: 0,
      errored: 0,
    };
    map.set(boundary, entry);
  }
  return entry;
}

function finalizeBoundary(b: MutableBoundary): SuspenseBoundarySummary {
  const durationSamples = b.durations.length;
  const avgMs = durationSamples > 0 ? mean(b.durations) : 0;
  const p95Ms = durationSamples > 0 ? percentile(b.durations, 0.95) : 0;
  const longestMs = durationSamples > 0 ? Math.max(...b.durations) : 0;
  const stalls = b.resolved + b.errored;

  return {
    boundary: b.boundary,
    stalls,
    avgMs,
    p95Ms,
    longestMs,
    maxDepth: b.maxDepth,
    resolved: b.resolved,
    errored: b.errored,
    ...(b.lastError ? { lastError: b.lastError } : {}),
    status: deriveStatus(b.errored, p95Ms),
  };
}

function deriveStatus(errored: number, p95Ms: number): SuspenseBoundaryStatus {
  if (errored > 0) return 'error';
  if (p95Ms >= SLOW_STALL_P95_MS) return 'slow';
  return 'ok';
}

/**
 * Errored boundaries first, then slowest (highest p95) first, then alphabetical
 * by name for stability.
 */
function compareBoundaries(a: SuspenseBoundarySummary, b: SuspenseBoundarySummary): number {
  if (a.errored !== b.errored && (a.errored === 0 || b.errored === 0)) {
    // One has errors and the other doesn't — the errored one ranks first.
    return a.errored > 0 ? -1 : 1;
  }
  if (b.p95Ms !== a.p95Ms) return b.p95Ms - a.p95Ms;
  return a.boundary < b.boundary ? -1 : a.boundary > b.boundary ? 1 : 0;
}

/**
 * Pull the Suspense fields out of a stored event, or null if it isn't one.
 * Canonical shape: `type: 'suspense'` with the fields flattened into `payload`.
 */
function extractSuspensePayload(event: EventRecord): SuspenseEventPayload | null {
  if (event.type !== 'suspense') return null;
  const payload = event.payload as Record<string, unknown> | undefined;
  if (!payload || typeof payload !== 'object') return null;
  return payload as unknown as SuspenseEventPayload;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
