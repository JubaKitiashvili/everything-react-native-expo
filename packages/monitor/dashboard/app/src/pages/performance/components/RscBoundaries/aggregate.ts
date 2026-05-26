/**
 * Pure transform: fold RSC monitoring events into a per-route summary.
 *
 * The SDK's `RSCCollector` (packages/monitor/src/collectors/RSCCollector.ts)
 * emits one event per RSC lifecycle moment, keyed by `routePath`. The server
 * ingest promotes these into a canonical `EventRecord` of `type: 'rsc'` with
 * the RSC fields flattened directly into `payload` (kind / routePath /
 * serverRenderTimeMs / ...). So we match `event.type === 'rsc'` and read the
 * fields straight off `event.payload`, exactly like every other panel.
 *
 * RSC data is per-route, not hierarchical, so a "boundary" here is a route
 * path. We aggregate every event for a route into one row: server-render
 * timing (avg / p95 / renders), payload sizes, reload timing, streaming
 * chunk progress, and a cache hit ratio. A row's status is derived purely
 * from that data so the panel can render a single status Pill per row.
 */

import { percentile } from '@/shared/ui/HistogramCDF/computeHistogram';
import type { EventRecord } from '@/shared/api/types';

/**
 * The payload shape consumed from a stored `type: 'rsc'` `EventRecord`.
 * Mirrors `RSCEventData` in the SDK collector — kept duplicated rather than
 * imported because the dashboard app is browser-side and does not depend on
 * the Node SDK package.
 */
export interface RscEventPayload {
  kind: 'server-render' | 'payload' | 'streaming-chunk' | 'cache-status' | 'reload';
  routePath?: string;
  serverRenderTimeMs?: number;
  payloadSizeBytes?: number;
  chunkIndex?: number;
  chunkCount?: number;
  cacheHit?: boolean;
  reloadDurationMs?: number;
  correlationId?: string;
}

/** Health classification for a boundary, used to colour its status Pill. */
export type RscBoundaryStatus = 'ok' | 'slow' | 'streaming';

/** One aggregated RSC boundary (route). */
export interface RscBoundarySummary {
  /** Route path — the boundary identity. */
  route: string;
  /** Count of `server-render` events seen for this route. */
  renders: number;
  /** Mean server-render time in ms (0 when no renders recorded). */
  avgMs: number;
  /** 95th-percentile server-render time in ms. */
  p95Ms: number;
  /** Largest observed RSC payload in bytes (0 when none recorded). */
  maxPayloadBytes: number;
  /** Mean `router.reload()` duration in ms (0 when no reloads recorded). */
  avgReloadMs: number;
  /** Count of reload events recorded for this route. */
  reloads: number;
  /** Cache hits / (hits + misses) across `cache-status` events, 0..1. */
  cacheHitRatio: number;
  /** Total `cache-status` events observed. */
  cacheSamples: number;
  /** True while the latest streaming run has unreceived chunks. */
  isStreaming: boolean;
  /** Latest `chunkIndex + 1` seen (chunks received so far). */
  chunksReceived: number;
  /** Latest `chunkCount` seen (total chunks expected). */
  chunkTotal: number;
  /** Derived health classification. */
  status: RscBoundaryStatus;
}

export interface RscBoundariesSummary {
  boundaries: RscBoundarySummary[];
  /** Number of distinct routes summarised. */
  routeCount: number;
  /** Total server renders summed across every route. */
  totalRenders: number;
}

/** Server renders at or above this p95 (ms) are flagged "slow". */
export const SLOW_RENDER_P95_MS = 200;

/**
 * Fold a slice of `type: 'rsc'` event records into a deterministic
 * per-route summary. Non-rsc records and malformed payloads are skipped.
 * Boundaries are ordered by p95 descending (slowest first), then by route
 * name, so renders and tests are stable.
 */
