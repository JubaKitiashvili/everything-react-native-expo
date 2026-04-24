// Task 117.2 — DashboardClient tests. Each assertion uses a fake fetch
// so we never hit a real dashboard server during the test run.

import { describe, expect, test, vi } from 'vitest';
import { DashboardClient, DashboardRequestError } from './client.js';

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function errResponse(status: number, body: string = ''): Response {
  return new Response(body, { status });
}

describe('DashboardClient — URL construction', () => {
  test('trims trailing slashes from dashboardUrl', async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL) => {
      urls.push(String(url));
      return okResponse({ ok: true, tables: [], uptimeSeconds: 0 });
    });
    const client = new DashboardClient({
      dashboardUrl: 'http://127.0.0.1:3333///',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.getHealth();
    expect(urls[0]).toBe('http://127.0.0.1:3333/api/health');
  });

  test('appends Bearer authorization when apiKey is set', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer secret-xyz');
      return okResponse({ ok: true, tables: [], uptimeSeconds: 0 });
    });
    const client = new DashboardClient({
      dashboardUrl: 'http://localhost',
      apiKey: 'secret-xyz',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.getHealth();
  });

  test('omits authorization when no apiKey is set', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).authorization).toBeUndefined();
      return okResponse({ ok: true, tables: [], uptimeSeconds: 0 });
    });
    const client = new DashboardClient({
      dashboardUrl: 'http://localhost',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.getHealth();
  });
});

describe('DashboardClient — error handling', () => {
  test('throws DashboardRequestError on 4xx with the server-sent body', async () => {
    const fetchImpl = vi.fn(async () => errResponse(401, '{"error":"unauthorized"}'));
    const client = new DashboardClient({
      dashboardUrl: 'http://localhost',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.getHealth()).rejects.toBeInstanceOf(DashboardRequestError);
    await expect(client.getHealth()).rejects.toMatchObject({
      status: 401,
      path: '/api/health',
    });
  });

  test('retries once on 5xx and succeeds on the retry', async () => {
    let attempts = 0;
    const fetchImpl = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) return errResponse(503, '');
      return okResponse({ ok: true, tables: [], uptimeSeconds: 0 });
    });
    const client = new DashboardClient({
      dashboardUrl: 'http://localhost',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await client.getHealth();
    expect(result.ok).toBe(true);
    expect(attempts).toBe(2);
  });

  test('/api/ready tolerates 503 and parses the body', async () => {
    const fetchImpl = vi.fn(async () =>
      // 503 only on first call, retry also 503 so error propagates.
      errResponse(503, JSON.stringify({ ready: false, reason: 'booting', migrationsApplied: 2 })),
    );
    const client = new DashboardClient({
      dashboardUrl: 'http://localhost',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const res = await client.getReadiness();
    expect(res.ready).toBe(false);
    expect(res.migrationsApplied).toBe(2);
  });

  test('retries once on network error and surfaces the second failure', async () => {
    let attempts = 0;
    const fetchImpl = vi.fn(async () => {
      attempts += 1;
      throw new TypeError('network down');
    });
    const client = new DashboardClient({
      dashboardUrl: 'http://localhost',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.getHealth()).rejects.toThrow();
    expect(attempts).toBe(2);
  });
});

describe('DashboardClient — endpoint shapes', () => {
  test('listEvents builds a query string from filters', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL) => {
      calls.push(String(url));
      return okResponse({ events: [] });
    });
    const client = new DashboardClient({
      dashboardUrl: 'http://localhost',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.listEvents({
      since: 1_000,
      until: 2_000,
      sessionId: 's1',
      fingerprint: 'abc',
      userId: 'u1',
      type: ['crash', 'custom'],
      limit: 50,
    });
    expect(calls[0]).toContain('since=1000');
    expect(calls[0]).toContain('until=2000');
    expect(calls[0]).toContain('sessionId=s1');
    expect(calls[0]).toContain('fingerprint=abc');
    expect(calls[0]).toContain('userId=u1');
    expect(calls[0]).toContain('type=crash');
    expect(calls[0]).toContain('type=custom');
    expect(calls[0]).toContain('limit=50');
  });

  test('resolveSymbol POSTs the payload as JSON', async () => {
    let seenBody: string | null = null;
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      seenBody = (init?.body as string) ?? null;
      return okResponse({ resolved: { frame: null, file: null } });
    });
    const client = new DashboardClient({
      dashboardUrl: 'http://localhost',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.resolveSymbol({
      platform: 'ios',
      bundleId: 'com.acme',
      version: '1.0.0',
      symbol: 'foo',
    });
    expect(seenBody).not.toBeNull();
    expect(JSON.parse(seenBody!)).toMatchObject({
      platform: 'ios',
      bundleId: 'com.acme',
      version: '1.0.0',
      symbol: 'foo',
    });
  });

  test('getUserDataSummary URL-encodes the user id', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL) => {
      calls.push(String(url));
      return okResponse({
        summary: {
          userId: 'u!',
          sessionCount: 0,
          eventCount: 0,
          crashCount: 0,
          firstSeen: null,
          lastSeen: null,
          eventTypes: [],
        },
      });
    });
    const client = new DashboardClient({
      dashboardUrl: 'http://localhost',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.getUserDataSummary('user/42 with space');
    expect(calls[0]).toContain('user%2F42%20with%20space/summary');
  });
});
