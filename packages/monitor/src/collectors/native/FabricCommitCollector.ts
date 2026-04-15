import type { Collector, MonitorConfig, MonitorEvent } from '../../types';
import type { SignalBus } from '../../core/SignalBus';
import type { SessionManager } from '../../core/SessionManager';
import type { ErneMonitorNative } from '../../native/ErneMonitorNative';
import type { NativeFabricCommitReport, NativeSubscription } from '../../native/types';

export interface FabricCommitEventData {
  /** Number of native rendering commits in the report window (2s). */
  commitCount: number;
  /** Average time per commit in milliseconds. */
  avgCommitDuration: number;
  /** Maximum single-commit duration in milliseconds. */
  maxCommitDuration: number;
  /** Cumulative Yoga/layout time in milliseconds. */
  yogaLayoutTime: number;
  /** True if layout thrashing detected (>10 commits/sec for >2s). */
  isLayoutThrashing: boolean;
}

export interface FabricCommitCollectorDeps {
  native: ErneMonitorNative;
  signalBus: SignalBus;
  sessionManager: SessionManager;
}

/**
 * Task 46 — FabricCommitCollector
 *
 * Subscribes to the native `onFabricCommit` event (emitted every 2s)
 * and translates each report into a `render` monitor event with commit
 * statistics. Detects layout thrashing and emits high-severity events
 * when sustained excessive commits are observed.
 *
 * Graceful no-op when the native module is absent.
 */
export class FabricCommitCollector implements Collector {
  readonly name = 'fabricCommit';
  readonly priority = 42;

  private readonly deps: FabricCommitCollectorDeps;
  private subscription: NativeSubscription | null = null;
  private running = false;

  constructor(deps: FabricCommitCollectorDeps) {
    this.deps = deps;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  init(_config: MonitorConfig): void {}

  start(): void {
    if (this.running) return;
    if (!this.deps.native.isAvailable()) return;
    this.running = true;
    this.subscription = this.deps.native.onFabricCommit(
      (report: NativeFabricCommitReport) => {
        this.handleReport(report);
      },
    );
  }

  stop(): void {
    this.running = false;
    this.subscription?.remove();
    this.subscription = null;
  }

  dispose(): void {
    this.stop();
  }

  isRunning(): boolean {
    return this.running;
  }

  private handleReport(report: NativeFabricCommitReport): void {
    if (!this.running) return;

    const data: FabricCommitEventData = {
      commitCount: report.commitCount,
      avgCommitDuration: Math.round(report.avgCommitDuration * 100) / 100,
      maxCommitDuration: Math.round(report.maxCommitDuration * 100) / 100,
      yogaLayoutTime: Math.round(report.yogaLayoutTime * 100) / 100,
      isLayoutThrashing: report.isLayoutThrashing,
    };

    const event: MonitorEvent = {
      type: 'render',
      timestamp: report.timestamp,
      wallTime: Date.now(),
      sessionId: this.deps.sessionManager.getCurrentSessionId(),
      data: { fabricCommit: data },
    };

    this.deps.signalBus.emit(event);
  }
}
