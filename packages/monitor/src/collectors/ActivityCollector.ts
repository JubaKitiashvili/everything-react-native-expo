import type { Collector, MonitorConfig, MonitorEvent } from '../types';
import type { SignalBus } from '../core/SignalBus';

export type ActivityMode = 'visible' | 'hidden';

export interface ActivityEventData {
  componentName: string;
  wastedRenderCount: number;
  totalRenderCount: number;
  mode: ActivityMode;
  lastTransitionMs: number | null;
}

export interface ActivityCollectorDeps {
  signalBus: SignalBus;
  /**
   * Aggregation window — emissions batched within this window, then
   * flushed. Default 1000ms. Prevents a flood of per-render events.
   */
  windowMs?: number;
  scheduler?: {
    set: (fn: () => void, ms: number) => unknown;
    clear: (handle: unknown) => void;
  };
  now?: () => number;
  wallNow?: () => number;
}

interface Bucket {
  componentName: string;
  wastedRenderCount: number;
  totalRenderCount: number;
  mode: ActivityMode;
  transitionAt: number | null;
}

/**
 * ActivityCollector tracks renders that happen while a React 19
 * `<Activity mode="hidden">` is not visible. The Babel plugin injects
 * markActivityMode + markRender calls into instrumented components;
 * the collector aggregates counters and flushes on a debounce.
 */
export class ActivityCollector implements Collector {
  readonly name = 'activity';
  readonly priority = 70;

  private readonly deps: ActivityCollectorDeps;
  private readonly windowMs: number;
  private readonly scheduler: NonNullable<ActivityCollectorDeps['scheduler']>;
  private readonly now: () => number;
  private readonly wallNow: () => number;

  private running = false;
  private modes = new Map<string, ActivityMode>();
  private lastTransition = new Map<string, number>();
  private buckets = new Map<string, Bucket>();
  private flushHandle: unknown = null;

  constructor(deps: ActivityCollectorDeps) {
    this.deps = deps;
    this.windowMs = deps.windowMs ?? 1000;
    this.scheduler =
      deps.scheduler ??
      ({
        set: (fn, ms) => setTimeout(fn, ms),
        clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      } as NonNullable<ActivityCollectorDeps['scheduler']>);
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
    this.modes.clear();
    this.lastTransition.clear();
    this.buckets.clear();
  }

  dispose(): void {
    this.stop();
  }

  isRunning(): boolean {
    return this.running;
  }

  markMode(componentName: string, mode: ActivityMode): void {
    if (!this.running) return;
    const prev = this.modes.get(componentName);
    if (prev !== mode) {
      this.modes.set(componentName, mode);
      this.lastTransition.set(componentName, this.now());
    }
  }

  markRender(componentName: string): void {
    if (!this.running) return;
    const mode = this.modes.get(componentName) ?? 'visible';
    let bucket = this.buckets.get(componentName);
    if (!bucket) {
      bucket = {
        componentName,
        wastedRenderCount: 0,
        totalRenderCount: 0,
        mode,
        transitionAt: this.lastTransition.get(componentName) ?? null,
      };
      this.buckets.set(componentName, bucket);
    }
    bucket.totalRenderCount += 1;
    bucket.mode = mode;
    if (mode === 'hidden') bucket.wastedRenderCount += 1;
    this.scheduleFlush();
  }

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
    }, this.windowMs);
  }

  private flush(): void {
    if (this.buckets.size === 0) return;
    const now = this.now();
    const wallNow = this.wallNow();
    for (const bucket of this.buckets.values()) {
      // Only emit when there's wasted work — quiet otherwise.
      if (bucket.wastedRenderCount === 0) continue;
      const data: ActivityEventData = {
        componentName: bucket.componentName,
        wastedRenderCount: bucket.wastedRenderCount,
        totalRenderCount: bucket.totalRenderCount,
        mode: bucket.mode,
        lastTransitionMs: bucket.transitionAt,
      };
      const event: MonitorEvent = {
        type: 'custom',
        timestamp: now,
        wallTime: wallNow,
        sessionId: '',
        data: {
          name: 'activity',
          attributes: data as unknown as Record<string, never>,
        },
      };
      this.deps.signalBus.emit(event);
    }
    this.buckets.clear();
  }
}
