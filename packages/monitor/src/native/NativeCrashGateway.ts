import type { SignalBus } from '../core/SignalBus';
import type { EventStore } from '../storage/EventStore';
import type { SessionManager } from '../core/SessionManager';
import type { MonitorEvent } from '../types';
import type { CrashEventData } from '../collectors/CrashCollector';
import type { ErneMonitorNative } from './ErneMonitorNative';
import type { NativeCrashReport, NativeSubscription } from './types';

/**
 * Bridges native crash reports captured by the platform module
 * (ErneMonitorModule iOS / Android) into the JS-side SDK.
 *
 * Two delivery paths:
 *
 *   1. **Live native crash** (rare on iOS, possible on Android via NDK)
 *      — the native side raises `onNativeCrash` immediately.
 *      `subscribe()` forwards each event into the SignalBus + EventStore
 *      using the same shape CrashCollector emits, so downstream
 *      processors and the SignalRouter handle them transparently.
 *
 *   2. **Post-mortem replay** — when the SDK boots in a new session,
 *      `replayPersistedCrashes()` calls into the native module, asks
 *      for any persisted crash files left over from the previous
 *      session, dispatches them through the same path, and tells the
 *      module to delete each file once it has been delivered.
 *
 * The gateway is purely a translation layer — no policy, no buffering.
 * That keeps it identical to how CrashCollector delivers JS exceptions
 * and means the rest of the pipeline (Sanitizer, Enricher, Fingerprinter,
 * SignalRouter) needs zero changes to handle native crashes.
 */

export interface NativeCrashGatewayDeps {
  native: ErneMonitorNative;
  signalBus: SignalBus;
  eventStore: EventStore;
  sessionManager: SessionManager;
  /** Monotonic clock for event.timestamp; defaults to performance-style now. */
  now?: () => number;
  /** Wall-clock now(); defaults to Date.now. */
  wallNow?: () => number;
  /**
   * Called when the gateway successfully delivers a persisted crash so
   * the native side can purge the underlying file. Tests use a fake to
   * verify the cleanup contract; the real loader wires this to a method
   * the native module exposes.
   */
  acknowledgePersistedCrash?: (id: string) => void;
  /**
   * Resolves all crash reports that were persisted before the SDK
   * booted (i.e. survived a process death from the previous session).
   * Tests use a fake; the real loader wires this to the native module's
   * `drainPersistedCrashes()` async function.
   */
  drainPersistedCrashes?: () => Promise<readonly PersistedCrash[]>;
}

export interface PersistedCrash {
  /** Stable id used by acknowledgePersistedCrash to delete the file. */
  readonly id: string;
  readonly report: NativeCrashReport;
}

export class NativeCrashGateway {
  private subscription: NativeSubscription | null = null;
  private running = false;
  private readonly now: () => number;
  private readonly wallNow: () => number;
  private deliveredCount = 0;

  constructor(private readonly deps: NativeCrashGatewayDeps) {
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

  getDeliveredCount(): number {
    return this.deliveredCount;
  }

  /**
   * Hooks the live `onNativeCrash` event. Idempotent — calling start
   * twice does not double-subscribe.
   */
  start(): void {
    if (this.running) return;
    this.subscription = this.deps.native.onNativeCrash((report) => {
      this.dispatch(report);
    });
    this.running = true;
  }

  stop(): void {
    if (!this.running) return;
    try {
      this.subscription?.remove();
    } catch {
      // ignore — listener cleanup must never throw
    }
    this.subscription = null;
    this.running = false;
  }

  /**
   * Drains any crash reports that the native module persisted during
   * the previous session and dispatches them through the normal SDK
   * pipeline. Each successfully dispatched report is acknowledged so
   * the native side can delete its on-disk copy.
   *
   * Returns the number of crashes drained. Always swallows errors —
   * the SDK boot path must never fail because the native module
   * misbehaved.
   */
  async replayPersistedCrashes(): Promise<number> {
    const drain = this.deps.drainPersistedCrashes;
    if (!drain) return 0;
    let crashes: readonly PersistedCrash[] = [];
    try {
      crashes = await drain();
    } catch {
      return 0;
    }
    let delivered = 0;
    for (const persisted of crashes) {
      try {
        this.dispatch(persisted.report);
        this.deps.acknowledgePersistedCrash?.(persisted.id);
        delivered += 1;
      } catch {
        // skip — leave the file in place so we can retry next launch
      }
    }
    return delivered;
  }

  private dispatch(report: NativeCrashReport): void {
    const message = formatCrashMessage(report);
    const stack = report.backtrace.length > 0 ? report.backtrace.join('\n') : null;
    const data: CrashEventData = {
      kind: 'exception',
      message,
      stack,
      componentStack: null,
      isFatal: true,
    };
    const event: MonitorEvent = {
      type: 'crash',
      timestamp: this.now(),
      wallTime: this.wallNow(),
      sessionId: this.deps.sessionManager.getCurrentSessionId(),
      data,
    };
    // Native crashes are always fatal — synchronous insert + emit, same
    // path CrashCollector takes for ErrorUtils fatals.
    try {
      this.deps.eventStore.insertSync(event, 'critical');
    } catch {
      // swallow; emit anyway so SignalRouter still sees it
    }
    this.deps.signalBus.emit(event);
    this.deliveredCount += 1;
  }
}

function formatCrashMessage(report: NativeCrashReport): string {
  const parts: string[] = [];
  parts.push(`[native] ${report.signal}`);
  if (report.faultAddress) parts.push(`@ ${report.faultAddress}`);
  if (report.threadName) parts.push(`(${report.threadName})`);
  return parts.join(' ');
}
