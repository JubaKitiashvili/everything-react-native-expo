import { AdaptiveSampler } from './AdaptiveSampler';
import { defineMonitorConfig } from '../core/Config';
import type { MonitorEvent, MonitorEventType } from '../types';

function evt(type: MonitorEventType, sessionId = 'session-a'): MonitorEvent {
  return { type, timestamp: 0, wallTime: 0, sessionId, data: {} };
}

describe('AdaptiveSampler', () => {
  it('always keeps crash events', () => {
    const s = new AdaptiveSampler({
      config: defineMonitorConfig({ sampling: { dev: 0, prod: 0 } }),
      isDev: false,
    });
    expect(s.shouldKeep(evt('crash'))).toBe(true);
  });

  it('keeps everything in dev with rate 1.0', () => {
    const s = new AdaptiveSampler({
      config: defineMonitorConfig({ sampling: { dev: 1.0 } }),
      isDev: true,
    });
    expect(s.shouldKeep(evt('network'))).toBe(true);
    expect(s.shouldKeep(evt('navigation'))).toBe(true);
  });

  it('drops everything at rate 0 (except crashes)', () => {
    const s = new AdaptiveSampler({
      config: defineMonitorConfig({ sampling: { prod: 0 } }),
      isDev: false,
    });
    expect(s.shouldKeep(evt('network'))).toBe(false);
    expect(s.shouldKeep(evt('crash'))).toBe(true);
  });

  it('is deterministic per session+type', () => {
    const s = new AdaptiveSampler({
      config: defineMonitorConfig({ sampling: { prod: 0.5 } }),
      isDev: false,
      sessionHash: () => 0.3,
    });
    const e = evt('network');
    const first = s.shouldKeep(e);
    const second = s.shouldKeep(e);
    expect(first).toBe(second);
    expect(first).toBe(true);
  });

  it('drops below rate boundary', () => {
    const s = new AdaptiveSampler({
      config: defineMonitorConfig({ sampling: { prod: 0.5 } }),
      isDev: false,
      sessionHash: () => 0.7,
    });
    expect(s.shouldKeep(evt('network'))).toBe(false);
  });

  it('reduces rate under low battery', () => {
    const s = new AdaptiveSampler({
      config: defineMonitorConfig({ sampling: { prod: 0.5 } }),
      isDev: false,
      getBattery: () => ({ level: 0.1, isCharging: false }),
      sessionHash: () => 0.2, // would be kept at 0.5 but not at 0.05
    });
    expect(s.shouldKeep(evt('network'))).toBe(false);
  });

  it('ignores low battery when charging', () => {
    const s = new AdaptiveSampler({
      config: defineMonitorConfig({ sampling: { prod: 1.0 } }),
      isDev: false,
      getBattery: () => ({ level: 0.05, isCharging: true }),
    });
    expect(s.shouldKeep(evt('network'))).toBe(true);
  });

  it('reduces rate under CPU pressure', () => {
    const s = new AdaptiveSampler({
      config: defineMonitorConfig({ sampling: { prod: 1.0 } }),
      isDev: false,
      isCpuHigh: () => true,
      sessionHash: () => 0.5, // 1.0 * 0.2 = 0.2, so 0.5 is dropped
    });
    expect(s.shouldKeep(evt('network'))).toBe(false);
    expect(s.shouldKeep(evt('crash'))).toBe(true);
  });

  it('uses the default hash when no sessionHash is provided', () => {
    const s = new AdaptiveSampler({
      config: defineMonitorConfig({ sampling: { prod: 0.5 } }),
      isDev: false,
    });
    // The default hash is deterministic — same session+type gives same result
    const result1 = s.shouldKeep(evt('network', 'fixed-session'));
    const result2 = s.shouldKeep(evt('network', 'fixed-session'));
    expect(result1).toBe(result2);
  });

  it('detects dev via __DEV__ global when isDev is not provided', () => {
    const g = globalThis as { __DEV__?: unknown };
    const origDev = g.__DEV__;
    try {
      g.__DEV__ = true;
      const s = new AdaptiveSampler({
        config: defineMonitorConfig({ sampling: { dev: 1.0, prod: 0 } }),
        // isDev omitted — should detect from __DEV__
      });
      expect(s.shouldKeep(evt('network'))).toBe(true);
    } finally {
      g.__DEV__ = origDev;
    }
  });

  it('detects dev via NODE_ENV when __DEV__ is not present', () => {
    const g = globalThis as { __DEV__?: unknown };
    const origDev = g.__DEV__;
    const origEnv = process.env.NODE_ENV;
    try {
      delete g.__DEV__;
      process.env.NODE_ENV = 'production';
      const s = new AdaptiveSampler({
        config: defineMonitorConfig({ sampling: { dev: 1.0, prod: 0 } }),
        // isDev omitted
      });
      // production rate is 0, so non-crash events should be dropped
      expect(s.shouldKeep(evt('network'))).toBe(false);
    } finally {
      g.__DEV__ = origDev;
      process.env.NODE_ENV = origEnv;
    }
  });

  it('applies both battery and CPU degradation together', () => {
    const s = new AdaptiveSampler({
      config: defineMonitorConfig({ sampling: { prod: 1.0 } }),
      isDev: false,
      getBattery: () => ({ level: 0.1, isCharging: false }),
      isCpuHigh: () => true,
      // rate = 1.0 * 0.1 (battery) * 0.2 (CPU) = 0.02
      sessionHash: () => 0.05, // above 0.02, should be dropped
    });
    expect(s.shouldKeep(evt('network'))).toBe(false);
  });

  it('does not degrade when battery getter returns null', () => {
    const s = new AdaptiveSampler({
      config: defineMonitorConfig({ sampling: { prod: 1.0 } }),
      isDev: false,
      getBattery: () => null,
    });
    expect(s.shouldKeep(evt('network'))).toBe(true);
  });

  it('does not degrade when isCpuHigh returns false', () => {
    const s = new AdaptiveSampler({
      config: defineMonitorConfig({ sampling: { prod: 1.0 } }),
      isDev: false,
      isCpuHigh: () => false,
    });
    expect(s.shouldKeep(evt('network'))).toBe(true);
  });
});