export function aggregateRscBoundaries(events: readonly EventRecord[]): RscBoundariesSummary {
  const acc = new Map<string, MutableBoundary>();

  for (const event of events) {
    const payload = extractRscPayload(event);
    if (!payload) continue;

    const route = typeof payload.routePath === 'string' ? payload.routePath : '(unknown)';
    const boundary = getOrCreate(acc, route);

    switch (payload.kind) {
      case 'server-render':
        if (isFinitePositive(payload.serverRenderTimeMs)) {
          boundary.renderDurations.push(payload.serverRenderTimeMs);
        }
        break;
      case 'payload':
        if (isFinitePositive(payload.payloadSizeBytes)) {
          boundary.maxPayloadBytes = Math.max(boundary.maxPayloadBytes, payload.payloadSizeBytes);
        }
        break;
      case 'reload':
        if (isFinitePositive(payload.reloadDurationMs)) {
          boundary.reloadDurations.push(payload.reloadDurationMs);
        }
        break;
      case 'cache-status':
        if (typeof payload.cacheHit === 'boolean') {
          boundary.cacheSamples += 1;
          if (payload.cacheHit) boundary.cacheHits += 1;
        }
        break;
      case 'streaming-chunk':
        if (isFiniteNonNegative(payload.chunkIndex) && isFinitePositive(payload.chunkCount)) {
          boundary.chunksReceived = payload.chunkIndex + 1;
          boundary.chunkTotal = payload.chunkCount;
        }
        break;
    }
  }

  const boundaries = [...acc.values()].map(finalizeBoundary).sort(compareBoundaries);

  return {
    boundaries,
    routeCount: boundaries.length,
    totalRenders: boundaries.reduce((sum, b) => sum + b.renders, 0),
  };
}

interface MutableBoundary {
  route: string;
  renderDurations: number[];
  reloadDurations: number[];
  maxPayloadBytes: number;
  cacheHits: number;
  cacheSamples: number;
  chunksReceived: number;
  chunkTotal: number;
}

function getOrCreate(map: Map<string, MutableBoundary>, route: string): MutableBoundary {
  let boundary = map.get(route);
  if (!boundary) {
    boundary = {
      route,
      renderDurations: [],
      reloadDurations: [],
      maxPayloadBytes: 0,
      cacheHits: 0,
      cacheSamples: 0,
      chunksReceived: 0,
      chunkTotal: 0,
    };
    map.set(route, boundary);
  }
  return boundary;
}

function finalizeBoundary(b: MutableBoundary): RscBoundarySummary {
  const renders = b.renderDurations.length;
  const avgMs = renders > 0 ? mean(b.renderDurations) : 0;
  const p95Ms = renders > 0 ? percentile(b.renderDurations, 0.95) : 0;
  const reloads = b.reloadDurations.length;
  const avgReloadMs = reloads > 0 ? mean(b.reloadDurations) : 0;
  const cacheHitRatio = b.cacheSamples > 0 ? b.cacheHits / b.cacheSamples : 0;
  const isStreaming = b.chunkTotal > 0 && b.chunksReceived < b.chunkTotal;

  return {
    route: b.route,
    renders,
    avgMs,
    p95Ms,
    maxPayloadBytes: b.maxPayloadBytes,
    avgReloadMs,
    reloads,
    cacheHitRatio,
    cacheSamples: b.cacheSamples,
    isStreaming,
    chunksReceived: b.chunksReceived,
    chunkTotal: b.chunkTotal,
    status: deriveStatus(p95Ms, isStreaming),
  };
}

function deriveStatus(p95Ms: number, isStreaming: boolean): RscBoundaryStatus {
  if (isStreaming) return 'streaming';
  if (p95Ms >= SLOW_RENDER_P95_MS) return 'slow';
  return 'ok';
}

/** Slowest (highest p95) first, then alphabetical by route for stability. */
function compareBoundaries(a: RscBoundarySummary, b: RscBoundarySummary): number {
  if (b.p95Ms !== a.p95Ms) return b.p95Ms - a.p95Ms;
  return a.route < b.route ? -1 : a.route > b.route ? 1 : 0;
}

/**
 * Pull the RSC fields out of a stored event, or null if it isn't one.
 * Canonical shape: `type: 'rsc'` with the fields flattened into `payload`.
 */
function extractRscPayload(event: EventRecord): RscEventPayload | null {
  if (event.type !== 'rsc') return null;
  const payload = event.payload as Record<string, unknown> | undefined;
  if (!payload || typeof payload !== 'object') return null;
  return payload as unknown as RscEventPayload;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
