import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { initAnalytics, trackEvent, trackPageview, __resetAnalyticsForTests } from './analytics';

/**
 * Exercises the env-wired singleton: `initAnalytics()` reads import.meta.env
 * (via vi.stubEnv) and the real global `fetch` (which we stub) + DNT detection.
 */

beforeEach(() => {
  __resetAnalyticsForTests();
  // Default: no DNT signal anywhere.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
});

afterEach(() => {
  __resetAnalyticsForTests();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('initAnalytics singleton', () => {
  test('no-op when VITE_ANALYTICS_DOMAIN is unset (fetch never called)', () => {
    vi.stubEnv('VITE_ANALYTICS_DOMAIN', '');
    const a = initAnalytics();
    expect(a.enabled).toBe(false);
    trackPageview('/crashes/abc123');
    trackEvent('crash_resolved');
    expect(fetch).not.toHaveBeenCalled();
  });

  test('no-op when Do Not Track is enabled via navigator.doNotTrack', () => {
    vi.stubEnv('VITE_ANALYTICS_DOMAIN', 'monitor.erne.dev');
    Object.defineProperty(globalThis.navigator, 'doNotTrack', {
      value: '1',
      configurable: true,
    });
    try {
      const a = initAnalytics();
      expect(a.enabled).toBe(false);
      trackPageview('/performance');
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis.navigator, 'doNotTrack', {
        value: null,
        configurable: true,
      });
    }
  });

  test('sends a sanitized pageview through the real global fetch when configured', () => {
    vi.stubEnv('VITE_ANALYTICS_DOMAIN', 'monitor.erne.dev');
    const a = initAnalytics();
    expect(a.enabled).toBe(true);

    trackPageview('/crashes/deadbeef');

    expect(fetch).toHaveBeenCalledTimes(1);
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    const [endpoint, init] = mockFetch.mock.calls[0]!;
    expect(endpoint).toBe('https://plausible.io/api/event');
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.name).toBe('pageview');
    expect(body.url).toBe('https://monitor.erne.dev/crashes/:id');
    expect(init.body).not.toContain('deadbeef');
  });

  test('is idempotent — repeated init() keeps the first instance', () => {
    vi.stubEnv('VITE_ANALYTICS_DOMAIN', 'monitor.erne.dev');
    const first = initAnalytics();
    const second = initAnalytics();
    expect(second).toBe(first);
  });
});
