/**
 * Task 65 — On-Device ML Anomaly Detection
 *
 * Runs every 10s. Input: FPS history (60s), memory trend, network error rate,
 * render count. Output: anomaly score (0-1) + type. Uses injectable model
 * interface. Threshold 0.8. Fallback to rule-based when model unavailable.
 * Emits to SignalBus.
 */

import type { SignalBus } from '../core/SignalBus';
import type { MonitorEvent } from '../types';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type AnomalyType =
  | 'fps_degradation'
  | 'memory_leak'
  | 'network_failure_spike'
  | 'render_storm'
  | 'compound';

export interface AnomalyResult {
  readonly score: number;
  readonly type: AnomalyType;
  readonly details: Record<string, unknown>;
}

export interface AnomalyInput {
  readonly fpsHistory: readonly number[]; // last 60s of FPS samples
  readonly memoryTrend: readonly number[]; // memory usage bytes over time
  readonly networkErrorRate: number; // 0-1
  readonly renderCount: number; // renders in last interval
}

export interface AnomalyModel {
  readonly isReady: boolean;
  predict(input: AnomalyInput): Promise<AnomalyResult>;
}

export interface AnomalyDetectorDeps {
  signalBus: SignalBus;
  model?: AnomalyModel;
  /** Interval in ms. Default 10000. */
  intervalMs?: number;
  /** Anomaly threshold. Default 0.8. */
  threshold?: number;
  /** Data provider — return current telemetry snapshot. */
  getInput: () => AnomalyInput;
  /** Timer for tests. */
  scheduler?: {
    set: (fn: () => void, ms: number) => unknown;
    clear: (handle: unknown) => void;
  };
  /** Clock. */
  now?: () => number;
}

// ────────────────────────────────────────────────────────────
// Rule-based fallback
// ────────────────────────────────────────────────────────────

function ruleBased(input: AnomalyInput): AnomalyResult {
  const scores: { score: number; type: AnomalyType }[] = [];

  // FPS degradation: avg FPS below 45
  if (input.fpsHistory.length > 0) {
    const avgFps =
      input.fpsHistory.reduce((a, b) => a + b, 0) / input.fpsHistory.length;
    if (avgFps < 45) {
      scores.push({
        score: Math.min(1, (45 - avgFps) / 30),
        type: 'fps_degradation',
      });
    }
  }

  // Memory leak: consistently increasing trend
  if (input.memoryTrend.length >= 3) {
    let increasing = 0;
    for (let i = 1; i < input.memoryTrend.length; i++) {
      if ((input.memoryTrend[i] ?? 0) > (input.memoryTrend[i - 1] ?? 0)) increasing++;
    }
    const ratio = increasing / (input.memoryTrend.length - 1);
    if (ratio > 0.8) {
      scores.push({ score: ratio, type: 'memory_leak' });
    }
  }

  // Network failure spike
  if (input.networkErrorRate > 0.3) {
    scores.push({
      score: Math.min(1, input.networkErrorRate * 1.2),
      type: 'network_failure_spike',
    });
  }

  // Render storm
  if (input.renderCount > 50) {
    scores.push({
      score: Math.min(1, input.renderCount / 100),
      type: 'render_storm',
    });
  }

  if (scores.length === 0) {
    return { score: 0, type: 'compound', details: {} };
  }

  // If multiple anomalies, combine as compound
  if (scores.length > 1) {
    const maxScore = Math.max(...scores.map((s) => s.score));
    return {
      score: Math.min(1, maxScore + 0.1 * (scores.length - 1)),
      type: 'compound',
      details: {
        components: scores.map((s) => ({ type: s.type, score: s.score })),
      },
    };
  }

  const best = scores[0]!;
  return { score: best.score, type: best.type, details: {} };
}

// ────────────────────────────────────────────────────────────
// AnomalyDetector
// ────────────────────────────────────────────────────────────

export class AnomalyDetector {
  private readonly deps: AnomalyDetectorDeps;
  private readonly intervalMs: number;
  private readonly threshold: number;
  private readonly scheduler: NonNullable<AnomalyDetectorDeps['scheduler']>;
  private readonly now: () => number;
  private timerHandle: unknown = null;
  private running = false;
  private lastResult: AnomalyResult | null = null;

  constructor(deps: AnomalyDetectorDeps) {
    this.deps = deps;
    this.intervalMs = deps.intervalMs ?? 10_000;
    this.threshold = deps.threshold ?? 0.8;
    this.scheduler = deps.scheduler ?? {
      set: (fn, ms) => setInterval(fn, ms),
      clear: (h) => clearInterval(h as ReturnType<typeof setInterval>),
    };
    this.now = deps.now ?? Date.now;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timerHandle = this.scheduler.set(() => {
      void this.detect();
    }, this.intervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.timerHandle !== null) {
      this.scheduler.clear(this.timerHandle);
      this.timerHandle = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  getLastResult(): AnomalyResult | null {
    return this.lastResult;
  }

  /** Run one detection cycle. Exposed for testing. */
  async detect(): Promise<AnomalyResult> {
    const input = this.deps.getInput();
    let result: AnomalyResult;

    if (this.deps.model?.isReady) {
      try {
        result = await this.deps.model.predict(input);
      } catch {
        // Model failed — fall back to rules
        result = ruleBased(input);
      }
    } else {
      result = ruleBased(input);
    }

    this.lastResult = result;

    if (result.score >= this.threshold) {
      const event: MonitorEvent = {
        type: 'custom',
        timestamp: this.now(),
        wallTime: this.now(),
        sessionId: '',
        data: {
          name: 'anomaly',
          attributes: {
            score: result.score,
            anomalyType: result.type,
            ...result.details,
          },
        },
      };
      this.deps.signalBus.emit(event);
    }

    return result;
  }
}
