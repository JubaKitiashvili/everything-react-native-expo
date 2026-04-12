import type { SignalBus } from '../core/SignalBus';
import type { SessionManager } from '../core/SessionManager';
import type { MonitorEvent } from '../types';
import type { ErneMonitorNative } from './ErneMonitorNative';
import type {
  NativeMetricsSnapshot,
  NativeSubscription,
  ThermalState,
} from './types';

/**
 * Periodically samples native metrics (CPU, memory, thermal, battery)
 * and feeds them into the SDK pipeline as `custom` events tagged
 * `native_metrics`. Also subscribes to `onThermalStateChange` so we
 * react instantly when thermal pressure changes — those events become
 * `custom` events tagged `native_thermal`.
 *
 * Behavior in absence of a native module:
 *   - poll() returns the UNKNOWN_NATIVE_METRICS sentinel.
 *   - start()/stop() are silent no-ops.
 *
 * Both the periodic snapshot and the thermal change use `custom`
 * events instead of a new event type so the existing pipeline
 * (Sanitizer → Enricher → Sampler → SignalRouter) handles them with
 * zero changes — the SignalRouter's pattern library can match against
 * the `name` attribute.
 */
export interface NativeMetricsPollerDeps {
  native: ErneMonitorNative;
  signalBus: SignalBus;
  sessionManager: SessionManager;
  /** Polling interval in ms; defaults to 10s. Pass <=0 to disable polling. */
  intervalMs?: number;
  now?: () => number;
  wallNow?: () => number;
  /** DI for tests — defaults to globalThis.setInterval/clearInterval. */
  setInterval?: (cb: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

export class NativeMetricsPoller {
  private subscription: NativeSubscription | null = null;
  private timer: unknown = null;
  private running = false;
  private snapshotCount = 0;
  private thermalCount = 0;
  private lastSnapshot: NativeMetricsSnapshot | null = null;
  private lastThermal: ThermalState | null = null;
  private readonly intervalMs: number;
  private readonly now: () => number;
  private readonly wallNow: () => number;
  private readonly setIntervalImpl: (cb: () => void, ms: number) => unknown;
  private readonly clearIntervalImpl: (handle: unknown) => void;

  constructor(private readonly deps: NativeMetricsPollerDeps) {
    this.intervalMs = deps.intervalMs ?? 10_000;
    this.now =
      deps.now ??
      (() =>
        typeof performance !== 'undefined' &&
        typeof performance.now === 'function'
          ? performance.now()
          : Date.now());
    this.wallNow = deps.wallNow ?? Date.now;
    this.setIntervalImpl =
      deps.setInterval ??
      ((cb, ms) =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        (globalThis as unknown as { setInterval: (cb: () => void, ms: number) => unknown }).setInterval(cb, ms));
    this.clearIntervalImpl =
      deps.clearInterval ??
      ((handle) =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        (globalThis as unknown as { clearInterval: (handle: unknown) => void }).clearInterval(handle));
  }

  isRunning(): boolean {
    return this.running;
  }

  getSnapshotCount(): number {
    return this.snapshotCount;
  }

  getThermalCount(): number {
    return this.thermalCount;
  }

  getLastSnapshot(): NativeMetricsSnapshot | null {
    return this.lastSnapshot;
  }

  getLastThermal(): ThermalState | null {
    return this.lastThermal;
  }

  start(): void {
    if (this.running) return;
    // Skip everything when the native module isn't linked. Without
    // it `pollOnce` would publish a stream of "all-null" snapshots
    // that pollute the SDK pipeline (and break tests that count
    // tracked events). Tests inject a fake module to opt back in.
    if (!this.deps.native.isAvailable()) {
      this.running = true;
      return;
    }
    this.subscription = this.deps.native.onThermalStateChange((event) => {
      this.dispatchThermal(event.state);
    });
    if (this.intervalMs > 0) {
      this.timer = this.setIntervalImpl(() => this.pollOnce(), this.intervalMs);
      // Fire one immediately so the dashboard sees a snapshot at boot.
      this.pollOnce();
    }
    this.running = true;
  }

  stop(): void {
    if (!this.running) return;
    if (this.timer !== null) {
      try {
        this.clearIntervalImpl(this.timer);
      } catch {
        // ignore
      }
      this.timer = null;
    }
    try {
      this.subscription?.remove();
    } catch {
      // ignore
    }
    this.subscription = null;
    this.running = false;
  }

  /** Force an immediate sample — exposed for tests and on-demand checks. */
  pollOnce(): void {
    const snap = this.deps.native.getNativeMetrics();
    this.lastSnapshot = snap;
    const event: MonitorEvent = {
      type: 'custom',
      timestamp: this.now(),
      wallTime: this.wallNow(),
      sessionId: this.deps.sessionManager.getCurrentSessionId(),
      data: {
        name: 'native_metrics',
        attributes: {
          cpuUsagePercent: snap.cpuUsagePercent ?? 0,
          memoryUsedBytes: snap.memoryUsedBytes ?? 0,
          memoryAvailableBytes: snap.memoryAvailableBytes ?? 0,
          memoryTotalBytes: snap.memoryTotalBytes ?? 0,
          thermalState: snap.thermalState,
          batteryLevel: snap.batteryLevel ?? -1,
          batteryCharging: snap.batteryCharging ?? false,
          diskAvailableBytes: snap.diskAvailableBytes ?? 0,
          diskTotalBytes: snap.diskTotalBytes ?? 0,
        },
        snapshot: snap,
      },
    };
    this.deps.signalBus.emit(event);
    this.snapshotCount += 1;
  }

  private dispatchThermal(state: ThermalState): void {
    if (state === this.lastThermal) return;
    this.lastThermal = state;
    const event: MonitorEvent = {
      type: 'custom',
      timestamp: this.now(),
      wallTime: this.wallNow(),
      sessionId: this.deps.sessionManager.getCurrentSessionId(),
      data: {
        name: 'native_thermal',
        attributes: { state },
      },
    };
    this.deps.signalBus.emit(event);
    this.thermalCount += 1;
  }
}
