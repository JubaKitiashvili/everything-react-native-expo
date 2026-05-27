import { describe, expect, test, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { ApiProvider } from '../api/context';
import type { DashboardApiClient } from '../api/client';
import { authStubMethods } from '../api/authStub';
import { useCrashGroups } from './useCrashGroups';
import { useEvents } from './useEvents';

function makeWrapper(apiClient: DashboardApiClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <ApiProvider client={apiClient}>{children}</ApiProvider>
      </QueryClientProvider>
    ),
  };
}

function makeApi(overrides: Partial<DashboardApiClient> = {}): DashboardApiClient {
  return {
    ...authStubMethods(),
    fetchEvents: vi.fn(async () => []),
    fetchSessions: vi.fn(async () => []),
    fetchCrashGroups: vi.fn(async () => []),
    fetchAlertRules: vi.fn(async () => []),
    saveAlertRule: vi.fn(async () => {
      throw new Error('not used');
    }),
    deleteAlertRule: vi.fn(async () => undefined),
    fetchAlertHistory: vi.fn(async () => []),
    fetchBugReports: vi.fn(async () => []),
    updateBugReport: vi.fn(async () => null),
    fetchSymbolFiles: vi.fn(async () => []),
    uploadSymbolFile: vi.fn(async () => {
      throw new Error('not used');
    }),
    deleteSymbolFile: vi.fn(async () => undefined),
    resolveFrame: vi.fn(async () => {
      throw new Error('not used');
    }),
    fetchUserSummary: vi.fn(async () => {
      throw new Error('not used');
    }),
    exportUserData: vi.fn(async () => {
      throw new Error('not used');
    }),
    deleteUserData: vi.fn(async () => ({ deletedEvents: 0 })),
    fetchSettings: vi.fn(async () => {
      throw new Error('not used');
    }),
    patchSettings: vi.fn(async () => {
      throw new Error('not used');
    }),
    rotateWsToken: vi.fn(async () => ({ wsTokenMasked: null, wsTokenSet: false })),
    resetDatabase: vi.fn(async () => ({ ok: true as const, deleted: {} })),
    generateSampleData: vi.fn(async () => ({
      ok: true as const,
      seeded: {
        sessions: 0,
        events: 0,
        crashGroups: 0,
        bugReports: 0,
        alertRules: 0,
        symbolFiles: 0,
      },
    })),
    ...overrides,
  };
}

describe('useEvents', () => {
  test('fetches via the injected API client and returns data', async () => {
    const fetchEvents = vi.fn(async () => [
      {
        id: 'e1',
        type: 'crash',
        severity: 'critical' as const,
        sessionId: 's1',
        timestamp: 1,
        receivedAt: 2,
        payload: {},
      },
    ]);
    const api = makeApi({ fetchEvents });
    const { wrapper } = makeWrapper(api);

    const { result } = renderHook(() => useEvents({ filter: { type: 'crash' } }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]?.id).toBe('e1');
    expect(fetchEvents).toHaveBeenCalledWith({ type: 'crash' });
  });

  test('reuses the cache for the same filter (no second fetch)', async () => {
    const fetchEvents = vi.fn(async () => []);
    const api = makeApi({ fetchEvents });
    const { wrapper } = makeWrapper(api);

    const first = renderHook(() => useEvents({ filter: { type: 'crash' } }), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    const second = renderHook(() => useEvents({ filter: { type: 'crash' } }), { wrapper });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
    expect(fetchEvents).toHaveBeenCalledTimes(1);
  });
});

describe('useCrashGroups', () => {
  test('fetches the crash-groups endpoint and returns the array', async () => {
    const fetchCrashGroups = vi.fn(async () => [
      {
        fingerprint: 'fp-1',
        message: 'TypeError',
        firstSeen: 1,
        lastSeen: 2,
        eventCount: 3,
        sessionCount: 2,
        status: 'new' as const,
      },
    ]);
    const api = makeApi({ fetchCrashGroups });
    const { wrapper } = makeWrapper(api);
    const { result } = renderHook(() => useCrashGroups(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]?.eventCount).toBe(3);
  });
});
