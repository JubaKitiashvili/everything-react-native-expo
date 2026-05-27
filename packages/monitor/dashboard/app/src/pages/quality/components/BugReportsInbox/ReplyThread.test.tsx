import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '@/shared/api/context';
import { createApiClient, type DashboardApiClient } from '@/shared/api/client';
import { AuthContext, type AuthState } from '@/shared/auth/AuthContext';
import type { AuthRole } from '@/shared/api/client';
import type { BugReportReply } from '@/shared/api/types';
import { ReplyThread } from './ReplyThread';

function authAs(role: AuthRole): AuthState {
  return {
    status: 'authenticated',
    enforcing: true,
    user: { id: 'me', email: 'op@acme.io', role, tenantId: 't' },
    login: async () => undefined,
    logout: () => undefined,
  };
}

function makeClient(over: Partial<DashboardApiClient>): DashboardApiClient {
  return { ...createApiClient({ baseUrl: '' }), ...over };
}

function renderThread(client: DashboardApiClient, role: AuthRole = 'member') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  const wrapper = (children: ReactNode) => (
    <QueryClientProvider client={qc}>
      <ApiProvider client={client}>
        <AuthContext.Provider value={authAs(role)}>{children}</AuthContext.Provider>
      </ApiProvider>
    </QueryClientProvider>
  );
  return render(wrapper(<ReplyThread reportId="rep-1" now={1_000_000} />));
}

const THREAD: BugReportReply[] = [
  { id: 'r1', reportId: 'rep-1', author: 'op@acme.io', authorRole: 'operator', body: 'What OS?', createdAt: 1000 },
  { id: 'r2', reportId: 'rep-1', author: 'reporter', authorRole: 'reporter', body: 'iOS 18.2', createdAt: 2000 },
];

describe('ReplyThread', () => {
  test('renders the conversation: operator author + "Reporter" label', async () => {
    const client = makeClient({ fetchBugReportReplies: vi.fn(async () => THREAD) });
    renderThread(client);
    expect(await screen.findByText('What OS?')).toBeInTheDocument();
    expect(screen.getByText('iOS 18.2')).toBeInTheDocument();
    expect(screen.getByText('op@acme.io')).toBeInTheDocument();
    expect(screen.getByText('Reporter')).toBeInTheDocument();
  });

  test('empty thread shows the no-replies hint', async () => {
    const client = makeClient({ fetchBugReportReplies: vi.fn(async () => []) });
    renderThread(client);
    expect(await screen.findByText(/no replies yet/i)).toBeInTheDocument();
  });

  test('member can post a reply → calls addBugReportReply then refetches', async () => {
    const fetchBugReportReplies = vi.fn(async () => [] as BugReportReply[]);
    const addBugReportReply = vi.fn(async () => THREAD[0]!);
    const client = makeClient({ fetchBugReportReplies, addBugReportReply });
    renderThread(client, 'member');

    await screen.findByText(/no replies yet/i);
    await userEvent.type(screen.getByLabelText('Reply body'), 'Thanks for the report');
    await userEvent.click(screen.getByRole('button', { name: /reply/i }));

    await waitFor(() =>
      expect(addBugReportReply).toHaveBeenCalledWith('rep-1', 'Thanks for the report'),
    );
    // Invalidation triggers a refetch (initial + post-reply).
    await waitFor(() => expect(fetchBugReportReplies.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  test('viewer sees the thread but NOT the composer', async () => {
    const client = makeClient({ fetchBugReportReplies: vi.fn(async () => THREAD) });
    renderThread(client, 'viewer');
    expect(await screen.findByText('What OS?')).toBeInTheDocument();
    expect(screen.queryByLabelText('Reply body')).not.toBeInTheDocument();
    expect(screen.getByText(/member access is required/i)).toBeInTheDocument();
  });

  test('a failed reply surfaces an error', async () => {
    const client = makeClient({
      fetchBugReportReplies: vi.fn(async () => []),
      addBugReportReply: vi.fn(async () => {
        throw new Error('403');
      }),
    });
    renderThread(client, 'member');
    await screen.findByText(/no replies yet/i);
    await userEvent.type(screen.getByLabelText('Reply body'), 'oops');
    await userEvent.click(screen.getByRole('button', { name: /reply/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not send/i);
  });
});
