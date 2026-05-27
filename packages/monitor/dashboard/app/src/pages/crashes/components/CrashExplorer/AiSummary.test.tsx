import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { ApiProvider } from '@/shared/api/context';
import { createApiClient, type DashboardApiClient } from '@/shared/api/client';
import type { CrashGroupRecord } from '@/shared/api/types';
import { AiSummary } from './AiSummary';

function makeClient(over: Partial<DashboardApiClient>): DashboardApiClient {
  return { ...createApiClient({ baseUrl: '' }), ...over };
}

function renderSummary(client: DashboardApiClient) {
  const wrapper = (children: ReactNode) => <ApiProvider client={client}>{children}</ApiProvider>;
  const group: CrashGroupRecord = {
    fingerprint: 'fp-1',
    message: 'TypeError: x is undefined',
    firstSeen: 1,
    lastSeen: 2,
    eventCount: 3,
    sessionCount: 1,
    status: 'new',
  };
  return render(wrapper(<AiSummary group={group} latestEvent={null} />));
}

describe('AiSummary', () => {
  test('summarize calls aiComplete and renders the result', async () => {
    const aiComplete = vi.fn(async () => 'Null deref: guard `x` before access.');
    renderSummary(makeClient({ aiComplete }));

    await userEvent.click(screen.getByRole('button', { name: /summarize with ai/i }));
    expect(await screen.findByText(/guard `x` before access/i)).toBeInTheDocument();
    expect(aiComplete).toHaveBeenCalledTimes(1);
    // The prompt is the built AI context (contains the crash message).
    const calls = aiComplete.mock.calls as unknown as string[][];
    expect(calls[0]?.[0] ?? '').toContain('TypeError: x is undefined');
  });

  test('shows a clear hint when the server has no AI provider (501 → not_configured)', async () => {
    const aiComplete = vi.fn(async () => {
      throw new Error('not_configured');
    });
    renderSummary(makeClient({ aiComplete }));
    await userEvent.click(screen.getByRole('button', { name: /summarize with ai/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/aren.t configured/i);
  });

  test('shows a generic error on other failures', async () => {
    const aiComplete = vi.fn(async () => {
      throw new Error('ai_failed_502');
    });
    renderSummary(makeClient({ aiComplete }));
    await userEvent.click(screen.getByRole('button', { name: /summarize with ai/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t generate/i);
  });
});
