import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '../../shared/api/context';
import type { DashboardApiClient, UpdateBugReportInput } from '../../shared/api/client';
import type { BugReportRecord } from '../../shared/api/types';
import { BugReportsInbox } from './BugReportsInbox';

const NOW = 1_770_000_000_000;

function report(partial: Partial<BugReportRecord>): BugReportRecord {
  return {
    id: partial.id ?? 'bug-x',
    sessionId: partial.sessionId ?? 's1',
    submittedAt: partial.submittedAt ?? NOW - 5_000,
    title: partial.title ?? 'Shaky UI',
    description: partial.description ?? 'The list jumps when I scroll.',
    status: partial.status ?? 'new',
    attachments:
      partial.attachments ??
      ({
        screenshotUrl: 'data:image/png;base64,AAA',
        breadcrumbs: [
          { category: 'nav', message: 'Navigated to /feed', timestamp: NOW - 10_000 },
          { category: 'touch', message: 'Tapped refresh', timestamp: NOW - 6_000 },
        ],
        device: { model: 'iPhone 16 Pro', os: 'iOS 18.4' },
      } satisfies Record<string, unknown>),
    ...partial,
  };
}

describe('BugReportsInbox view-only', () => {
  test('renders empty state when no reports exist', () => {
    render(<BugReportsInbox reports={[]} now={NOW} />);
    expect(screen.getByText(/no bug reports yet/i)).toBeInTheDocument();
  });

  test('auto-selects the newest report and renders attachments + device + breadcrumbs', async () => {
    const reports = [
      report({ id: 'old', submittedAt: NOW - 60_000, title: 'Older', attachments: {} }),
      report({ id: 'fresh', submittedAt: NOW - 1_000, title: 'Fresh shake' }),
    ];
    render(<BugReportsInbox reports={reports} now={NOW} />);

    // Fresh report auto-selected → detail shows its screenshot + breadcrumbs + device.
    const detail = await waitFor(() => screen.getByLabelText(/bug report detail/i));
    expect(detail).toHaveTextContent('Fresh shake');
    expect(detail.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAA');
    expect(detail).toHaveTextContent('Navigated to /feed');
    expect(detail).toHaveTextContent('iPhone 16 Pro');
  });
});

describe('BugReportsInbox wired to the API', () => {
  function wrapper(api: DashboardApiClient) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    });
    return ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <ApiProvider client={api}>{children}</ApiProvider>
      </QueryClientProvider>
    );
  }

  function makeApi(
    initial: BugReportRecord[],
    recorder: {
      update?: (id: string, patch: UpdateBugReportInput) => void;
    },
  ): DashboardApiClient {
    const state = [...initial];
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
      fetchBugReports: vi.fn(async () => state),
      updateBugReport: vi.fn(async (id, patch) => {
        recorder.update?.(id, patch);
        const idx = state.findIndex((r) => r.id === id);
        if (idx === -1) return null;
        const existing = state[idx]!;
        const next: BugReportRecord = { ...existing };
        if (patch.status) next.status = patch.status;
        if (patch.assignee !== undefined) next.assignee = patch.assignee;
        if (patch.title !== undefined) next.title = patch.title;
        if (patch.description !== undefined) next.description = patch.description;
        state[idx] = next;
        return next;
      }),
      fetchSymbolFiles: vi.fn(async () => []),
      uploadSymbolFile: vi.fn(async () => {
        throw new Error('not used');
      }),
      deleteSymbolFile: vi.fn(async () => undefined),
      resolveFrame: vi.fn(async () => {
        throw new Error('not used');
      }),
    };
  }

  test('Assign submits status=assigned + assignee via updateBugReport mutation', async () => {
    const update = vi.fn();
    const api = makeApi([report({ id: 'bug-1', title: 'Shaky UI' })], { update });
    render(<BugReportsInbox />, { wrapper: wrapper(api) });

    await waitFor(() => expect(screen.getByText('Shaky UI')).toBeInTheDocument());

    await userEvent.clear(screen.getByPlaceholderText('assignee'));
    await userEvent.type(screen.getByPlaceholderText('assignee'), 'juba');
    await userEvent.click(screen.getByRole('button', { name: /^assign$/i }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('bug-1', {
        status: 'assigned',
        assignee: 'juba',
      }),
    );
  });

  test('Mark resolved flips status to resolved without touching assignee', async () => {
    const update = vi.fn();
    const api = makeApi([report({ id: 'bug-2', status: 'assigned', assignee: 'juba' })], {
      update,
    });
    render(<BugReportsInbox />, { wrapper: wrapper(api) });

    await waitFor(() => expect(screen.getByText('Shaky UI')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /mark resolved/i }));

    await waitFor(() => expect(update).toHaveBeenCalledWith('bug-2', { status: 'resolved' }));
  });
});
