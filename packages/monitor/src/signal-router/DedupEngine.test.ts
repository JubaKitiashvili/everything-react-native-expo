import { DedupEngine } from './DedupEngine';
import type { MonitorEvent, MonitorEventType } from '../types';

function ev(
  type: MonitorEventType | string,
  fingerprint?: string,
  extra: Record<string, unknown> = {},
): MonitorEvent {
  return {
    type: type as MonitorEventType,
    timestamp: 0,
    wallTime: 0,
    sessionId: 's',
    data: {
      ...(fingerprint ? { fingerprint } : {}),
      ...extra,
    },
  };
}

describe('DedupEngine — fingerprint-based dedup', () => {
  it('passes through fingerprinted events on first seen', () => {
    let now = 1000;
    const d = new DedupEngine({ now: () => now });
    expect(d.process(ev('crash', 'abc'))).not.toBeNull();
  });

  it('drops same-fingerprint events within window', () => {
    let now = 1000;
    const d = new DedupEngine({ windowMs: 5000, now: () => now });
    expect(d.process(ev('crash', 'abc'))).not.toBeNull();
    now += 1000;
    expect(d.process(ev('crash', 'abc'))).toBeNull();
    now += 500;
    expect(d.process(ev('crash', 'abc'))).toBeNull();
  });

  it('passes same fingerprint again after window expires', () => {
    let now = 1000;
    const d = new DedupEngine({ windowMs: 5000, now: () => now });
    expect(d.process(ev('crash', 'abc'))).not.toBeNull();
    now += 6000;
    expect(d.process(ev('crash', 'abc'))).not.toBeNull();
  });

  it('passes through events without fingerprint by default', () => {
    const d = new DedupEngine();
    expect(d.process(ev('render'))).not.toBeNull();
    expect(d.process(ev('render'))).not.toBeNull();
    expect(d.process(ev('render'))).not.toBeNull();
  });

  it('exposes entry counts per fingerprint', () => {
    let now = 1000;
    const d = new DedupEngine({ now: () => now });
    d.process(ev('crash', 'abc'));
    d.process(ev('crash', 'abc'));
    d.process(ev('crash', 'abc'));
    expect(d.getEntry('abc')?.count).toBe(3);
  });

  it('evicts oldest when maxFingerprints reached', () => {
    let now = 1000;
    const d = new DedupEngine({ maxFingerprints: 2, now: () => now });
    d.process(ev('crash', 'a'));
    now += 100;
    d.process(ev('crash', 'b'));
    now += 100;
    d.process(ev('crash', 'c')); // should evict 'a'
    expect(d.getEntry('a')).toBeNull();
    expect(d.getEntry('b')).not.toBeNull();
    expect(d.getEntry('c')).not.toBeNull();
  });

  it('snapshots all known entries', () => {
    const d = new DedupEngine();
    d.process(ev('crash', 'a'));
    d.process(ev('crash', 'b'));
    expect(d.snapshot()).toHaveLength(2);
  });

  it('clear() resets both entries and burst state', () => {
    const d = new DedupEngine({ burstKey: (e) => e.type });
    d.process(ev('crash', 'a'));
    d.process(ev('render'));
    d.process(ev('render'));
    d.process(ev('render'));
    d.clear();
    // After clear, previously-throttled keys should flow again
    expect(d.process(ev('render'))).not.toBeNull();
    expect(d.getEntry('a')).toBeNull();
  });
});

describe('DedupEngine — burst throttle (non-fingerprinted events)', () => {
  it('passes through up to burstMaxPerWindow events per key', () => {
    let now = 1000;
    const d = new DedupEngine({
      windowMs: 5000,
      burstMaxPerWindow: 3,
      burstKey: (e) => e.type,
      now: () => now,
    });
    expect(d.process(ev('render'))).not.toBeNull();
    expect(d.process(ev('render'))).not.toBeNull();
    expect(d.process(ev('render'))).not.toBeNull();
  });

  it('drops events beyond burst limit within window', () => {
    let now = 1000;
    const d = new DedupEngine({
      windowMs: 5000,
      burstMaxPerWindow: 3,
      burstKey: (e) => e.type,
      now: () => now,
    });
    d.process(ev('render'));
    d.process(ev('render'));
    d.process(ev('render'));
    expect(d.process(ev('render'))).toBeNull();
    expect(d.process(ev('render'))).toBeNull();
  });

  it('resets burst after window expires', () => {
    let now = 1000;
    const d = new DedupEngine({
      windowMs: 5000,
      burstMaxPerWindow: 2,
      burstKey: (e) => e.type,
      now: () => now,
    });
    d.process(ev('render'));
    d.process(ev('render'));
    expect(d.process(ev('render'))).toBeNull();
    now += 6000;
    expect(d.process(ev('render'))).not.toBeNull();
  });

  it('uses composite key to separate unrelated bursts', () => {
    let now = 1000;
    const d = new DedupEngine({
      windowMs: 5000,
      burstMaxPerWindow: 2,
      burstKey: (e) =>
        `${e.type}:${(e.data as { component?: string }).component ?? ''}`,
      now: () => now,
    });
    d.process(ev('render', undefined, { component: 'A' }));
    d.process(ev('render', undefined, { component: 'A' }));
    expect(d.process(ev('render', undefined, { component: 'A' }))).toBeNull();
    // Different component = separate burst counter
    expect(d.process(ev('render', undefined, { component: 'B' }))).not.toBeNull();
  });

  it('null burstKey means no throttling for that event', () => {
    const d = new DedupEngine({
      burstMaxPerWindow: 1,
      burstKey: (e) => (e.type === 'render' ? null : e.type),
    });
    // render returns null from burstKey → no throttle
    expect(d.process(ev('render'))).not.toBeNull();
    expect(d.process(ev('render'))).not.toBeNull();
    expect(d.process(ev('render'))).not.toBeNull();
  });

  it('burst throttle never applies to fingerprinted events', () => {
    const d = new DedupEngine({
      burstMaxPerWindow: 1,
      burstKey: (e) => e.type,
    });
    // Fingerprinted path is separate — only the duplicate within window is dropped
    expect(d.process(ev('crash', 'abc'))).not.toBeNull();
    // Second same-fingerprint in window is dropped by fingerprint dedup
    expect(d.process(ev('crash', 'abc'))).toBeNull();
    // Different fingerprint passes — burst throttle does NOT apply
    expect(d.process(ev('crash', 'xyz'))).not.toBeNull();
  });

  it('does nothing without a burstKey option', () => {
    const d = new DedupEngine({ burstMaxPerWindow: 1 });
    // No burstKey → all non-fingerprinted events pass
    expect(d.process(ev('render'))).not.toBeNull();
    expect(d.process(ev('render'))).not.toBeNull();
    expect(d.process(ev('render'))).not.toBeNull();
  });
});
