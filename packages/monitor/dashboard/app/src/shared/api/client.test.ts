import { describe, expect, test, vi } from 'vitest';
import { buildEventsQuery, createApiClient } from './client';

describe('buildEventsQuery', () => {
  test('serialises arrays as repeated params to match the server parser', () => {
    expect(buildEventsQuery({ type: ['crash', 'anr'], severity: 'critical' })).toBe(
      '?type=crash&type=anr&severity=critical',
    );
  });

  test('returns an empty string for an empty filter', () => {
    expect(buildEventsQuery({})).toBe('');
  });

  test('includes time window and limit when present', () => {
    expect(buildEventsQuery({ since: 100, until: 200, limit: 50 })).toBe(
      '?since=100&until=200&limit=50',
    );
  });
});

describe('createApiClient', () => {
  test('fetchEvents unwraps `events` from the JSON response', async () => {
    const seenUrls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      seenUrls.push(typeof input === 'string' ? input : String(input));
      return new Response(JSON.stringify({ events: [{ id: 'a', type: 'crash' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const client = createApiClient({ fetchImpl });
    const events = await client.fetchEvents({ type: 'crash' });
    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe('a');
    expect(seenUrls).toEqual(['/api/events?type=crash']);
  });

  test('rejects with a descriptive error on non-2xx responses', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 }));
    const client = createApiClient({ fetchImpl });
    await expect(client.fetchSessions()).rejects.toThrow(/500/);
    await expect(client.fetchSessions()).rejects.toThrow(/boom/);
  });
});
