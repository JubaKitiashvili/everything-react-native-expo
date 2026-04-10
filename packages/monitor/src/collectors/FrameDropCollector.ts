import type { Collector, MonitorConfig, MonitorEvent } from '../types';
import type { SignalBus } from '../core/SignalBus';

export interface FrameDropEventData {
  droppedFrames: number;
  expectedFrames: number;
  durationMs: number;
  averageFps: number;
  minFps: number;
}

export interface FrameDropCollectorDeps {
  signalBus: SignalBus;
  /** FPS below this counts as a "drop" sample. Default 55. */
  dropThreshold?: number;
  /** Drop has to persist this long before emitting. Default 500ms. */
  sustainedMs?: number;
  /** Expected frame budget in ms (60fps → 16.67). Default 16.67. */
  frameBudgetMs?: number;
  /**
   * rAF scheduler. Default uses `requestAnimationFrame`. Tests inject a
   * manual driver.
   */
  requestFrame?: (cb: (t: number) => void) => unknown;
  cancelFrame?: (handle: unknown) => void;
  now?: () => number;
  /** Optional app-state hook — stops sampling while backgrounded. */
  appState?: {
    addChangeListener(cb: (active: boolean) => void): { remove(): void };
  };
}

/**
 * FrameDropCollector measures frame timing via requestAnimationFrame and
 * emits a single event per sustained drop window. Designed to add zero
 * overhead when there are no drops — we only allocate on state change.
 */
export class FrameDropCollector implements Collector {
  readonly name = 'frameDrop';
  readonly priority = 40;

  private readonly deps: FrameDropCollectorDeps;
  private readonly dropThreshold: number;
  private readonly sustainedMs: number;
  private readonly frameBudgetMs: number;
  private readonly requestFrame: NonNullable<FrameDropCollectorDeps['requestFrame']>;
  private readonly cancelFrame: NonNullable<FrameDropCollectorDeps['cancelFrame']>;
  private readonly now: () => number;

  private handle: unknown = null;
  private running = false;
  private lastFrameAt = 0;
  private dropStart: number | null = null;
  private droppedFrames = 0;
  private expectedFrames = 0;
  private minFps = Infinity;
  private appStateSub: { remove(): void } | null = null;

  constructor(deps: FrameDropCollectorDeps) {
    this.deps = deps;
    this.dropThreshold = deps.dropThreshold ?? 55;
    this.sustainedMs = deps.sustainedMs ?? 500;
    this.frameBudgetMs = deps.frameBudgetMs ?? 1000 / 60;
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
    this.lastFrameAt = this.now();
    this.scheduleNext();
    if (this.deps.appState) {
      this.appStateSub = this.deps.appState.addChangeListener((active) => {
        if (!active) {
          this.pause();
        } else if (this.running) {
          this.lastFrameAt = this.now();
          this.scheduleNext();
        }
      });
    }
  }

  stop(): void {
    this.running = false;
    this.pause();
    this.appStateSub?.remove();
    this.appStateSub = null;
    this.resetWindow();
  }

  dispose(): void {
    this.stop();
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Feeds a synthetic frame timestamp — for tests and Phase 2 native hooks. */
  onFrame(t: number): void {
    if (!this.running) return;
    const delta = t - this.lastFrameAt;
    this.lastFrameAt = t;
    if (delta <= 0) {
      this.scheduleNext();
      return;
    }
    const fps = 1000 / delta;
    this.expectedFrames += 1;
    if (fps < this.dropThreshold) {
      this.droppedFrames += 1;
      if (this.dropStart === null) this.dropStart = t;
      if (fps < this.minFps) this.minFps = fps;
      if (t - this.dropStart >= this.sustainedMs) {
        this.emit(t);
        this.resetWindow();
      }
    } else if (this.dropStart !== null) {
      // Drop window ended without reaching sustainedMs — reset.
      this.resetWindow();
    }
    this.scheduleNext();
  }

  private scheduleNext(): void {
    if (!this.running) return;
    this.handle = this.requestFrame((t) => this.onFrame(t));
  }

  private pause(): void {
    if (this.handle !== null) {
      this.cancelFrame(this.handle);
      this.handle = null;
    }
  }

  private resetWindow(): void {
    this.dropStart = null;
    this.droppedFrames = 0;
    this.expectedFrames = 0;
    this.minFps = Infinity;
  }

  private emit(now: number): void {
    const durationMs = this.dropStart !== null ? now - this.dropStart : 0;
    const averageFps =
      durationMs > 0 && this.expectedFrames > 0
        ? (this.expectedFrames * 1000) / durationMs
        : 0;
    const data: FrameDropEventData = {
      droppedFrames: this.droppedFrames,
      expectedFrames: this.expectedFrames,
      durationMs,
      averageFps,
      minFps: Number.isFinite(this.minFps) ? this.minFps : 0,
    };
    const event: MonitorEvent = {
      type: 'render',
      timestamp: now,
      wallTime: Date.now(),
      sessionId: '',
      data: { frameDrop: data },
    };
    this.deps.signalBus.emit(event);
  }
}
