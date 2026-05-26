import type { EventRecord } from '@/shared/api/types';

/** A single checkpoint marker recorded inside a span. */
export interface SpanCheckpoint {
  label: string;
  /** Absolute time (same clock as span.startMs). */
  atMs: number;
}

/**
 * The raw span shape carried on a `type: 'trace'` event's payload. This is the
 * contract the SDK emits and the lead seeds — exported so seeders/tests stay in
 * sync. `parentId` links a span to its parent; a missing/unknown parent makes
 * the span a root (orphan).
 */
export interface RawSpan {
  id: string;
  name: string;
  /** Absolute start time (ms). */
  startMs: number;
  /** Span duration (ms). */
  durationMs: number;
  parentId?: string;
  attributes?: Record<string, unknown>;
  checkpoints?: SpanCheckpoint[];
}

/**
 * The payload shape of a `type: 'trace'` event. `spans` is the flat list of
 * spans that make up the trace; `buildSpanTree` nests them by `parentId`.
 */
export interface TracePayload {
  /** Optional trace identifier — surfaced in the detail area when present. */
  traceId?: string;
  /** Optional human label for the whole trace. */
  name?: string;
  spans: RawSpan[];
}

/** A span placed in the tree, enriched with layout + nesting metadata. */
export interface SpanNode {
  id: string;
  name: string;
  startMs: number;
  durationMs: number;
  endMs: number;
  attributes: Record<string, unknown>;
  checkpoints: SpanCheckpoint[];
  /** Depth in the tree — 0 for roots. */
  depth: number;
  /** Bar left edge as a fraction (0..1) of the trace window. */
  offset: number;
  /** Bar width as a fraction (0..1) of the trace window. */
  width: number;
  /** Checkpoint positions as fractions (0..1) of the trace window. */
  checkpointOffsets: Array<{ label: string; offset: number }>;
  children: SpanNode[];
}

export interface SpanTree {
  /** Root spans (parentless or orphaned), in start order. */
  roots: SpanNode[];
  /** Trace window start (earliest span start). */
  traceStart: number;
  /** Trace window end (latest span end). */
  traceEnd: number;
  /** Window length in ms (traceEnd - traceStart). */
  durationMs: number;
  /** Total number of spans across the whole tree. */
  spanCount: number;
}

const EMPTY_TREE: SpanTree = {
  roots: [],
  traceStart: 0,
  traceEnd: 0,
  durationMs: 0,
  spanCount: 0,
};

/**
 * Build a nested span tree from a flat list of spans.
 *
 * - Nests by `parentId`. A span whose `parentId` is missing or points at an
 *   unknown id becomes a root (orphan handling).
 * - Computes the trace window from the min start / max end across all spans.
 * - Per span, computes `offset`/`width` as fractions (0..1) of that window for
 *   bar positioning, plus `depth` and per-checkpoint offsets.
 * - Deterministic: roots and children are sorted by start time, then id.
 *
 * A zero-length window (single instantaneous span, all spans at the same
 * instant) yields width 0 and offset 0 — callers can clamp to a minimum bar
 * width for visibility.
 */
