import type { Collector, MonitorConfig, MonitorEvent } from '../types';
import type { SignalBus } from '../core/SignalBus';

export interface RenderEventData {
  componentName: string;
  renderCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
  isUnnecessary: boolean;
  /** Reason tag when emitted: 'storm' | 'slow' | 'informational' */
  reason: RenderEventReason;
  windowMs: number;
}

export type RenderEventReason = 'storm' | 'slow' | 'informational';

export interface RenderSampleHints {
  /**
   * When provided, whether the render's incoming props are shallowly equal
   * to the previous render's props. `false` means props changed, so the
   * render is justified and should NOT be flagged as unnecessary.
   */
  propsShallowEqual?: boolean;
  /**
   * When provided, whether state changed between renders. `true` means
   * state-driven re-render and is always justified.
   */
  stateChanged?: boolean;
}

export interface RenderCollectorDeps {
  signalBus: SignalBus;
  /** Aggregation window in ms. Default 1000. */
  debounceMs?: number;
  /**
   * How many renders within the window count as a storm when props didn't
   * change and state didn't update. Default 3.
   */
  unnecessaryThreshold?: number;
  /**
   * Single-render duration (ms) above which a bucket is flagged as "slow"
   * even if it only rendered once. Default 16 (one 60fps frame budget).
   */
  slowRenderMs?: number;
  /**
   * When true (default), buckets that are neither storms nor slow are
   * silently dropped to keep the bus quiet. Set to false for debugging
   * tools that want every flush.
   */
  emitOnlyInteresting?: boolean;
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
  /** At least one sample reported that props changed. */
  propsChangedInAnySample: boolean;
  /** At least one sample reported state changed. */
  stateChangedInAnySample: boolean;
  /** At least one sample provided hints — used to gate the storm decision. */
  hadHints: boolean;
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
  private readonly slowRenderMs: number;
  private readonly emitOnlyInteresting: boolean;
  private readonly scheduler: NonNullable<RenderCollectorDeps['scheduler']>;
  private readonly now: () => number;
  private readonly buckets = new Map<string, PendingBucket>();
  private flushHandle: unknown = null;
  private running = false;

  constructor(deps: RenderCollectorDeps) {
    this.deps = deps;
    this.debounceMs = deps.debounceMs ?? 1000;
    this.unnecessaryThreshold = deps.unnecessaryThreshold ?? 3;
    this.slowRenderMs = deps.slowRenderMs ?? 16;
    this.emitOnlyInteresting = deps.emitOnlyInteresting ?? true;
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
   * Optional `hints` (propsShallowEqual, stateChanged) let the collector
   * distinguish justified re-renders from wasteful ones.
   */
  recordSample(
    componentName: string,
    actualDurationMs: number,
    hints?: RenderSampleHints,
  ): void {
    if (!this.running) return;
    const propsChanged = hints?.propsShallowEqual === false;
    const stateChanged = hints?.stateChanged === true;
    const hadHints =
      hints?.propsShallowEqual !== undefined ||
      hints?.stateChanged !== undefined;
    const existing = this.buckets.get(componentName);
    if (existing) {
      existing.renderCount += 1;
      existing.totalDurationMs += actualDurationMs;
      if (actualDurationMs > existing.maxDurationMs) {
        existing.maxDurationMs = actualDurationMs;
      }
      if (propsChanged) existing.propsChangedInAnySample = true;
      if (stateChanged) existing.stateChangedInAnySample = true;
      if (hadHints) existing.hadHints = true;
    } else {
      this.buckets.set(componentName, {
        componentName,
        renderCount: 1,
        totalDurationMs: actualDurationMs,
        maxDurationMs: actualDurationMs,
        propsChangedInAnySample: propsChanged,
        stateChangedInAnySample: stateChanged,
        hadHints,
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
      const classification = this.classify(bucket);
      if (this.emitOnlyInteresting && classification === null) continue;
      const reason = classification ?? 'informational';
      const data: RenderEventData = {
        componentName: bucket.componentName,
        renderCount: bucket.renderCount,
        totalDurationMs: bucket.totalDurationMs,
        maxDurationMs: bucket.maxDurationMs,
        isUnnecessary: reason === 'storm',
        reason,
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

  /**
   * Decides whether a bucket warrants an emission.
   *   'storm' — ≥ threshold renders with no justification (props/state)
   *   'slow'  — single slow render above the frame budget
   *   null    — not interesting; caller decides based on `emitOnlyInteresting`
   */
  private classify(bucket: PendingBucket): RenderEventReason | null {
    // Slow renders are always interesting, even for a single mount.
    if (bucket.maxDurationMs >= this.slowRenderMs) return 'slow';

    // A storm requires crossing the threshold.
    if (bucket.renderCount < this.unnecessaryThreshold) return null;

    // If hints told us props changed or state changed in any sample,
    // this isn't wasteful — it's justified re-rendering.
    if (bucket.hadHints) {
      if (bucket.propsChangedInAnySample || bucket.stateChangedInAnySample) {
        return null;
      }
    }

    return 'storm';
  }
}
