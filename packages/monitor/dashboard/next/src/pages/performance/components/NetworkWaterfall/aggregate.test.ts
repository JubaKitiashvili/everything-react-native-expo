import { describe, expect, test } from 'vitest';
import type { EventRecord } from '@/shared/api/types';
import {
  classifyRequest,
  extractNetworkRequests,
  formatBytes,
  formatDurationMs,
  splitUrl,
} from './aggregate';

function net(
  id: string,
  timestamp: number,
  payload: Record<string, unknown>,
  screen?: string,
): EventRecord {
  return {
    id,
    type: 'network',
    severity: 'info',
    sessionId: 's1',
    timestamp,
    receivedAt: timestamp + 10,
    payload,
    ...(screen !== undefined ? { screen } : {}),
  };
}

describe('classifyRequest', () => {
  test('network error → error regardless of status + duration', () => {
    expect(classifyRequest({ status: null, durationMs: 0, error: 'DNS failure' })).toBe('error');
    expect(classifyRequest({ status: 200, durationMs: 5, error: 'aborted' })).toBe('error');
  });

  test('4xx and 5xx → error', () => {
    expect(classifyRequest({ status: 404, durationMs: 50 })).toBe('error');
    expect(classifyRequest({ status: 500, durationMs: 50 })).toBe('error');
    expect(classifyRequest({ status: 503, durationMs: 50 })).toBe('error');
  });

  test('slow when duration crosses threshold, default 1000 ms', () => {
    expect(classifyRequest({ status: 200, durationMs: 1_200 })).toBe('slow');
    expect(classifyRequest({ status: 200, durationMs: 999 })).toBe('ok');
  });

  test('custom slowMs threshold', () => {
    expect(classifyRequest({ status: 200, durationMs: 350 }, 300)).toBe('slow');
    expect(classifyRequest({ status: 200, durationMs: 250 }, 300)).toBe('ok');
  });
});

describe('extractNetworkRequests', () => {
  test('filters network events, enriches with severity, lowercases header keys, sorts newest-first', () => {
    const events = [
      net(
        'r1',
        100,
        {
          method: 'get',
          url: 'https://api.example.com/users',
          status: 200,
          durationMs: 120,
          requestSize: 320,
          responseSize: 512,
          initiator: 'UserList.tsx',
          requestHeaders: { 'X-Token': 'abc', 'Cache-Control': 'no-store' },
        },
        'Home',
      ),
      net('r2', 200, {
        method: 'POST',
        url: 'https://api.example.com/orders',
        status: 500,
        durationMs: 2_500,
        error: null,
      }),
      {
        id: 'nope',
        type: 'custom',
        severity: 'info',
        sessionId: 's1',
        timestamp: 1,
        receivedAt: 2,
        payload: {},
      },
      net('r3', 150, { method: 'GET', url: '' }),
    ];
    const out = extractNetworkRequests(events as EventRecord[]);
    expect(out.map((r) => r.id)).toEqual(['r2', 'r1']);
    expect(out[0]?.severity).toBe('error');
    expect(out[1]?.severity).toBe('ok');
    expect(out[1]?.method).toBe('GET');
    expect(out[1]?.host).toBe('api.example.com');
    expect(out[1]?.path).toBe('/users');
    expect(out[1]?.requestHeaders).toEqual({ 'x-token': 'abc', 'cache-control': 'no-store' });
  });

  test('reclassifies slow when overriding the threshold', () => {
    const events = [
      net('r1', 1, { method: 'GET', url: 'https://x/y', status: 200, durationMs: 500 }),
    ];
    const tight = extractNetworkRequests(events, { slowMs: 200 });
    expect(tight[0]?.severity).toBe('slow');
  });
});

describe('splitUrl', () => {
  test('parses absolute URL into host + path+query', () => {
    expect(splitUrl('https://api.example.com/v1/users?id=42')).toEqual({
      host: 'api.example.com',
      path: '/v1/users?id=42',
    });
  });

  test('falls back to raw path when the URL is relative', () => {
    expect(splitUrl('/v1/users')).toEqual({ host: '', path: '/v1/users' });
  });
});

describe('formatBytes', () => {
  test('renders B, KB, MB, GB tiers', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.00 GB');
  });

  test('returns em-dash for null / negative / NaN', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(-5)).toBe('—');
    expect(formatBytes(Number.NaN)).toBe('—');
  });
});

describe('formatDurationMs', () => {
  test('ms under 1s, 2-decimal seconds under 10s, 1-decimal seconds above', () => {
    expect(formatDurationMs(450)).toBe('450 ms');
    expect(formatDurationMs(2_350)).toBe('2.35 s');
    expect(formatDurationMs(42_000)).toBe('42.0 s');
  });
});
