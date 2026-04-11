import type { Collector, MonitorConfig, MonitorEvent } from '../types';
import type { SignalBus } from '../core/SignalBus';

export type ImageCacheResult = 'memory' | 'disk' | 'miss' | 'unknown';

export interface ImageLoadInfo {
  uri: string;
  loadDurationMs: number;
  sourceWidth?: number;
  sourceHeight?: number;
  displayWidth?: number;
  displayHeight?: number;
  cache?: ImageCacheResult;
  format?: string;
  error?: string;
}

export interface ImageEventData {
  uri: string;
  count: number;
  avgDurationMs: number;
  worstDurationMs: number;
  cacheHits: number;
  cacheMisses: number;
  oversized: boolean;
  oversizeRatio?: number;
  format?: string;
  errorRate: number;
}

export interface ImageCollectorDeps {
  signalBus: SignalBus;
  /** "oversized" if source dimensions > N × display dimensions. Default 2. */
  oversizeMultiplier?: number;
  /** Slow load threshold in ms. Default 500. */
  slowThresholdMs?: number;
  /** Flush interval in ms. Default 5000. */
  windowMs?: number;
  scheduler?: {
    set: (fn: () => void, ms: number) => unknown;
    clear: (handle: unknown) => void;
  };
  now?: () => number;
  wallNow?: () => number;
}

interface Bucket {
  count: number;
  totalDurationMs: number;
  worstDurationMs: number;
  cacheHits: number;
  cacheMisses: number;
  oversizeHits: number;
  maxOversizeRatio: number;
  format?: string;
  errorCount: number;
}

/**
 * ImageCollector aggregates image load reports per URI and emits a
 * summary event per window. It does NOT intercept expo-image / RN
 * Image internals directly — the Babel plugin or host code wires
 * `record()` to the onLoad / onError callbacks.
 */
export class ImageCollector implements Collector {
  readonly name = 'image';
  readonly priority = 75;

  private readonly deps: ImageCollectorDeps;
  private readonly oversizeMultiplier: number;
  private readonly slowThresholdMs: number;
  private readonly windowMs: number;
  private readonly scheduler: NonNullable<ImageCollectorDeps['scheduler']>;
  private readonly now: () => number;
  private readonly wallNow: () => number;

  private running = false;
  private buckets = new Map<string, Bucket>();
  private flushHandle: unknown = null;

  constructor(deps: ImageCollectorDeps) {
    this.deps = deps;
    this.oversizeMultiplier = deps.oversizeMultiplier ?? 2;
    this.slowThresholdMs = deps.slowThresholdMs ?? 500;
    this.windowMs = deps.windowMs ?? 5000;
    this.scheduler =
      deps.scheduler ??
      ({
        set: (fn, ms) => setTimeout(fn, ms),
        clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      } as NonNullable<ImageCollectorDeps['scheduler']>);
    this.now =
      deps.now ??
      (() =>
        typeof performance !== 'undefined' &&
        typeof performance.now === 'function'
          ? performance.now()
          : Date.now());
    this.wallNow = deps.wallNow ?? Date.now;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  init(_config: MonitorConfig): void {}

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
    if (this.flushHandle !== null) {
      this.scheduler.clear(this.flushHandle);
      this.flushHandle = null;
    }
    this.buckets.clear();
  }

  dispose(): void {
    this.stop();
  }

  isRunning(): boolean {
    return this.running;
  }

  record(info: ImageLoadInfo): void {
    if (!this.running) return;
    let bucket = this.buckets.get(info.uri);
    if (!bucket) {
      bucket = {
        count: 0,
        totalDurationMs: 0,
        worstDurationMs: 0,
        cacheHits: 0,
        cacheMisses: 0,
        oversizeHits: 0,
        maxOversizeRatio: 0,
        format: info.format,
        errorCount: 0,
      };
      this.buckets.set(info.uri, bucket);
    }
    bucket.count += 1;
    bucket.totalDurationMs += info.loadDurationMs;
    if (info.loadDurationMs > bucket.worstDurationMs) {
      bucket.worstDurationMs = info.loadDurationMs;
    }
    if (info.cache === 'memory' || info.cache === 'disk') bucket.cacheHits += 1;
    else if (info.cache === 'miss') bucket.cacheMisses += 1;
    if (info.error) bucket.errorCount += 1;
    if (info.format && !bucket.format) bucket.format = info.format;
    const ratio = oversizeRatio(info, this.oversizeMultiplier);
    if (ratio !== null && ratio > this.oversizeMultiplier) {
      bucket.oversizeHits += 1;
      if (ratio > bucket.maxOversizeRatio) bucket.maxOversizeRatio = ratio;
    }
    this.scheduleFlush();
  }

  flushNow(): void {
    if (this.flushHandle !== null) {
      this.scheduler.clear(this.flushHandle);
      this.flushHandle = null;
    }
    this.flush();
  }

  /** Slow-load threshold getter for host integrations. */
  getSlowThreshold(): number {
    return this.slowThresholdMs;
  }

  private scheduleFlush(): void {
    if (this.flushHandle !== null) return;
    this.flushHandle = this.scheduler.set(() => {
      this.flushHandle = null;
      this.flush();
    }, this.windowMs);
  }

  private flush(): void {
    if (this.buckets.size === 0) return;
    const now = this.now();
    const wall = this.wallNow();
    for (const [uri, b] of this.buckets.entries()) {
      const data: ImageEventData = {
        uri,
        count: b.count,
        avgDurationMs: b.totalDurationMs / b.count,
        worstDurationMs: b.worstDurationMs,
        cacheHits: b.cacheHits,
        cacheMisses: b.cacheMisses,
        oversized: b.oversizeHits > 0,
        oversizeRatio:
          b.maxOversizeRatio > 0 ? b.maxOversizeRatio : undefined,
        format: b.format,
        errorRate: b.errorCount / b.count,
      };
      const event: MonitorEvent = {
        type: 'custom',
        timestamp: now,
        wallTime: wall,
        sessionId: '',
        data: {
          name: 'image',
          attributes: data as unknown as Record<string, never>,
        },
      };
      this.deps.signalBus.emit(event);
    }
    this.buckets.clear();
  }
}

function oversizeRatio(info: ImageLoadInfo, threshold: number): number | null {
  const sw = info.sourceWidth;
  const sh = info.sourceHeight;
  const dw = info.displayWidth;
  const dh = info.displayHeight;
  if (!sw || !sh || !dw || !dh) return null;
  const ratioW = sw / dw;
  const ratioH = sh / dh;
  const max = Math.max(ratioW, ratioH);
  return max > threshold ? max : null;
}
