import { describe, expect, test, vi } from 'vitest';
import { createAnalytics, type FetchImpl } from './analytics';

function makeFetch() {
  return vi.fn<FetchImpl>(async () => ({ ok: true }));
}

/** Parse the JSON body passed to the (single) fetch call. */
function bodyOf(fetchImpl: ReturnType<typeof makeFetch>): Record<string, unknown> {
  const init = fetchImpl.mock.calls[0]?.[1];
  return JSON.parse(init?.body ?? '{}') as Record<string, unknown>;
}

describe('createAnalytics — disabled paths', () => {
  test('no-op when no domain is configured (fetch never called)', () => {
    const fetchImpl = makeFetch();
    const a = createAnalytics({ fetchImpl });
    expect(a.enabled).toBe(false);
    a.trackPageview('/crashes/abc123');
    a.trackEvent('crash_resolved', { id: 'x' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('no-op when domain is empty/whitespace', () => {
    const fetchImpl = makeFetch();
    const a = createAnalytics({ domain: '   ', fetchImpl });
    expect(a.enabled).toBe(false);
    a.trackPageview('/');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('no-op when Do Not Track is enabled, even with a domain', () => {
    const fetchImpl = makeFetch();
    const a = createAnalytics({ domain: 'monitor.erne.dev', fetchImpl, dnt: true });
    expect(a.enabled).toBe(false);
    a.trackPageview('/performance');
    a.trackEvent('crash_resolved');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('createAnalytics — enabled', () => {
  test('trackPageview POSTs to the right URL with a SANITIZED path and no raw id', () => {
    const fetchImpl = makeFetch();
    const a = createAnalytics({ domain: 'monitor.erne.dev', fetchImpl });
    expect(a.enabled).toBe(true);

    a.trackPageview('/crashes/abc123');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchImpl.mock.calls[0]!;
    expect(endpoint).toBe('https://plausible.io/api/event');
    expect(init?.method).toBe('POST');
    expect(init?.keepalive).toBe(true);
    expect(init?.headers?.['Content-Type']).toBe('application/json');

    const body = bodyOf(fetchImpl);
    expect(body.name).toBe('pageview');
    expect(body.domain).toBe('monitor.erne.dev');
    expect(body.url).toBe('https://monitor.erne.dev/crashes/:id');
    // The raw id must never appear anywhere in the payload.
    expect(init?.body).not.toContain('abc123');
  });

  test('strips query strings from pageview paths', () => {
    const fetchImpl = makeFetch();
    const a = createAnalytics({ domain: 'monitor.erne.dev', fetchImpl });
    a.trackPageview('/sessions/42?tab=logs&token=secret');
    const body = bodyOf(fetchImpl);
    expect(body.url).toBe('https://monitor.erne.dev/sessions/:id');
    expect(fetchImpl.mock.calls[0]?.[1]?.body).not.toContain('secret');
  });

  test('trackEvent posts the event name and props', () => {
    const fetchImpl = makeFetch();
    const a = createAnalytics({ domain: 'monitor.erne.dev', fetchImpl });

    a.trackEvent('crash_resolved', { source: 'ai-fix', count: 3 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = bodyOf(fetchImpl);
    expect(body.name).toBe('crash_resolved');
    expect(body.props).toEqual({ source: 'ai-fix', count: 3 });
  });

  test('omits props when none are given', () => {
    const fetchImpl = makeFetch();
    const a = createAnalytics({ domain: 'monitor.erne.dev', fetchImpl });
    a.trackEvent('opened_settings');
    const body = bodyOf(fetchImpl);
    expect(body.name).toBe('opened_settings');
    expect('props' in body).toBe(false);
  });

  test('honors a custom host (VITE_ANALYTICS_HOST equivalent)', () => {
    const fetchImpl = makeFetch();
    const a = createAnalytics({
      domain: 'monitor.erne.dev',
      host: 'https://stats.erne.dev/',
      fetchImpl,
    });
    a.trackPageview('/performance');
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://stats.erne.dev/api/event');
  });

  test('never throws when the fetch implementation rejects', async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () => {
      throw new Error('network down');
    });
    const a = createAnalytics({ domain: 'monitor.erne.dev', fetchImpl });
    expect(() => a.trackPageview('/quality')).not.toThrow();
    // Let the swallowed rejection settle without surfacing.
    await Promise.resolve();
  });

  test('never throws when the fetch implementation throws synchronously', () => {
    const fetchImpl = vi.fn<FetchImpl>(() => {
      throw new Error('sync boom');
    });
    const a = createAnalytics({ domain: 'monitor.erne.dev', fetchImpl });
    expect(() => a.trackEvent('boom')).not.toThrow();
  });
});
