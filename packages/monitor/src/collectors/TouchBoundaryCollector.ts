import type { Collector, MonitorConfig, MonitorEvent } from '../types';
import type { SignalBus } from '../core/SignalBus';

export interface TouchEventData {
  /** Component display / accessibility / testID label. */
  componentName: string;
  /** Dot-joined ancestor chain (outer → inner). */
  componentPath: string;
  x: number;
  y: number;
}

export interface TouchCollectorDeps {
  signalBus: SignalBus;
  /** Debounce window in ms — groups rapid taps into one event. Default 100. */
  debounceMs?: number;
  now?: () => number;
  wallNow?: () => number;
  /**
   * Optional scheduler (setTimeout by default). Tests inject a manual
   * driver so they can drive the debounce deterministically.
   */
  scheduler?: {
    set: (fn: () => void, ms: number) => unknown;
    clear: (handle: unknown) => void;
  };
}

interface PendingTouch {
  data: TouchEventData;
  timestamp: number;
  wallTime: number;
}

/**
 * TouchBoundaryCollector records tap events with component path context.
 * It does NOT attach to the native touch system itself — that plumbing
 * happens in the Babel plugin (Phase 1c #36) which auto-wraps components
 * and forwards synthesized taps via `record(...)`. Keeping the collector
 * pure-JS with no RN dependency means it's fully testable under ts-jest
 * and Phase 2 can swap in a native gesture recognizer if needed.
 */
export class TouchBoundaryCollector implements Collector {
  readonly name = 'touchBoundary';
  readonly priority = 35;

  private readonly deps: TouchCollectorDeps;
  private readonly debounceMs: number;
  private readonly now: () => number;
  private readonly wallNow: () => number;
  private readonly scheduler: NonNullable<TouchCollectorDeps['scheduler']>;

  private running = false;
  private pending: PendingTouch | null = null;
  private flushHandle: unknown = null;

  constructor(deps: TouchCollectorDeps) {
    this.deps = deps;
    this.debounceMs = deps.debounceMs ?? 100;
    this.now =
      deps.now ??
      (() =>
        typeof performance !== 'undefined' &&
        typeof performance.now === 'function'
          ? performance.now()
          : Date.now());
    this.wallNow = deps.wallNow ?? Date.now;
    this.scheduler =
      deps.scheduler ??
      ({
        set: (fn, ms) => setTimeout(fn, ms),
        clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      } as NonNullable<TouchCollectorDeps['scheduler']>);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  init(_config: MonitorConfig): void {}

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
    this.cancelFlush();
    this.pending = null;
  }

  dispose(): void {
    this.stop();
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Records a tap. Called by the Babel-injected touch boundary (or by
   * hand from host code). The collector debounces rapid repeated taps on
   * the same target into a single emission.
   */
  record(data: TouchEventData): void {
    if (!this.running) return;
    const timestamp = this.now();
    const wallTime = this.wallNow();

    if (this.pending && this.pending.data.componentPath === data.componentPath) {
      // Same target — update coordinates and timestamp, reset debounce.
      this.pending = { data, timestamp, wallTime };
      this.scheduleFlush();
      return;
    }
    // Different target — flush the old one first, then start a new debounce.
    if (this.pending) this.flush();
    this.pending = { data, timestamp, wallTime };
    this.scheduleFlush();
  }

  /** Flush any pending tap immediately. Exposed for tests and shutdown. */
  flushNow(): void {
    this.cancelFlush();
    this.flush();
  }

  private scheduleFlush(): void {
    this.cancelFlush();
    this.flushHandle = this.scheduler.set(() => {
      this.flushHandle = null;
      this.flush();
    }, this.debounceMs);
  }

  private cancelFlush(): void {
    if (this.flushHandle !== null) {
      this.scheduler.clear(this.flushHandle);
      this.flushHandle = null;
    }
  }

  private flush(): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    const event: MonitorEvent = {
      type: 'custom',
      timestamp: p.timestamp,
      wallTime: p.wallTime,
      sessionId: '',
      data: {
        name: 'touch',
        attributes: p.data as unknown as Record<string, never>,
      },
    };
    this.deps.signalBus.emit(event);
  }
}
