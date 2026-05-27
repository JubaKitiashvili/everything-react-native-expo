import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AnalyticsTracker } from './AnalyticsTracker';
import { initAnalytics, __resetAnalyticsForTests } from './analytics';

beforeEach(() => {
  __resetAnalyticsForTests();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
});

afterEach(() => {
  __resetAnalyticsForTests();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function Navigator({ to }: { to: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to);
  }, [navigate, to]);
  return null;
}

describe('<AnalyticsTracker/>', () => {
  test('fires a sanitized pageview on the initial render', () => {
    vi.stubEnv('VITE_ANALYTICS_DOMAIN', 'monitor.erne.dev');
    initAnalytics();

    render(
      <MemoryRouter initialEntries={['/sessions/s_123?tab=logs']}>
        <AnalyticsTracker />
        <Routes>
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>,
    );

    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0]![1].body) as Record<string, unknown>;
    expect(body.name).toBe('pageview');
    expect(body.url).toBe('https://monitor.erne.dev/sessions/:id');
    expect(mockFetch.mock.calls[0]![1].body).not.toContain('s_123');
  });

  test('fires another pageview on route change', () => {
    vi.stubEnv('VITE_ANALYTICS_DOMAIN', 'monitor.erne.dev');
    initAnalytics();

    render(
      <MemoryRouter initialEntries={['/quality']}>
        <AnalyticsTracker />
        <Navigator to="/performance" />
        <Routes>
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>,
    );

    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const urls = mockFetch.mock.calls.map(
      (c) => (JSON.parse(c[1].body) as { url: string }).url,
    );
    expect(urls).toContain('https://monitor.erne.dev/quality');
    expect(urls).toContain('https://monitor.erne.dev/performance');
  });

  test('renders nothing and does not call fetch when unconfigured', () => {
    vi.stubEnv('VITE_ANALYTICS_DOMAIN', '');
    initAnalytics();

    const { container } = render(
      <MemoryRouter initialEntries={['/crashes/abc']}>
        <AnalyticsTracker />
      </MemoryRouter>,
    );

    expect(container).toBeEmptyDOMElement();
    expect(fetch).not.toHaveBeenCalled();
  });
});
