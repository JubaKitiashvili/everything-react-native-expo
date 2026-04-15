import type { Collector, MonitorConfig, MonitorEvent } from '../../types';
import type { SignalBus } from '../../core/SignalBus';
import type { SessionManager } from '../../core/SessionManager';
import type { ErneMonitorNative } from '../../native/ErneMonitorNative';
import type { NativeReplayFrame, NativeSubscription } from '../../native/types';
import type { ReplayMasker, ReplayMaskRegion, ViewInfo } from '../../processors/ReplayMasker';

export interface ReplayFrame {
  /** Base64-encoded JPEG screenshot (half resolution, quality 0.3). */
  readonly frameBase64: string;
  /** Touch events recorded since the previous frame. */
  readonly touchEvents: readonly {
    readonly x: number;
    readonly y: number;
    readonly phase: string;
    readonly timestamp: number;
  }[];
  /** Capture timestamp in ms since epoch. */
  readonly timestamp: number;
}

export interface ReplayCollectorDeps {
  native: ErneMonitorNative;
  signalBus: SignalBus;
  sessionManager: SessionManager;
  masker: ReplayMasker;
  /**
   * Capture interval in milliseconds. Default 1000 (1fps).
   * Clamped to [200, 5000] (max 5fps, min once per 5s).
   */
  captureIntervalMs?: number;
  /**
   * Maximum replay buffer duration in seconds. Default 30.
   * Frames beyond this are evicted FIFO.
   */
  maxBufferSeconds?: number;
  /**
   * Optional callback to collect current visible views for mask
   * region computation. Called once at start and whenever masks
   * need refreshing.
   */
  getVisibleViews?: () => readonly ViewInfo[];
  /**
   * Check if replay consent is granted. Called at start().
   * Default: always true (caller should check ConsentGate).
   */
  hasReplayConsent?: () => boolean;
}

/**
 * Task 47 — ReplayCollector
 *
 * Manages session replay capture: starts/stops the native capture engine,
 * maintains a ring buffer of frames, records touch events, and applies
 * PII masking via ReplayMasker.
 *
 * The buffer is stored in JS (not native) so it can be attached to
 * crash reports or bug reports by other collectors.
 */
export class ReplayCollector implements Collector {
  readonly name = 'replay';
  readonly priority = 50;

  private readonly deps: ReplayCollectorDeps;
  private readonly captureIntervalMs: number;
  private readonly maxFrames: number;
  private subscription: NativeSubscription | null = null;
  private running = false;
  private buffer: ReplayFrame[] = [];

  constructor(deps: ReplayCollectorDeps) {
    this.deps = deps;
    this.captureIntervalMs = Math.max(200, Math.min(5000, deps.captureIntervalMs ?? 1000));
    const maxSeconds = deps.maxBufferSeconds ?? 30;
    this.maxFrames = Math.ceil((maxSeconds * 1000) / this.captureIntervalMs);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  init(_config: MonitorConfig): void {}

  start(): void {
    if (this.running) return;
    if (!this.deps.native.isAvailable()) return;
    if (this.deps.hasReplayConsent && !this.deps.hasReplayConsent()) return;

    this.running = true;
    this.buffer = [];

    // Compute initial mask regions
    const maskRegions = this.computeMaskRegions();

    // Start native capture
    this.deps.native.startReplayCapture(
      this.captureIntervalMs,
      maskRegions.map((r) => ({
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
      })),
    );

    // Subscribe to frames
    this.subscription = this.deps.native.onReplayFrame(
      (frame: NativeReplayFrame) => {
        this.handleFrame(frame);
      },
    );
  }

  stop(): void {
    this.running = false;
    this.deps.native.stopReplayCapture();
    this.subscription?.remove();
    this.subscription = null;
  }

  dispose(): void {
    this.stop();
    this.buffer = [];
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Returns the current replay buffer (last N seconds of frames).
   * Used by BugReporter and crash handlers to attach replay data.
   */
  getBuffer(): readonly ReplayFrame[] {
    return this.buffer;
  }

  /** Clear the replay buffer. */
  clearBuffer(): void {
    this.buffer = [];
  }

  /** Record a touch event from JS (forwarded to native). */
  recordTouch(x: number, y: number, phase: string): void {
    if (!this.running) return;
    this.deps.native.recordReplayTouch(x, y, phase);
  }

  /** Update mask regions (e.g., on navigation). */
  refreshMasks(): void {
    if (!this.running) return;
    const maskRegions = this.computeMaskRegions();
    this.deps.native.updateReplayMaskRegions(
      maskRegions.map((r) => ({
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
      })),
    );
  }

  private handleFrame(frame: NativeReplayFrame): void {
    if (!this.running) return;

    const replayFrame: ReplayFrame = {
      frameBase64: frame.frameBase64,
      touchEvents: frame.touchEvents,
      timestamp: frame.timestamp,
    };

    this.buffer.push(replayFrame);

    // Ring buffer eviction
    while (this.buffer.length > this.maxFrames) {
      this.buffer.shift();
    }

    // Emit as a monitor event for the pipeline
    const event: MonitorEvent = {
      type: 'custom',
      timestamp: frame.timestamp,
      wallTime: Date.now(),
      sessionId: this.deps.sessionManager.getCurrentSessionId(),
      data: {
        name: 'replay_frame',
        frameCount: this.buffer.length,
        maxFrames: this.maxFrames,
      },
    };
    this.deps.signalBus.emit(event);
  }

  private computeMaskRegions(): readonly ReplayMaskRegion[] {
    if (!this.deps.getVisibleViews) return [];
    const views = this.deps.getVisibleViews();
    return this.deps.masker.computeMaskRegions(views);
  }
}
