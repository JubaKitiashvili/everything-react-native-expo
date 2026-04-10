import type { Collector, MonitorConfig, MonitorEvent } from '../types';
import type { SignalBus } from '../core/SignalBus';

export interface RenderEventData {
  componentName: string;
  renderCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
  isUnnecessary: boolean;
  windowMs: number;
}

export interface RenderCollectorDeps {
  signalBus: SignalBus;
  /** Aggregation window in ms. Default 1000. */
  debounceMs?: number;
  /** How many renders within the window count as "unnecessary". Default 3. */
  unnecessaryThreshold?: number;
  now?: () => number;
  /** Optional scheduler for tests (setTimeout by default). */
  scheduler?: {
    set: (fn: () => void, ms: number) => unknown;
    clear: (handle: unknown) => void;
  };
}

interface PendingBucket {
  componentName: string;
  renderCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
}

/**
 * RenderCollector aggregates React Profiler samples and emits a single
 * render event per component per debounce window. Host apps wire this to
 * their root <Profiler> via the recordSample() API — the collector does
 * not mount the Profiler itself because that would force React as a hard
 * runtime dependency here.
 */
export class RenderCollector implements Collector {
  readonly name = 'render';
  readonly priority = 30;

  private readonly deps: RenderCollectorDeps;
  private readonly debounceMs: number;
  private readonly unnecessaryThreshold: number;
  private readonly scheduler: NonNullable<RenderCollectorDeps['scheduler']>;
  private readonly now: () => number;
  private readonly buckets = new Map<string, PendingBucket>();
  private flushHandle: unknown = null;
  private running = false;

  constructor(deps: RenderCollectorDeps) {
    this.deps = deps;
    this.debounceMs = deps.debounceMs ?? 1000;
    this.unnecessaryThreshold = deps.unnecessaryThreshold ?? 3;
    this.scheduler =
      deps.scheduler ??
      ({
        set: (fn, ms) => setTimeout(fn, ms),
        clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      } as NonNullable<RenderCollectorDeps['scheduler']>);
    this.now =
      deps.now ??
      (() =>
        typeof performance !== 'undefined' &&
        typeof performance.now === 'function'
          ? performance.now()
          : Date.now());
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

  /**
   * Feeds a React Profiler sample into the aggregator. Parameters mirror
   * the Profiler onRender signature so host apps can wire it directly.
   */
  recordSample(componentName: string, actualDurationMs: number): void {
    if (!this.running) return;
    const existing = this.buckets.get(componentName);
    if (existing) {
      existing.renderCount += 1;
      existing.totalDurationMs += actualDurationMs;
      if (actualDurationMs > existing.maxDurationMs) {
        existing.maxDurationMs = actualDurationMs;
      }
    } else {
      this.buckets.set(componentName, {
        componentName,
        renderCount: 1,
        totalDurationMs: actualDurationMs,
        maxDurationMs: actualDurationMs,
      });
    }
    this.scheduleFlush();
  }

  /** Flushes any pending buckets immediately. Exposed for tests. */
  flushNow(): void {
    if (this.flushHandle !== null) {
      this.scheduler.clear(this.flushHandle);
      this.flushHandle = null;
    }
    this.flush();
  }

  private scheduleFlush(): void {
    if (this.flushHandle !== null) return;
    this.flushHandle = this.scheduler.set(() => {
      this.flushHandle = null;
      this.flush();
    }, this.debounceMs);
  }

  private flush(): void {
    if (this.buckets.size === 0) return;
    const now = this.now();
    for (const bucket of this.buckets.values()) {
      const data: RenderEventData = {
        componentName: bucket.componentName,
        renderCount: bucket.renderCount,
        totalDurationMs: bucket.totalDurationMs,
        maxDurationMs: bucket.maxDurationMs,
        isUnnecessary: bucket.renderCount >= this.unnecessaryThreshold,
        windowMs: this.debounceMs,
      };
      const event: MonitorEvent = {
        type: 'render',
        timestamp: now,
        wallTime: Date.now(),
        sessionId: '', // Enricher attaches the real session id downstream
        data,
      };
      this.deps.signalBus.emit(event);
    }
    this.buckets.clear();
  }
}