export function buildSpanTree(spans: RawSpan[]): SpanTree {
  const valid = spans.filter(
    (s) =>
      typeof s.id === 'string' &&
      s.id.length > 0 &&
      typeof s.startMs === 'number' &&
      Number.isFinite(s.startMs) &&
      typeof s.durationMs === 'number' &&
      Number.isFinite(s.durationMs),
  );
  if (valid.length === 0) return EMPTY_TREE;

  const byId = new Map<string, RawSpan>();
  for (const span of valid) byId.set(span.id, span);

  let traceStart = Infinity;
  let traceEnd = -Infinity;
  for (const span of valid) {
    const end = span.startMs + Math.max(0, span.durationMs);
    if (span.startMs < traceStart) traceStart = span.startMs;
    if (end > traceEnd) traceEnd = end;
  }
  const windowMs = traceEnd - traceStart;

  // Group children by their effective parent (roots keyed under the empty string).
  const childrenOf = new Map<string, RawSpan[]>();
  for (const span of valid) {
    const parentId =
      span.parentId !== undefined && byId.has(span.parentId) && span.parentId !== span.id
        ? span.parentId
        : '';
    const bucket = childrenOf.get(parentId);
    if (bucket) bucket.push(span);
    else childrenOf.set(parentId, [span]);
  }

  const sortSpans = (list: RawSpan[]): RawSpan[] =>
    [...list].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));

  let spanCount = 0;
  const seen = new Set<string>();

  const toNode = (span: RawSpan, depth: number): SpanNode => {
    seen.add(span.id);
    spanCount += 1;
    const safeDuration = Math.max(0, span.durationMs);
    const endMs = span.startMs + safeDuration;
    const offset = windowMs > 0 ? (span.startMs - traceStart) / windowMs : 0;
    const width = windowMs > 0 ? safeDuration / windowMs : 0;

    const checkpoints = Array.isArray(span.checkpoints) ? span.checkpoints : [];
    const checkpointOffsets = checkpoints.map((cp) => ({
      label: cp.label,
      offset: windowMs > 0 ? clamp01((cp.atMs - traceStart) / windowMs) : 0,
    }));

    const rawChildren = childrenOf.get(span.id) ?? [];
    const children = sortSpans(rawChildren)
      // Guard against cycles: never revisit an already-placed span.
      .filter((child) => !seen.has(child.id))
      .map((child) => toNode(child, depth + 1));

    return {
      id: span.id,
      name: span.name,
      startMs: span.startMs,
      durationMs: safeDuration,
      endMs,
      attributes: span.attributes ?? {},
      checkpoints,
      depth,
      offset: clamp01(offset),
      width: clamp01(width),
      checkpointOffsets,
      children,
    };
  };

  const roots = sortSpans(childrenOf.get('') ?? []).map((span) => toNode(span, 0));

  return {
    roots,
    traceStart,
    traceEnd,
    durationMs: windowMs,
    spanCount,
  };
}

/**
 * Pull the latest trace's spans out of an event stream and build its tree.
 * Picks the newest `type: 'trace'` event (by timestamp) that carries spans.
 * Returns an empty tree when no usable trace event exists.
 */
export function buildLatestTraceTree(events: EventRecord[]): SpanTree {
  let latest: EventRecord | null = null;
  for (const event of events) {
    if (event.type !== 'trace') continue;
    const spans = extractSpans(event.payload);
    if (spans.length === 0) continue;
    if (latest === null || event.timestamp > latest.timestamp) latest = event;
  }
  if (latest === null) return EMPTY_TREE;
  return buildSpanTree(extractSpans(latest.payload));
}

/** Read `payload.spans` defensively from an unknown payload shape. */
export function extractSpans(payload: Record<string, unknown>): RawSpan[] {
  const raw = (payload as { spans?: unknown }).spans;
  if (!Array.isArray(raw)) return [];
  const out: RawSpan[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const span = entry as Record<string, unknown>;
    if (typeof span.id !== 'string') continue;
    if (typeof span.name !== 'string') continue;
    if (typeof span.startMs !== 'number' || !Number.isFinite(span.startMs)) continue;
    if (typeof span.durationMs !== 'number' || !Number.isFinite(span.durationMs)) continue;
    out.push({
      id: span.id,
      name: span.name,
      startMs: span.startMs,
      durationMs: span.durationMs,
      ...(typeof span.parentId === 'string' ? { parentId: span.parentId } : {}),
      ...(span.attributes && typeof span.attributes === 'object'
        ? { attributes: span.attributes as Record<string, unknown> }
        : {}),
      ...(Array.isArray(span.checkpoints)
        ? { checkpoints: pickCheckpoints(span.checkpoints) }
        : {}),
    });
  }
  return out;
}

function pickCheckpoints(raw: unknown[]): SpanCheckpoint[] {
  const out: SpanCheckpoint[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const cp = entry as Record<string, unknown>;
    if (typeof cp.label !== 'string') continue;
    if (typeof cp.atMs !== 'number' || !Number.isFinite(cp.atMs)) continue;
    out.push({ label: cp.label, atMs: cp.atMs });
  }
  return out;
}

export function formatDurationMs(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)} ms`;
  if (ms < 10_000) return `${(ms / 1_000).toFixed(2)} s`;
  return `${(ms / 1_000).toFixed(1)} s`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
