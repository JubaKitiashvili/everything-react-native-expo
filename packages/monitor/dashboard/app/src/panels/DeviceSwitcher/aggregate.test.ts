import { describe, expect, test } from 'vitest';
import type { SessionRecord } from '../../shared/api/types';
import { extractDevices, readDeviceFields } from './aggregate';

const NOW = 1_770_000_000_000;

function session(partial: Partial<SessionRecord>): SessionRecord {
  return {
    id: partial.id ?? 's',
    startedAt: partial.startedAt ?? NOW,
    eventCount: partial.eventCount ?? 0,
    crashCount: partial.crashCount ?? 0,
    ...partial,
  };
}

describe('readDeviceFields', () => {
  test('prefers session.platform over device.platform and tolerates missing device info', () => {
    const out = readDeviceFields(
      session({
        platform: 'ios',
        appVersion: '1.2.0',
        runtimeVersion: '55.0.0',
        device: { model: 'iPhone 16 Pro', systemVersion: '18.4' },
      }),
    );
    expect(out).toEqual({
      fingerprint: 'ios|iphone 16 pro|18.4|1.2.0',
      platform: 'ios',
      model: 'iPhone 16 Pro',
      osVersion: '18.4',
      appVersion: '1.2.0',
      runtimeVersion: '55.0.0',
      channel: 'default',
    });
  });

  test('maps bare sessions to a single `unknown|unknown|unknown|unknown` fingerprint', () => {
    const out = readDeviceFields(session({}));
    expect(out.fingerprint).toBe('unknown|unknown|unknown|unknown');
    expect(out.platform).toBe('unknown');
  });
});

describe('extractDevices', () => {
  test('collapses sessions sharing platform + model + OS + appVersion and sums counters', () => {
    const sessions = [
      session({
        id: 'a1',
        platform: 'ios',
        appVersion: '1.2.0',
        device: { model: 'iPhone 16 Pro', systemVersion: '18.4' },
        startedAt: NOW - 60_000,
        endedAt: NOW - 40_000,
        eventCount: 10,
        crashCount: 1,
      }),
      session({
        id: 'a2',
        platform: 'ios',
        appVersion: '1.2.0',
        device: { model: 'iPhone 16 Pro', systemVersion: '18.4' },
        startedAt: NOW - 10_000,
        eventCount: 4,
        crashCount: 0,
      }),
      session({
        id: 'b1',
        platform: 'android',
        appVersion: '1.2.0',
        device: { model: 'Pixel 9', osVersion: '15' },
        startedAt: NOW - 5_000,
        eventCount: 7,
        crashCount: 2,
      }),
    ];
    const devices = extractDevices(sessions);
    expect(devices).toHaveLength(2);
    // Sorted by lastSeen desc → iOS device (ended at NOW-40k, but second session started NOW-10k) wins vs Pixel (NOW-5k).
    expect(devices[0]?.platform).toBe('android');
    expect(devices[1]?.platform).toBe('ios');

    const iphone = devices.find((d) => d.model === 'iPhone 16 Pro')!;
    expect(iphone.sessionCount).toBe(2);
    expect(iphone.eventCount).toBe(14);
    expect(iphone.crashCount).toBe(1);
    expect(iphone.firstSeen).toBe(NOW - 60_000);
    expect(iphone.lastSeen).toBe(NOW - 10_000);
    expect(iphone.sessions.map((s) => s.id).sort()).toEqual(['a1', 'a2']);
  });

  test('bucket of one when the only session has no device info', () => {
    const devices = extractDevices([session({ id: 'lonely' })]);
    expect(devices).toHaveLength(1);
    expect(devices[0]?.platform).toBe('unknown');
  });
});
