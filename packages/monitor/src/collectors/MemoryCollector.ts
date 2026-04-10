import type {
  Collector,
  MemoryInfo,
  MonitorConfig,
  MonitorEvent,
  PlatformBridge,
} from '../types';
import type { SignalBus } from '../core/SignalBus';

export interface MemoryEventData {
  usedBytes: number;
  totalBytes: number;
  usedRatio: number;
  overThreshold: boolean;
}

export interface MemoryCollectorDeps {
  signalBus: SignalBus;
  platformBridge: PlatformBridge;
  /** Sample interval in ms. Default 30_000 (30 seconds). */
  intervalMs?: number;
  /** Warn when usedRatio exceeds this. Default 0.8. */
  warnThreshold?: number;
  /** Scheduler — default setInterval. Tests inject a manual driver. */
  scheduler?: {
    set: (fn: () => void, ms: number) => unknown;
    clear: (handle: unknown) => void;
  };
  appState?: {
    addChangeListener(cb: (active: boolean) => void): { remove(): void };
  };
  now?: () => number;
}

/**
 * MemoryCollector periodically samples PlatformBridge.getMemoryUsage().
 * In Phase 1a the JS bridge returns null, so this collector is largely
 * a scaffold that becomes useful once the Phase 2 native module fills in
 * real memory counters. It still validates the polling + appState
 * pause/resume flow here.
 */
export class MemoryCollector implements Collector {
  readonly name = 'memory';
  readonly priority = 50;

  private readonly deps: MemoryCollectorDeps;
  private readonly intervalMs: number;
  private readonly warnThreshold: number;
  private readonly scheduler: NonNullable<MemoryCollectorDeps['scheduler']>;
  private readonly now: () => number;

  private handle: unknown = null;
  private running = false;
  private appStateSub: { remove(): void } | null = null;

  constructor(deps: MemoryCollectorDeps) {
    this.deps = deps;
    this.intervalMs = deps.intervalMs ?? 30_000;
    this.warnThreshold = deps.warnThreshold ?? 0.8;
    this.scheduler =
      deps.scheduler ??
      ({
        set: (fn, ms) => setInterval(fn, ms),
        clear: (h) => clearInterval(h as ReturnType<typeof setInterval>),
      } as NonNullable<MemoryCollectorDeps['scheduler']>);
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
    this.resume();
    if (this.deps.appState) {
      this.appStateSub = this.deps.appState.addChangeListener((active) => {
        if (active) this.resume();
        else this.pause();
      });
    }
  }

  stop(): void {
    this.running = false;
    this.pause();
    this.appStateSub?.remove();
    this.appStateSub = null;
  }

  dispose(): void {
    this.stop();
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Synthetic tick for tests. */
  sample(): void {
    const info = this.deps.platformBridge.getMemoryUsage();
    if (!info) return;
    this.emit(info);
  }

  private resume(): void {
    if (this.handle !== null || !this.running) return;
    this.handle = this.scheduler.set(() => this.sample(), this.intervalMs);
  }

  private pause(): void {
    if (this.handle !== null) {
      this.scheduler.clear(this.handle);
      this.handle = null;
    }
  }

  private emit(info: MemoryInfo): void {
    const usedRatio =
      info.totalBytes > 0 ? info.usedBytes / info.totalBytes : 0;
    const data: MemoryEventData = {
      usedBytes: info.usedBytes,
      totalBytes: info.totalBytes,
      usedRatio,
      overThreshold: usedRatio > this.warnThreshold,
    };
    const event: MonitorEvent = {
      type: 'custom',
      timestamp: this.now(),
      wallTime: Date.now(),
      sessionId: '',
      data: { name: 'memory', attributes: data as unknown as Record<string, never> },
    };
    this.deps.signalBus.emit(event);
  }
}
