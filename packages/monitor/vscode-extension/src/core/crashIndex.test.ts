import { describe, expect, it } from 'vitest';
import { buildCrashIndex, codeLensText } from './crashIndex';
import type { CrashGroup } from './types';

describe('buildCrashIndex', () => {
  it('aggregates groups by topScreen, summing eventCount', () => {
    const groups: CrashGroup[] = [
      { fingerprint: 'a', message: '', eventCount: 5, status: 'open', topScreen: 'Home' },
      { fingerprint: 'b', message: '', eventCount: 7, status: 'open', topScreen: 'Home' },
      { fingerprint: 'c', message: '', eventCount: 2, status: 'open', topScreen: 'Profile' },
    ];

    const index = buildCrashIndex(groups);
    expect(index.get('Home')?.count).toBe(12);
    expect(index.get('Profile')?.count).toBe(2);
  });

  it('picks topFingerprint as the highest-eventCount group on each screen', () => {
    const groups: CrashGroup[] = [
      { fingerprint: 'low', message: '', eventCount: 1, status: 'open', topScreen: 'Home' },
      { fingerprint: 'high', message: '', eventCount: 9, status: 'open', topScreen: 'Home' },
      { fingerprint: 'mid', message: '', eventCount: 4, status: 'open', topScreen: 'Home' },
    ];

    expect(buildCrashIndex(groups).get('Home')?.topFingerprint).toBe('high');
  });

  it('keeps the first-seen fingerprint on an eventCount tie (deterministic)', () => {
    const groups: CrashGroup[] = [
      { fingerprint: 'first', message: '', eventCount: 5, status: 'open', topScreen: 'Home' },
      { fingerprint: 'second', message: '', eventCount: 5, status: 'open', topScreen: 'Home' },
    ];

    expect(buildCrashIndex(groups).get('Home')?.topFingerprint).toBe('first');
  });

  it('ignores groups without a topScreen', () => {
    const groups: CrashGroup[] = [
      { fingerprint: 'a', message: '', eventCount: 5, status: 'open' },
      { fingerprint: 'b', message: '', eventCount: 3, status: 'open', topScreen: '' },
      { fingerprint: 'c', message: '', eventCount: 2, status: 'open', topScreen: 'Home' },
    ];

    const index = buildCrashIndex(groups);
    expect(index.size).toBe(1);
    expect(index.has('Home')).toBe(true);
  });

  it('returns an empty index for empty input', () => {
    expect(buildCrashIndex([]).size).toBe(0);
  });
});

describe('codeLensText', () => {
  it('uses the plural noun for multiple crashes', () => {
    expect(codeLensText({ count: 12, topFingerprint: 'x' })).toBe(
      '⚠ 12 crashes — open in ERNE',
    );
  });

  it('uses the singular noun for exactly one crash', () => {
    expect(codeLensText({ count: 1, topFingerprint: 'x' })).toBe(
      '⚠ 1 crash — open in ERNE',
    );
  });

  it('uses the plural noun for zero crashes', () => {
    expect(codeLensText({ count: 0, topFingerprint: 'x' })).toBe(
      '⚠ 0 crashes — open in ERNE',
    );
  });
});
