import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiProvider } from '../../shared/api/context';
import type { DashboardApiClient } from '../../shared/api/client';
import type { EventRecord } from '../../shared/api/types';
import { resetUiStore } from '../../shared/store/uiStore';
import { LiveFeed } from './LiveFeed';

function makeApi(events: EventRecord[]): DashboardApiClient {
  return {
    fetchEvents: vi.fn(async () => events),
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
  };
}

function makeWrapper(api: DashboardApiClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>{children}</ApiProvider>
    </QueryClientProvider>
  );
}

function ev(partial: Partial<EventRecord>): EventRecord {
  return {
    id: partial.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
    type: partial.type ?? 'custom',
    severity: partial.severity ?? 'info',
    sessionId: partial.sessionId ?? 's1',
    timestamp: partial.timestamp ?? 0,
    receivedAt: partial.receivedAt ?? (partial.timestamp ?? 0) + 10,
    payload: partial.payload ?? {},
    ...partial,
  };
}

const NOW = 1_770_000_000_000;

describe('LiveFeed panel', () => {
  beforeEach(() => {
    resetUiStore();
  });
  afterEach(() => {
    resetUiStore();
  });

  test('renders one row per event group, merging a same-fingerprint burst', async () => {
    const events = [
      ev({
        id: 'c3',
        type: 'crash',
        severity: 'critical',
        fingerprint: 'fp-a',
        timestamp: NOW - 1_000,
        payload: { message: 'TypeError: boom' },
      }),
      ev({
        id: 'c2',
        type: 'crash',
        severity: 'critical',
        fingerprint: 'fp-a',
        timestamp: NOW - 2_000,
        payload: { message: 'TypeError: boom' },
      }),
      ev({
        id: 'c1',
        type: 'crash',
        severity: 'critical',
        fingerprint: 'fp-a',
        timestamp: NOW - 3_000,
        payload: { message: 'TypeError: boom' },
      }),
      ev({
        id: 'n1',
        type: 'network',
        severity: 'warning',
        timestamp: NOW - 10_000,
        payload: { message: 'HTTP 500' },
      }),
    ];
    const wrapper = makeWrapper(makeApi(events));
    render(<LiveFeed now={NOW} />, { wrapper });

    const rows = await waitFor(() => {
      const list = screen.getByRole('list');
      const items = list.querySelectorAll('li');
      expect(items.length).toBe(2);
      return items;
    });
    expect(rows[0]).toHaveTextContent('×3');
    expect(rows[1]).toHaveTextContent('HTTP 500');
  });

  test('respects the type filter — toggling off `crash` hides every crash group', async () => {
    const events = [
      ev({ id: 'c1', type: 'crash', severity: 'critical', timestamp: NOW - 1_000 }),
      ev({ id: 'n1', type: 'network', severity: 'warning', timestamp: NOW - 2_000 }),
    ];
    const wrapper = makeWrapper(makeApi(events));
    render(<LiveFeed now={NOW} />, { wrapper });

    await waitFor(() => expect(screen.getByRole('list').querySelectorAll('li')).toHaveLength(2));

    await userEvent.click(screen.getByRole('button', { name: /toggle crash filter/i }));

    await waitFor(() => {
      expect(screen.getByRole('list').querySelectorAll('li')).toHaveLength(1);
    });
  });

  test('shows the empty state when filters hide every event', async () => {
    const events = [ev({ id: 'c1', type: 'crash', severity: 'critical', timestamp: NOW - 1_000 })];
    const wrapper = makeWrapper(makeApi(events));
    render(<LiveFeed now={NOW} />, { wrapper });

    await waitFor(() => expect(screen.getByRole('list').querySelectorAll('li')).toHaveLength(1));

    await userEvent.click(screen.getByRole('button', { name: /toggle crash filter/i }));

    await waitFor(() => {
      expect(screen.getByText(/no events match/i)).toBeInTheDocument();
    });
  });

  test('opens the detail drawer when a row is clicked, closes on the dismiss button', async () => {
    const events = [
      ev({
        id: 'c1',
        type: 'crash',
        severity: 'critical',
        timestamp: NOW - 1_000,
        fingerprint: 'fp-a',
        payload: { message: 'TypeError: boom', stack: 'at A' },
      }),
    ];
    const wrapper = makeWrapper(makeApi(events));
    render(<LiveFeed now={NOW} />, { wrapper });

    const row = await waitFor(() => screen.getByRole('button', { pressed: false }));
    await userEvent.click(row);

    const dialog = await waitFor(() => screen.getByRole('dialog', { name: /event details/i }));
    expect(dialog).toHaveTextContent('TypeError: boom');
    expect(dialog).toHaveTextContent('fp-a');

    await userEvent.click(screen.getByRole('button', { name: /close event details/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /event details/i })).toBeNull();
    });
  });
});
