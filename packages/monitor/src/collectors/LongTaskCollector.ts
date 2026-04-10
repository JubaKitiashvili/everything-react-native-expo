import type { Collector, MonitorConfig, MonitorEvent } from '../types';
import type { SignalBus } from '../core/SignalBus';

export interface LongTaskEventData {
  durationMs: number;
  detector: 'performance-observer' | 'raf';
}

export interface PerformanceObserverLike {
  observe(options: { entryTypes?: string[]; type?: string; buffered?: boolean }): void;
  disconnect(): void;
}

export type PerformanceObserverCtor = new (
  callback: (list: { getEntries(): { duration: number }[] }) => void,
) => PerformanceObserverLike;

export interface LongTaskCollectorDeps {
  signalBus: SignalBus;
  /** W3C long-task threshold. Default 50ms. */
  thresholdMs?: number;
  /** Inject a PerformanceObserver constructor. Defaults to the global. */
  PerformanceObserver?: PerformanceObserverCtor | null;
  /** Fallback rAF scheduler when PerformanceObserver is unavailable. */
  requestFrame?: (cb: (t: number) => void) => unknown;
  cancelFrame?: (handle: unknown) => void;
  now?: () => number;
}

/**
 * LongTaskCollector detects JS thread blocks greater than `thresholdMs`.
 * Prefers PerformanceObserver('longtask') (RN 0.83+) and falls back to a
 * rAF-based delta measurement when the observer is unavailable.
 */
export class LongTaskCollector implements Collector {
  readonly name = 'longTask';
  readonly priority = 45;

  private readonly deps: LongTaskCollectorDeps;
  private readonly thresholdMs: number;
  private readonly now: () => number;
  private readonly PerformanceObserverCtor: PerformanceObserverCtor | null;
  private readonly requestFrame: NonNullable<LongTaskCollectorDeps['requestFrame']>;
  private readonly cancelFrame: NonNullable<LongTaskCollectorDeps['cancelFrame']>;

  private observer: PerformanceObserverLike | null = null;
  private rafHandle: unknown = null;
  private lastTick: number | null = null;
  private running = false;

  constructor(deps: LongTaskCollectorDeps) {
    this.deps = deps;
    this.thresholdMs = deps.thresholdMs ?? 50;
    this.PerformanceObserverCtor =
      deps.PerformanceObserver !== undefined
        ? deps.PerformanceObserver
        : ((globalThis as { PerformanceObserver?: PerformanceObserverCtor })
            .PerformanceObserver ?? null);
    this.requestFrame =
      deps.requestFrame ??
      ((cb) => {
        if (typeof requestAnimationFrame === 'function') {
          return requestAnimationFrame(cb);
        }
        return setTimeout(() => cb(Date.now()), 16);
      });
    this.cancelFrame =
      deps.cancelFrame ??
      ((h) => {
        if (typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(h as number);
        } else {
          clearTimeout(h as ReturnType<typeof setTimeout>);
        }
      });
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
    if (this.running) return;
    this.running = true;
    if (this.PerformanceObserverCtor) {
      try {
        this.observer = new this.PerformanceObserverCtor((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration >= this.thresholdMs) {
              this.emit(entry.duration, 'performance-observer');
            }
          }
        });
        this.observer.observe({ entryTypes: ['longtask'], buffered: true });
        return;
      } catch {
        // fall back to rAF
      }
    }
    this.lastTick = null;
    this.scheduleRaf();
  }

  stop(): void {
    this.running = false;
    if (this.observer) {
      try {
        this.observer.disconnect();
      } catch {
        // ignore
      }
      this.observer = null;
    }
    if (this.rafHandle !== null) {
      this.cancelFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  dispose(): void {
    this.stop();
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Synthetic tick used by the rAF fallback and tests. */
  onTick(t: number): void {
    if (!this.running) return;
    if (this.lastTick === null) {
      this.lastTick = t;
      this.scheduleRaf();
      return;
    }
    const delta = t - this.lastTick;
    this.lastTick = t;
    if (delta >= this.thresholdMs) {
      this.emit(delta, 'raf');
    }
    this.scheduleRaf();
  }

  private scheduleRaf(): void {
    if (!this.running || this.observer) return;
    this.rafHandle = this.requestFrame((t) => this.onTick(t));
  }

  private emit(durationMs: number, detector: LongTaskEventData['detector']): void {
    const data: LongTaskEventData = { durationMs, detector };
    const event: MonitorEvent = {
      type: 'custom',
      timestamp: this.now(),
      wallTime: Date.now(),
      sessionId: '',
      data: { name: 'longTask', attributes: data as unknown as Record<string, never> },
    };
    this.deps.signalBus.emit(event);
  }
}
