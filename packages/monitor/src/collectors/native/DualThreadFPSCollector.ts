import type { Collector, MonitorConfig, MonitorEvent } from '../../types';
import type { SignalBus } from '../../core/SignalBus';
import type { SessionManager } from '../../core/SessionManager';
import type { ErneMonitorNative } from '../../native/ErneMonitorNative';
import type { NativeDualThreadFPSReport, NativeSubscription } from '../../native/types';

export interface DualThreadFPSEventData {
  /** UI thread FPS (0-120+). Measured via CADisplayLink/Choreographer. */
  uiFPS: number;
  /** JS thread FPS (0-60). Inferred from main-thread probe completions. */
  jsFPS: number;
  /**
   * Thread attribution for the bottleneck:
   * - 'ui' — UI thread is the bottleneck (GPU/layout bound)
   * - 'js' — JS thread is the bottleneck (long tasks, bridge)
   * - 'both' — both threads are below threshold
   * - 'none' — no bottleneck detected
   */
  bottleneck: 'ui' | 'js' | 'both' | 'none';
}

export interface DualThreadFPSCollectorDeps {
  native: ErneMonitorNative;
  signalBus: SignalBus;
  sessionManager: SessionManager;
  /**
   * FPS below this threshold is considered jank. Default 50.
   * Applied separately to both UI and JS FPS.
   */
  jankThreshold?: number;
}

/**
 * Task 45 — DualThreadFPSCollector
 *
 * Subscribes to the native `onDualThreadFPS` event (emitted every 1s by
 * the platform-specific DualThreadFPS native class) and translates each
 * report into a `frameDrop` monitor event with thread attribution.
 *
 * This collector complements the JS-only FrameDropCollector (Phase 1b)
 * by separating UI and JS thread performance. When the native module is
 * available, this gives much more accurate FPS data since it uses
 * platform APIs (CADisplayLink on iOS, Choreographer on Android) rather
 * than rAF timing.
 */
export class DualThreadFPSCollector implements Collector {
  readonly name = 'dualThreadFPS';
  readonly priority = 41; // just after frameDrop (40)

  private readonly deps: DualThreadFPSCollectorDeps;
  private readonly jankThreshold: number;
  private subscription: NativeSubscription | null = null;
  private running = false;

  constructor(deps: DualThreadFPSCollectorDeps) {
    this.deps = deps;
    this.jankThreshold = deps.jankThreshold ?? 50;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  init(_config: MonitorConfig): void {}

  start(): void {
    if (this.running) return;
    if (!this.deps.native.isAvailable()) return;
    this.running = true;
    this.subscription = this.deps.native.onDualThreadFPS(
      (report: NativeDualThreadFPSReport) => {
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

  private handleReport(report: NativeDualThreadFPSReport): void {
    if (!this.running) return;

    const uiJank = report.uiFPS < this.jankThreshold;
    const jsJank = report.jsFPS < this.jankThreshold;

    let bottleneck: DualThreadFPSEventData['bottleneck'] = 'none';
    if (uiJank && jsJank) bottleneck = 'both';
    else if (jsJank) bottleneck = 'js';
    else if (uiJank) bottleneck = 'ui';

    const data: DualThreadFPSEventData = {
      uiFPS: Math.round(report.uiFPS * 10) / 10,
      jsFPS: Math.round(report.jsFPS * 10) / 10,
      bottleneck,
    };

    const event: MonitorEvent = {
      type: 'render',
      timestamp: report.timestamp,
      wallTime: Date.now(),
      sessionId: this.deps.sessionManager.getCurrentSessionId(),
      data: { dualThreadFPS: data },
    };

    this.deps.signalBus.emit(event);
  }
}
