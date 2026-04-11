import type { Collector, MonitorConfig, MonitorEvent } from '../types';
import type { SignalBus } from '../core/SignalBus';

export interface SuspenseEventData {
  boundaryName: string;
  fallbackDurationMs: number;
  depth: number;
  outcome: 'resolved' | 'error';
  errorMessage?: string;
}

export interface SuspenseCollectorDeps {
  signalBus: SignalBus;
  /** Warn threshold — fallback shown this long is flagged. Default 3000ms. */
  slowThresholdMs?: number;
  now?: () => number;
  wallNow?: () => number;
}

interface ActiveFallback {
  boundaryName: string;
  startedAt: number;
  depth: number;
}

/**
 * SuspenseCollector records how long Suspense fallbacks are displayed.
 * It tracks active fallbacks through `fallbackStart` / `fallbackEnd`
 * calls wired to a `<MonitoredSuspense>` wrapper (emitted by the Babel
 * plugin or used manually). Depth is incremented for nested boundaries
 * so telemetry can surface deep-nesting regressions.
 */
export class SuspenseCollector implements Collector {
  readonly name = 'suspense';
  readonly priority = 65;

  private readonly deps: SuspenseCollectorDeps;
  private readonly slowThresholdMs: number;
  private readonly now: () => number;
  private readonly wallNow: () => number;

  private running = false;
  private active = new Map<string, ActiveFallback>();
  private depth = 0;

  constructor(deps: SuspenseCollectorDeps) {
    this.deps = deps;
    this.slowThresholdMs = deps.slowThresholdMs ?? 3000;
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
    this.active.clear();
    this.depth = 0;
  }

  dispose(): void {
    this.stop();
  }

  isRunning(): boolean {
    return this.running;
  }

  fallbackStart(boundaryName: string, id: string = boundaryName): void {
    if (!this.running) return;
    this.depth += 1;
    this.active.set(id, {
      boundaryName,
      startedAt: this.now(),
      depth: this.depth,
    });
  }

  fallbackEnd(
    id: string,
    outcome: SuspenseEventData['outcome'] = 'resolved',
    errorMessage?: string,
  ): void {
    if (!this.running) return;
    const entry = this.active.get(id);
    if (!entry) return;
    this.active.delete(id);
    this.depth = Math.max(0, this.depth - 1);
    const duration = this.now() - entry.startedAt;
    const data: SuspenseEventData = {
      boundaryName: entry.boundaryName,
      fallbackDurationMs: duration,
      depth: entry.depth,
      outcome,
      ...(errorMessage ? { errorMessage } : {}),
    };
    const event: MonitorEvent = {
      type: 'custom',
      timestamp: this.now(),
      wallTime: this.wallNow(),
      sessionId: '',
      data: {
        name: 'suspense',
        attributes: data as unknown as Record<string, never>,
      },
    };
    this.deps.signalBus.emit(event);
  }

  /** True if the given boundary is currently showing a fallback. */
  isPending(id: string): boolean {
    return this.active.has(id);
  }

  /** Warn threshold getter — host components can check it for UI hints. */
  getSlowThreshold(): number {
    return this.slowThresholdMs;
  }
}
