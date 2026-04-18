import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiProvider } from '../../shared/api/context';
import type { DashboardApiClient } from '../../shared/api/client';
import type { CrashGroupRecord, EventRecord } from '../../shared/api/types';
import { resetUiStore } from '../../shared/store/uiStore';
import { CrashExplorer } from './CrashExplorer';
import { CrashGroupDetail } from './CrashGroupDetail';
import { CrashGroupList } from './CrashGroupList';

function makeApi(partial: Partial<DashboardApiClient>): DashboardApiClient {
  return {
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
    ...partial,
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

const NOW = 1_770_000_000_000;

function group(partial: Partial<CrashGroupRecord>): CrashGroupRecord {
  return {
    fingerprint: partial.fingerprint ?? 'fp-a',
    message: partial.message ?? 'TypeError: boom',
    firstSeen: partial.firstSeen ?? NOW - 60_000,
    lastSeen: partial.lastSeen ?? NOW - 10_000,
    eventCount: partial.eventCount ?? 3,
    sessionCount: partial.sessionCount ?? 2,
    status: partial.status ?? 'new',
    ...partial,
  };
}

function crashEvent(partial: Partial<EventRecord>): EventRecord {
  return {
    id: partial.id ?? `evt-${Math.random().toString(36).slice(2)}`,
    type: 'crash',
    severity: 'critical',
    sessionId: partial.sessionId ?? 's1',
    timestamp: partial.timestamp ?? NOW - 30_000,
    receivedAt: partial.receivedAt ?? (partial.timestamp ?? NOW) - 29_000,
    fingerprint: partial.fingerprint ?? 'fp-a',
    payload: partial.payload ?? {},
    ...partial,
  };
}

describe('CrashGroupList', () => {
  test('renders one row per group with status + counts + fires onSelect', async () => {
    const groups = [
      group({ fingerprint: 'fp-a', message: 'A', status: 'new', eventCount: 5, sessionCount: 3 }),
      group({
        fingerprint: 'fp-b',
        message: 'B',
        status: 'investigating',
        eventCount: 2,
        sessionCount: 1,
      }),
    ];
    const onSelect = vi.fn();
    render(
      <CrashGroupList groups={groups} selectedFingerprint={null} onSelect={onSelect} now={NOW} />,
    );

    const rows = screen.getAllByRole('button');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('fp-a');
    expect(rows[0]).toHaveTextContent('×5');
    expect(rows[0]).toHaveTextContent('3 sessions');
    expect(rows[1]).toHaveTextContent('investigating');

    await userEvent.click(rows[1]!);
    expect(onSelect).toHaveBeenCalledWith('fp-b');
  });

  test('renders the empty state when there are no crashes', () => {
    render(<CrashGroupList groups={[]} selectedFingerprint={null} onSelect={() => {}} />);
    expect(screen.getByText(/no crashes recorded/i)).toBeInTheDocument();
  });
});

describe('CrashGroupDetail', () => {
  test('renders meta grid, stack frames, breadcrumbs, and AI suggestion when present', () => {
    const event = crashEvent({
      payload: {
        message: 'TypeError: cannot read id',
        stack: [
          'TypeError: cannot read id',
          '    at UserList.render (App.tsx:128:12)',
          '    at Array.map (<anonymous>)',
        ].join('\n'),
        breadcrumbs: [
          { category: 'nav', message: 'Navigated to /users', timestamp: NOW - 45_000 },
          { category: 'touch', message: 'Tapped "Refresh"', timestamp: NOW - 40_000 },
        ],
        aiSuggestion: { text: 'Check that users[] is non-empty before .map.' },
      },
    });
    render(
      <CrashGroupDetail
        group={group({ eventCount: 4, sessionCount: 2, topScreen: 'Users' })}
        latestEvent={event}
        now={NOW}
      />,
    );

    expect(screen.getByText('TypeError: boom')).toBeInTheDocument(); // group.message
    expect(screen.getByText('UserList.render')).toBeInTheDocument();
    expect(screen.getByText('Navigated to /users')).toBeInTheDocument();
    expect(screen.getByText(/Check that users\[\]/)).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Users')).toBeInTheDocument();
  });

  test('shows a friendly "no stack captured" message when payload.stack is missing', () => {
    render(
      <CrashGroupDetail group={group({})} latestEvent={crashEvent({ payload: {} })} now={NOW} />,
    );
    expect(screen.getByText(/no stack captured/i)).toBeInTheDocument();
  });
});

describe('CrashExplorer integration', () => {
  beforeEach(() => resetUiStore());
  afterEach(() => resetUiStore());

  test('auto-selects the first crash group on load and switches to a clicked one', async () => {
    const groups = [
      group({ fingerprint: 'fp-a', message: 'first crash', eventCount: 7 }),
      group({ fingerprint: 'fp-b', message: 'second crash', eventCount: 1 }),
    ];
    const events = [
      crashEvent({
        id: 'e1',
        fingerprint: 'fp-a',
        timestamp: NOW - 10_000,
        payload: {
          message: 'first crash',
          stack: 'Error: first crash\n    at First.render (App.tsx:1:1)',
        },
      }),
      crashEvent({
        id: 'e2',
        fingerprint: 'fp-b',
        timestamp: NOW - 5_000,
        payload: {
          message: 'second crash',
          stack: 'Error: second crash\n    at Second.render (App.tsx:2:2)',
        },
      }),
    ];
    const api = makeApi({
      fetchCrashGroups: vi.fn(async () => groups),
      fetchEvents: vi.fn(async () => events),
    });
    render(<CrashExplorer now={NOW} />, { wrapper: makeWrapper(api) });

    await waitFor(() => expect(screen.getByText('First.render')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /fp-b/ }));
    await waitFor(() => expect(screen.getByText('Second.render')).toBeInTheDocument());
  });
});
