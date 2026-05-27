/**
 * Task 117.21 — ShakeDetector
 *
 * Turns a stream of accelerometer samples into "shake" events, which the
 * BugReporter consumes via its `onShakeDetected` hook to let a user shake the
 * device to file a bug report. The raw accelerometer belongs to the platform
 * (e.g. expo-sensors `Accelerometer.addListener`) — the consumer wires it in
 * as an `AccelerometerSource`, so this class is the PURE detection layer,
 * fully unit-testable by feeding synthetic samples (no device needed).
 *
 * Detection: a "spike" is a sample whose magnitude (in g; gravity ≈ 1) exceeds
 * `threshold`. A shake fires when `requiredSpikes` spikes occur within
 * `windowMs`, after which a `cooldownMs` quiet period prevents repeat fires.
 * Spikes closer together than `minSpikeGapMs` count once (one jolt = one spike).
 *
 * The on-device screenshot *annotation canvas* that accompanies shake-to-report
 * is RN/Skia rendering and is intentionally out of this module — it can't be
 * verified headlessly. See the bug-report flow (BugReporter + BugReportChannel).
 */

export interface AccelerometerSample {
  x: number;
  y: number;
  z: number;
}

export interface AccelerometerSubscription {
  remove(): void;
}

/** Injectable accelerometer. A real impl wraps expo-sensors / a native module. */
export interface AccelerometerSource {
  subscribe(listener: (sample: AccelerometerSample) => void): AccelerometerSubscription;
}

export interface ShakeDetectorOptions {
  source: AccelerometerSource;
  /** Magnitude (g) above which a sample is a spike. Default 1.8 (≈ strong shake). */
  threshold?: number;
  /** Spikes needed within `windowMs` to register a shake. Default 3. */
  requiredSpikes?: number;
  /** Rolling window for counting spikes (ms). Default 1000. */
  windowMs?: number;
  /** Quiet period after a shake before another can fire (ms). Default 2000. */
  cooldownMs?: number;
  /** Min gap between counted spikes (ms) — debounces a single jolt. Default 100. */
  minSpikeGapMs?: number;
  /** Clock injection for tests. */
  now?: () => number;
}

type ShakeHandler = () => void;

export class ShakeDetector {
  private readonly source: AccelerometerSource;
  private readonly threshold: number;
  private readonly requiredSpikes: number;
  private readonly windowMs: number;
  private readonly cooldownMs: number;
  private readonly minSpikeGapMs: number;
  private readonly now: () => number;

  private readonly handlers = new Set<ShakeHandler>();
  private subscription: AccelerometerSubscription | null = null;
  private spikeTimes: number[] = [];
  private lastSpikeAt = -Infinity;
  private lastShakeAt = -Infinity;

  constructor(options: ShakeDetectorOptions) {
    this.source = options.source;
    this.threshold = options.threshold ?? 1.8;
    this.requiredSpikes = Math.max(1, options.requiredSpikes ?? 3);
    this.windowMs = Math.max(1, options.windowMs ?? 1000);
    this.cooldownMs = Math.max(0, options.cooldownMs ?? 2000);
    this.minSpikeGapMs = Math.max(0, options.minSpikeGapMs ?? 100);
    this.now = options.now ?? Date.now;
  }

  /**
   * Register a shake handler in the shape BugReporter's `onShakeDetected`
   * expects: returns a subscription with `remove()`.
   */
  onShake(handler: ShakeHandler): AccelerometerSubscription {
    this.handlers.add(handler);
    return { remove: () => this.handlers.delete(handler) };
  }

  /** Subscribe to the accelerometer + begin detecting. Idempotent. */
  start(): void {
    if (this.subscription) return;
    this.spikeTimes = [];
    this.lastSpikeAt = -Infinity;
    this.subscription = this.source.subscribe((sample) => this.onSample(sample));
  }

  /** Stop detecting + unsubscribe. Idempotent. */
  stop(): void {
    if (!this.subscription) return;
    this.subscription.remove();
    this.subscription = null;
    this.spikeTimes = [];
  }

  isRunning(): boolean {
    return this.subscription !== null;
  }

  /** Process one accelerometer sample (also the unit-test entry point). */
  onSample(sample: AccelerometerSample): void {
    const magnitude = Math.sqrt(sample.x * sample.x + sample.y * sample.y + sample.z * sample.z);
    if (magnitude < this.threshold) return;

    const t = this.now();
    if (t - this.lastSpikeAt < this.minSpikeGapMs) return; // one jolt = one spike
    this.lastSpikeAt = t;

    // Keep only spikes inside the rolling window.
    this.spikeTimes.push(t);
    const cutoff = t - this.windowMs;
    this.spikeTimes = this.spikeTimes.filter((time) => time >= cutoff);

    if (this.spikeTimes.length < this.requiredSpikes) return;
    if (t - this.lastShakeAt < this.cooldownMs) return; // in cooldown

    this.lastShakeAt = t;
    this.spikeTimes = [];
    this.fire();
  }

  private fire(): void {
    for (const handler of this.handlers) {
      try {
        handler();
      } catch {
        // A misbehaving handler must not break detection.
      }
    }
  }
}
