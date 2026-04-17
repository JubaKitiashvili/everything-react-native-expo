import type { MonitorConfig, MonitorEvent } from '../types';

export interface BatteryInfo {
  level: number; // 0..1
  isCharging: boolean;
}

export interface AdaptiveSamplerDeps {
  config: MonitorConfig;
  /** Returns true if the host is under high CPU pressure. Optional. */
  isCpuHigh?: () => boolean;
  /** Returns battery info for adaptive degradation. Optional. */
  getBattery?: () => BatteryInfo | null;
  /**
   * Deterministic hash function — takes a session id + event type and
   * returns a number in [0, 1). Defaults to a simple djb2 hash.
   */
  sessionHash?: (sessionId: string, type: string) => number;
  /** Override isDev detection. */
  isDev?: boolean;
}

/**
 * Event types that bypass sampling entirely. Safety crashes/ANRs must always
 * reach the pipeline even at rate 0.
 */
const CRITICAL_TYPES: ReadonlySet<string> = new Set<string>([
  'crash',
  'native_anr',
]);

function defaultHash(sessionId: string, type: string): number {
  let h = 5381;
  const input = `${sessionId}:${type}`;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  return (h % 10_000) / 10_000;
}

function detectDev(): boolean {
  const g = globalThis as { __DEV__?: unknown };
  if (typeof g.__DEV__ === 'boolean') return g.__DEV__;
  if (typeof process !== 'undefined' && process.env?.NODE_ENV) {
    return process.env.NODE_ENV !== 'production';
  }
  return false;
}

/**
 * AdaptiveSampler decides whether an event should be kept or dropped.
 * Sampling is deterministic per (sessionId, eventType) so a given session
 * either sees all of a category or none — no flickering in dashboards.
 * Battery and CPU pressure degrade the effective rate but never touch
 * crash events, which always pass through.
 */
export class AdaptiveSampler {
  private readonly deps: AdaptiveSamplerDeps;
  private readonly isDev: boolean;

  constructor(deps: AdaptiveSamplerDeps) {
    this.deps = deps;
    this.isDev = deps.isDev ?? detectDev();
  }

  shouldKeep(event: MonitorEvent): boolean {
    if (CRITICAL_TYPES.has(event.type)) return true;

    const base = this.resolveBaseRate(event.type);

    let rate = base;
    const battery = this.deps.getBattery?.();
    if (battery && !battery.isCharging && battery.level < 0.2) {
      rate *= 0.1;
    }
    if (this.deps.isCpuHigh?.()) {
      // CPU pressure drops everything except critical events.
      rate *= 0.2;
    }

    rate = Math.max(0, Math.min(1, rate));
    if (rate >= 1) return true;
    if (rate <= 0) return false;

    const hash =
      this.deps.sessionHash?.(event.sessionId, event.type) ??
      defaultHash(event.sessionId, event.type);
    return hash < rate;
  }

  private resolveBaseRate(type: string): number {
    const global = this.isDev
      ? this.deps.config.sampling.dev
      : this.deps.config.sampling.prod;

    const perType = this.deps.config.sampling.byType?.[type];
    if (!perType) return global;

    const override = this.isDev ? perType.dev : perType.prod;
    return override ?? global;
  }
}
