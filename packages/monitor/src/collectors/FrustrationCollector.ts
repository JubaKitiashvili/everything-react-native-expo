import type { Collector, MonitorConfig, MonitorEvent } from '../types';
import type { SignalBus } from '../core/SignalBus';
import type { TouchEventData } from './TouchBoundaryCollector';
import type { CrashEventData } from './CrashCollector';

export type FrustrationSignal =
  | 'rage-tap'
  | 'dead-tap'
  | 'error-tap';

export type FrustrationLevel = 'low' | 'medium' | 'high';

export interface FrustrationEventData {
  level: FrustrationLevel;
  signals: FrustrationSignal[];
  componentPath: string;
  tapCount: number;
  windowMs: number;
}

export interface FrustrationCollectorDeps {
  signalBus: SignalBus;
  /** Rage-tap threshold — N taps in rageWindowMs on same target. Default 3. */
  rageTapCount?: number;
  /** Rage-tap window in ms. Default 2000. */
  rageWindowMs?: number;
  /** Error-tap window: max ms between tap and crash. Default 1000. */
  errorWindowMs?: number;
  /** Correlation window in ms used to keep tap history. Default 5000. */
  correlationWindowMs?: number;
  /** Optional dead-tap oracle: returns true if target has no handler. */
  isDeadTap?: (componentPath: string) => boolean;
  now?: () => number;
  wallNow?: () => number;
}

interface TapRecord {
  componentPath: string;
  timestamp: number;
  wasDead: boolean;
}

/**
 * FrustrationCollector correlates touch and crash events to detect user
 * frustration patterns:
 *
 *   - rage-tap: `rageTapCount` taps on the same componentPath within
 *     `rageWindowMs`.
 *   - dead-tap: a tap on a target flagged by the host as having no
 *     onPress handler (host provides `isDeadTap`).
 *   - error-tap: a tap followed by a crash within `errorWindowMs`.
 *
 * A frustration event is emitted whenever at least one signal fires.
 * Level is 'low' for 1 signal, 'medium' for 2, 'high' for 3+ (a single
 * emission can carry multiple signals if they overlap in the window).
 */
export class FrustrationCollector implements Collector {
  readonly name = 'frustration';
  readonly priority = 55;

  private readonly deps: FrustrationCollectorDeps;
  private readonly rageTapCount: number;
  private readonly rageWindowMs: number;
  private readonly errorWindowMs: number;
  private readonly correlationWindowMs: number;
  private readonly now: () => number;
  private readonly wallNow: () => number;

  private running = false;
  private unsubCustom: (() => void) | null = null;
  private unsubCrash: (() => void) | null = null;
  private history: TapRecord[] = [];

  constructor(deps: FrustrationCollectorDeps) {
    this.deps = deps;
    this.rageTapCount = deps.rageTapCount ?? 3;
    this.rageWindowMs = deps.rageWindowMs ?? 2000;
    this.errorWindowMs = deps.errorWindowMs ?? 1000;
    this.correlationWindowMs = deps.correlationWindowMs ?? 5000;
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
    if (this.running) return;
    this.running = true;
    this.unsubCustom = this.deps.signalBus.on('custom', (e) =>
      this.onCustom(e),
    );
    this.unsubCrash = this.deps.signalBus.on('crash', (e) => this.onCrash(e));
  }

  stop(): void {
    this.running = false;
    this.unsubCustom?.();
    this.unsubCrash?.();
    this.unsubCustom = null;
    this.unsubCrash = null;
    this.history = [];
  }

  dispose(): void {
    this.stop();
  }

  isRunning(): boolean {
    return this.running;
  }

  private onCustom(event: MonitorEvent): void {
    const data = event.data as { name?: string; attributes?: TouchEventData };
    if (data.name !== 'touch' || !data.attributes) return;
    const now = this.now();
    const tap: TapRecord = {
      componentPath: data.attributes.componentPath,
      timestamp: now,
      wasDead: this.deps.isDeadTap?.(data.attributes.componentPath) ?? false,
    };
    this.history.push(tap);
    this.evict(now);

    const signals: FrustrationSignal[] = [];
    const recentSame = this.history.filter(
      (h) =>
        h.componentPath === tap.componentPath &&
        now - h.timestamp <= this.rageWindowMs,
    );
    if (recentSame.length >= this.rageTapCount) signals.push('rage-tap');
    if (tap.wasDead) signals.push('dead-tap');

    if (signals.length > 0) {
      this.emit(signals, tap.componentPath, recentSame.length);
    }
  }

  private onCrash(event: MonitorEvent): void {
    const now = this.now();
    this.evict(now);
    // Look back for a recent tap; if within errorWindowMs → error-tap.
    const candidate = [...this.history]
      .reverse()
      .find((h) => now - h.timestamp <= this.errorWindowMs);
    if (candidate) {
      const data = event.data as CrashEventData;
      void data; // crash metadata could be embedded in the future
      this.emit(['error-tap'], candidate.componentPath, 1);
    }
  }

  private evict(now: number): void {
    const cutoff = now - this.correlationWindowMs;
    this.history = this.history.filter((h) => h.timestamp >= cutoff);
  }

  private emit(
    signals: FrustrationSignal[],
    componentPath: string,
    tapCount: number,
  ): void {
    const level: FrustrationLevel =
      signals.length >= 3 ? 'high' : signals.length === 2 ? 'medium' : 'low';
    const data: FrustrationEventData = {
      level,
      signals,
      componentPath,
      tapCount,
      windowMs: this.correlationWindowMs,
    };
    const out: MonitorEvent = {
      type: 'custom',
      timestamp: this.now(),
      wallTime: this.wallNow(),
      sessionId: '',
      data: {
        name: 'frustration',
        attributes: data as unknown as Record<string, never>,
      },
    };
    this.deps.signalBus.emit(out);
  }
}
