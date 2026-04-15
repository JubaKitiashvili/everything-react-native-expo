/**
 * Task 53 — VisualReproCollector
 *
 * Captures screenshots on navigation transitions by listening to the
 * SignalBus for navigation events. Uses the ReplayCollector's shared
 * buffer (via a getter) to capture single frames.
 *
 * Ring buffer of 10 screenshots (FIFO), total buffer capped at 2MB.
 * Respects consent.replay. Attaches screenshots to crash events.
 */
import type { Collector, MonitorConfig, MonitorEvent } from '../../types';
import type { SignalBus } from '../../core/SignalBus';
import type { SessionManager } from '../../core/SessionManager';
import type { ErneMonitorNative } from '../../native/ErneMonitorNative';

export interface VisualReproScreenshot {
  /** Base64-encoded JPEG screenshot. */
  readonly frameBase64: string;
  /** The screen name that triggered the capture. */
  readonly screen: string;
  /** Previous screen name or null. */
  readonly previousScreen: string | null;
  /** Capture timestamp in ms since epoch. */
  readonly timestamp: number;
  /** Approximate size in bytes of the base64 data. */
  readonly sizeBytes: number;
}

export interface VisualReproCollectorDeps {
  native: ErneMonitorNative;
  signalBus: SignalBus;
  sessionManager: SessionManager;
  /**
   * Capture a single replay frame and return the base64 data.
   * Typically backed by the ReplayCollector's last frame.
   */
  captureFrame?: () => string | null;
  /**
   * Check if replay consent is granted. Default: always true.
   */
  hasReplayConsent?: () => boolean;
  /**
   * Max screenshots in the ring buffer. Default 10.
   */
  maxScreenshots?: number;
  /**
   * Max total buffer size in bytes. Default 2MB (2_097_152).
   */
  maxBufferBytes?: number;
}

const DEFAULT_MAX_SCREENSHOTS = 10;
const DEFAULT_MAX_BUFFER_BYTES = 2 * 1024 * 1024; // 2MB

/**
 * Estimates the byte size of a base64-encoded string.
 * Base64 encodes 3 bytes into 4 characters, so the decoded
 * size is approximately 3/4 of the string length.
 */
function estimateBase64Bytes(base64: string): number {
  // Each base64 char is 1 byte in the string, but represents 6 bits.
  // Decoded size = length * 3/4 (minus padding).
  // We use string length as a conservative byte estimate since
  // we're measuring the in-memory cost of storing the string.
  return base64.length;
}

export class VisualReproCollector implements Collector {
  readonly name = 'visualRepro';
  readonly priority = 55;

  private readonly deps: VisualReproCollectorDeps;
  private readonly maxScreenshots: number;
  private readonly maxBufferBytes: number;
  private buffer: VisualReproScreenshot[] = [];
  private currentBufferBytes = 0;
  private running = false;
  private unsubscribe: (() => void) | null = null;

  constructor(deps: VisualReproCollectorDeps) {
    this.deps = deps;
    this.maxScreenshots = deps.maxScreenshots ?? DEFAULT_MAX_SCREENSHOTS;
    this.maxBufferBytes = deps.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  init(_config: MonitorConfig): void {}

  start(): void {
    if (this.running) return;
    if (this.deps.hasReplayConsent && !this.deps.hasReplayConsent()) return;

    this.running = true;
    this.buffer = [];
    this.currentBufferBytes = 0;

    // Listen for navigation events on the SignalBus
    this.unsubscribe = this.deps.signalBus.on('navigation', (event) => {
      this.handleNavigationEvent(event);
    });
  }

  stop(): void {
    this.running = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  dispose(): void {
    this.stop();
    this.buffer = [];
    this.currentBufferBytes = 0;
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Returns the current screenshot buffer.
   * Used by CrashCollector and BugReporter to attach visual context.
   */
  getBuffer(): readonly VisualReproScreenshot[] {
    return this.buffer;
  }

  /** Clear the screenshot buffer. */
  clearBuffer(): void {
    this.buffer = [];
    this.currentBufferBytes = 0;
  }

  /** Current total buffer size in bytes. */
  getBufferSizeBytes(): number {
    return this.currentBufferBytes;
  }

  private handleNavigationEvent(event: MonitorEvent): void {
    if (!this.running) return;
    if (!this.deps.captureFrame) return;

    const frame = this.deps.captureFrame();
    if (!frame) return;

    const data = event.data as { screen?: string; previousScreen?: string | null } | undefined;
    const screen = data?.screen ?? 'unknown';
    const previousScreen = data?.previousScreen ?? null;

    const sizeBytes = estimateBase64Bytes(frame);

    const screenshot: VisualReproScreenshot = {
      frameBase64: frame,
      screen,
      previousScreen,
      timestamp: event.timestamp,
      sizeBytes,
    };

    this.addToBuffer(screenshot);

    // Emit tracking event
    const trackingEvent: MonitorEvent = {
      type: 'custom',
      timestamp: event.timestamp,
      wallTime: Date.now(),
      sessionId: this.deps.sessionManager.getCurrentSessionId(),
      data: {
        name: 'visual_repro_capture',
        screen,
        previousScreen,
        bufferCount: this.buffer.length,
        bufferSizeBytes: this.currentBufferBytes,
      },
    };
    this.deps.signalBus.emit(trackingEvent);
  }

  private addToBuffer(screenshot: VisualReproScreenshot): void {
    // Check if adding this screenshot would exceed the byte limit
    // If so, evict oldest screenshots until there's room
    while (
      this.buffer.length > 0 &&
      this.currentBufferBytes + screenshot.sizeBytes > this.maxBufferBytes
    ) {
      this.evictOldest();
    }

    // If a single screenshot exceeds the entire buffer, skip it
    if (screenshot.sizeBytes > this.maxBufferBytes) return;

    this.buffer.push(screenshot);
    this.currentBufferBytes += screenshot.sizeBytes;

    // Enforce max count
    while (this.buffer.length > this.maxScreenshots) {
      this.evictOldest();
    }
  }

  private evictOldest(): void {
    const evicted = this.buffer.shift();
    if (evicted) {
      this.currentBufferBytes -= evicted.sizeBytes;
    }
  }
}
