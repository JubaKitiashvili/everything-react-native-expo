import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiProvider } from '../../shared/api/context';
import type { DashboardApiClient } from '../../shared/api/client';
import type { EventRecord, SessionRecord } from '../../shared/api/types';
import { resetUiStore } from '../../shared/store/uiStore';
import { SessionReplay } from './SessionReplay';
import { ReplayViewer, type ReplayClock } from './ReplayViewer';

function makeApi(
  sessions: SessionRecord[],
  events: EventRecord[],
  overrides: Partial<DashboardApiClient> = {},
): DashboardApiClient {
  return {
    fetchSessions: vi.fn(async () => sessions),
    fetchEvents: vi.fn(async (filter) => {
      if (filter?.sessionId) {
        return events.filter((e) => e.sessionId === filter.sessionId);
      }
      return events;
    }),
    fetchCrashGroups: vi.fn(async () => []),
    fetchAlertRules: vi.fn(async () => []),
    saveAlertRule: vi.fn(async () => {
      throw new Error('not used');
    }),
    deleteAlertRule: vi.fn(async () => undefined),
    fetchAlertHistory: vi.fn(async () => []),
    fetchBugReports: vi.fn(async () => []),
    updateBugReport: vi.fn(async () => null),
    ...overrides,
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

function session(partial: Partial<SessionRecord>): SessionRecord {
  return {
    id: partial.id ?? 's1',
    startedAt: partial.startedAt ?? NOW - 60_000,
    eventCount: partial.eventCount ?? 0,
    crashCount: partial.crashCount ?? 0,
    ...partial,
  };
}

function replayEvent(sessionId: string, timestamp: number, id: string, image: string): EventRecord {
  return {
    id,
    type: 'replay_frame',
    severity: 'info',
    sessionId,
    timestamp,
    receivedAt: timestamp + 10,
    payload: { image, screen: 'Home' },
  };
}

describe('SessionReplay panel', () => {
  beforeEach(() => resetUiStore());
  afterEach(() => resetUiStore());

  test('shows a "no frames" message when the selected session has no replay_frame events', async () => {
    const sessions = [session({ id: 's1', crashCount: 1 })];
    const events: EventRecord[] = [
      {
        id: 'e1',
        type: 'custom',
        severity: 'info',
        sessionId: 's1',
        timestamp: NOW - 10_000,
        receivedAt: NOW - 9_990,
        payload: {},
      },
    ];
    const api = makeApi(sessions, events);
    render(<SessionReplay now={NOW} />, { wrapper: makeWrapper(api) });

    await waitFor(() => expect(screen.getByText(/no replay frames captured/i)).toBeInTheDocument());
  });

  test('renders a frame image when replay_frame events exist for the session', async () => {
    const sessions = [session({ id: 's1' })];
    const events = [
      replayEvent('s1', NOW - 10_000, 'f1', 'data:image/png;base64,AAA'),
      replayEvent('s1', NOW - 5_000, 'f2', 'data:image/png;base64,BBB'),
    ];
    render(<SessionReplay now={NOW} />, { wrapper: makeWrapper(makeApi(sessions, events)) });

    const img = await waitFor(() => screen.getByAltText('Session replay frame'));
    expect(img).toHaveAttribute('src', 'data:image/png;base64,AAA');
  });

  test('clicking a different session in the list loads its frames', async () => {
    const sessions = [session({ id: 's1' }), session({ id: 's2' })];
    const events = [
      replayEvent('s1', NOW - 10_000, 'f1', 'data:image/png;base64,AAA'),
      replayEvent('s2', NOW - 5_000, 'f2', 'data:image/png;base64,ZZZ'),
    ];
    render(<SessionReplay now={NOW} />, { wrapper: makeWrapper(makeApi(sessions, events)) });

    await waitFor(() => expect(screen.getByAltText('Session replay frame')).toBeInTheDocument());
    const s2Button = screen.getByRole('button', { name: /s2/ });
    await userEvent.click(s2Button);
    await waitFor(() => {
      const img = screen.getByAltText('Session replay frame');
      expect(img).toHaveAttribute('src', 'data:image/png;base64,ZZZ');
    });
  });
});

describe('ReplayViewer playback controls', () => {
  test('toggling play starts the clock; scrubbing pauses it', async () => {
    const frames = [
      { id: 'f1', timestamp: 0, image: 'data:image/png;base64,A' },
      { id: 'f2', timestamp: 1_000, image: 'data:image/png;base64,B' },
      { id: 'f3', timestamp: 2_000, image: 'data:image/png;base64,C' },
    ];
    let currentTime = 0;
    const pending: Array<() => void> = [];
    const clock: ReplayClock = {
      now: () => currentTime,
      schedule: (fn) => {
        pending.push(fn);
        return () => {
          const idx = pending.indexOf(fn);
          if (idx !== -1) pending.splice(idx, 1);
        };
      },
    };

    render(<ReplayViewer frames={frames} events={[]} clock={clock} />);

    expect(screen.getByAltText('Session replay frame')).toHaveAttribute(
      'src',
      'data:image/png;base64,A',
    );

    await userEvent.click(screen.getByRole('button', { name: /^play replay$/i }));

    act(() => {
      currentTime = 1_100;
      pending.shift()?.();
    });

    await waitFor(() => {
      expect(screen.getByAltText('Session replay frame')).toHaveAttribute(
        'src',
        'data:image/png;base64,B',
      );
    });

    await userEvent.click(screen.getByRole('button', { name: /pause playback/i }));
    expect(pending).toHaveLength(0);
  });

  test('selecting 4× playback speed exposes the aria-pressed change', async () => {
    const frames = [
      { id: 'f1', timestamp: 0 },
      { id: 'f2', timestamp: 1_000 },
    ];
    render(<ReplayViewer frames={frames} events={[]} />);
    const fourX = screen.getByRole('button', { name: '4×' });
    expect(fourX).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(fourX);
    expect(fourX).toHaveAttribute('aria-pressed', 'true');
  });
});
