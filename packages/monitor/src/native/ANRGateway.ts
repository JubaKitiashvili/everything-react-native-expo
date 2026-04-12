import type { SignalBus } from '../core/SignalBus';
import type { EventStore } from '../storage/EventStore';
import type { SessionManager } from '../core/SessionManager';
import type { MonitorEvent } from '../types';
import type { ErneMonitorNative } from './ErneMonitorNative';
import type { NativeANRReport, NativeSubscription } from './types';

/**
 * Bridges native ANR (Application Not Responding) reports from
 * ErneMonitorModule into the JS-side SDK.
 *
 * Native side (Tasks 41 iOS/Android) maintains a watchdog thread that
 * pings the main thread once per second. When the main thread fails to
 * respond within the configured threshold (5s by default), it captures
 * the main thread stack and emits an `onANRDetected` event with
 * `{ durationMs, mainThreadStack, screen, timestamp }`.
 *
 * The gateway is intentionally a translation layer with no policy:
 * each ANR turns into a custom MonitorEvent that flows through the
 * normal pipeline (Sanitizer → Enricher → Sampler → SignalRouter).
 * Downstream the SignalRouter's pattern library treats ANR signals
 * as high-confidence performance regressions.
 *
 * ANR events are NOT marked fatal — the app may still recover. We
 * persist them via the regular `insert` (high priority) path.
 */
export interface ANRGatewayDeps {
  native: ErneMonitorNative;
  signalBus: SignalBus;
  eventStore: EventStore;
  sessionManager: SessionManager;
  now?: () => number;
  wallNow?: () => number;
}

export interface ANRDispatchData {
  readonly kind: 'anr';
  readonly durationMs: number;
  readonly mainThreadStack: string | null;
  readonly screen: string | null;
}

export class ANRGateway {
  private subscription: NativeSubscription | null = null;
  private running = false;
  private dispatchedCount = 0;
  private readonly now: () => number;
  private readonly wallNow: () => number;

  constructor(private readonly deps: ANRGatewayDeps) {
    this.now =
      deps.now ??
      (() =>
        typeof performance !== 'undefined' &&
        typeof performance.now === 'function'
          ? performance.now()
          : Date.now());
    this.wallNow = deps.wallNow ?? Date.now;
  }

  isRunning(): boolean {
    return this.running;
  }

  getDispatchedCount(): number {
    return this.dispatchedCount;
  }

  start(): void {
    if (this.running) return;
    this.subscription = this.deps.native.onANRDetected((report) => {
      this.dispatch(report);
    });
    this.running = true;
  }

  stop(): void {
    if (!this.running) return;
    try {
      this.subscription?.remove();
    } catch {
      // ignore
    }
    this.subscription = null;
    this.running = false;
  }

  private dispatch(report: NativeANRReport): void {
    const data: ANRDispatchData = {
      kind: 'anr',
      durationMs: report.durationMs,
      mainThreadStack:
        report.mainThreadStack.length > 0
          ? report.mainThreadStack.join('\n')
          : null,
      screen: report.screen,
    };
    const event: MonitorEvent = {
      type: 'custom',
      timestamp: this.now(),
      wallTime: this.wallNow(),
      sessionId: this.deps.sessionManager.getCurrentSessionId(),
      data: {
        name: 'native_anr',
        attributes: {
          durationMs: data.durationMs,
          screen: data.screen ?? 'unknown',
          stackHead: report.mainThreadStack[0] ?? 'unknown',
        },
        // Carry the full payload for the SignalRouter to inspect.
        anr: data,
      },
    };
    void this.deps.eventStore.insert(event, 'high').catch(() => {
      // swallow — emit anyway so SignalRouter still sees it
    });
    this.deps.signalBus.emit(event);
    this.dispatchedCount += 1;
  }
}
