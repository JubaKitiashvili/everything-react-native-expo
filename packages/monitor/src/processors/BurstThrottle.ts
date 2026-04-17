import type { MonitorEvent } from '../types';

export interface BurstThrottleOptions {
  /** Window in ms over which burst counts are tracked. Default 5000. */
  windowMs?: number;
  /** Max allowed events per composite key per window. Default 3. */
  maxPerWindow?: number;
  /**
   * Derives a burst-throttle key from an event. Return `null` to opt the
   * event out of throttling entirely (e.g. crash / ANR / startup).
   */
  keyFor: (event: MonitorEvent) => string | null;
  /** Injectable clock for tests. */
  now?: () => number;
}

interface Bucket {
  firstSeenAt: number;
  lastSeenAt: number;
  count: number;
}

/**
 * Lightweight sliding-window rate limiter used by the main event pipeline
 * to prevent floods from chatty collectors (renders, fabric commits,
 * navigation bounces). The sampler already down-samples by rate — this is
 * the safety net that caps absolute volume.
 *
 * Intentionally separate from `DedupEngine`:
 *   - DedupEngine groups fingerprinted events (crashes) so downstream
 *     intelligence sees one entry per unique signature.
 *   - BurstThrottle caps volume for non-fingerprinted streaming events
 *     before they ever reach the store or dashboard.
 */
export class BurstThrottle {
  private readonly windowMs: number;
  private readonly maxPerWindow: number;
  private readonly keyFor: (event: MonitorEvent) => string | null;
  private readonly now: () => number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(options: BurstThrottleOptions) {
    this.windowMs = options.windowMs ?? 5000;
    this.maxPerWindow = options.maxPerWindow ?? 3;
    this.keyFor = options.keyFor;
    this.now = options.now ?? Date.now;
  }

  /**
   * Returns true if the event should pass through, false if it's
   * throttled and should be dropped.
   */
  accept(event: MonitorEvent): boolean {
    const key = this.keyFor(event);
    if (key === null) return true;
    const now = this.now();
    this.evict(now);
    const existing = this.buckets.get(key);
    if (!existing) {
      this.buckets.set(key, { firstSeenAt: now, lastSeenAt: now, count: 1 });
      return true;
    }
    if (now - existing.firstSeenAt > this.windowMs) {
      this.buckets.set(key, { firstSeenAt: now, lastSeenAt: now, count: 1 });
      return true;
    }
    existing.lastSeenAt = now;
    existing.count += 1;
    return existing.count <= this.maxPerWindow;
  }

  clear(): void {
    this.buckets.clear();
  }

  /** Diagnostic: number of live buckets. */
  size(): number {
    return this.buckets.size;
  }

  private evict(now: number): void {
    for (const [k, v] of this.buckets.entries()) {
      if (now - v.firstSeenAt > this.windowMs) {
        this.buckets.delete(k);
      }
    }
  }
}

/**
 * Default key derivation for the main pipeline. Groups events by
 * (type + subject) where subject is the most identifying field per type.
 * Returns `null` for critical event types that must never be throttled.
 */
export function defaultBurstKeyFor(event: MonitorEvent): string | null {
  // Never throttle critical safety signals.
  if (
    event.type === 'crash' ||
    (event.type as string) === 'native_anr' ||
    (event.type as string) === 'interrupted_span' ||
    (event.type as string) === 'startup'
  ) {
    return null;
  }

  const data = (event.data as Record<string, unknown>) ?? {};
  const subject = pickSubject(event.type, data);
  return `${event.type}:${subject}`;
}

function pickSubject(type: string, data: Record<string, unknown>): string {
  switch (type) {
    case 'render':
      return str(data.componentName) ?? '';
    case 'navigation':
      return `${str(data.screen) ?? ''}←${str(data.previousScreen) ?? ''}`;
    case 'network':
      return `${str(data.method) ?? ''} ${normalizeUrl(str(data.url) ?? '')}`;
    case 'custom':
      return str(data.name) ?? '';
    case 'frame_drop':
      return str(data.location) ?? '';
    case 'long_task':
      return str(data.source) ?? 'longtask';
    case 'touch':
      return str(data.target) ?? '';
    case 'state':
      return str(data.storeName) ?? '';
    case 'image':
      return normalizeUrl(str(data.uri) ?? '');
    case 'a11y':
      return `${str(data.rule) ?? ''}:${str(data.componentName) ?? ''}`;
    case 'storage':
      return str(data.operation) ?? '';
    case 'memory':
      return 'memory';
    case 'native_metrics':
      return 'native_metrics';
    case 'native_thermal':
      return 'native_thermal';
    case 'dual_thread_fps':
      return 'dual_thread_fps';
    case 'fabric_commit':
      return 'fabric_commit';
    case 'suspense':
      return str(data.boundaryId) ?? '';
    case 'activity':
      return str(data.componentName) ?? '';
    case 'frustration':
      return `${str(data.level) ?? ''}:${str(data.target) ?? ''}`;
    default:
      return type;
  }
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Collapses ?query=... and numeric path segments so distinct URLs group. */
function normalizeUrl(url: string): string {
  if (!url) return '';
  const withoutQuery = url.split('?')[0] ?? url;
  return withoutQuery.replace(/\/\d+(?=\/|$)/g, '/:id');
}
