import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '@/shared/api/context';
import type { DashboardApiClient, SaveAlertRuleInput } from '@/shared/api/client';
import type { AlertRuleRecord } from '@/shared/api/types';
import { AlertsConsole } from './AlertsConsole';

const NOW = 1_770_000_000_000;

function rule(partial: Partial<AlertRuleRecord>): AlertRuleRecord {
  return {
    id: partial.id ?? 'rule_default',
    name: partial.name ?? 'Crash spike',
    metric: partial.metric ?? 'crash_count',
    threshold: partial.threshold ?? 5,
    windowSeconds: partial.windowSeconds ?? 300,
    channels: partial.channels ?? ['slack'],
    cooldownSeconds: partial.cooldownSeconds ?? 300,
    enabled: partial.enabled ?? true,
    createdAt: partial.createdAt ?? NOW - 10_000,
    updatedAt: partial.updatedAt ?? NOW - 5_000,
  };
}

describe('AlertsConsole (view-only render)', () => {
  test('shows the empty state for both rules and history', () => {
    render(<AlertsConsole rules={[]} history={[]} now={NOW} />);
    expect(screen.getByText(/no rules yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no alerts have fired recently/i)).toBeInTheDocument();
  });

  test('renders existing rules + history entries and highlights disabled rules', () => {
    const rules = [
      rule({ id: 'a', name: 'Crash spike', enabled: true }),
      rule({ id: 'b', name: 'ANR alert', enabled: false, channels: ['email'] }),
    ];
    const history = [
      {
        id: 'fire-1',
        ruleId: 'a',
        firedAt: NOW - 60_000,
        metricValue: 12,
        severity: 'critical' as const,
      },
    ];
    render(<AlertsConsole rules={rules} history={history} now={NOW} />);
    const ruleList = screen.getByLabelText(/alert rule items/i);
    expect(ruleList).toHaveTextContent('Crash spike');
    expect(ruleList).toHaveTextContent('ANR alert');
    expect(ruleList).toHaveTextContent('enabled');
    expect(ruleList).toHaveTextContent('disabled');

    const history$ = screen.getByLabelText(/fired alert history entries/i);
    expect(history$).toHaveTextContent('Crash spike');
    expect(history$).toHaveTextContent('metric value 12');
  });
});

describe('AlertsConsole (wired via QueryClient + ApiProvider)', () => {
  function buildWrapper(api: DashboardApiClient) {
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
    rules: AlertRuleRecord[],
    mutations: {
      onSave?: (input: SaveAlertRuleInput) => void;
      onDelete?: (id: string) => void;
    },
  ): DashboardApiClient {
    const state = [...rules];
    return {
      fetchEvents: vi.fn(async () => []),
      fetchSessions: vi.fn(async () => []),
      fetchCrashGroups: vi.fn(async () => []),
      fetchAlertRules: vi.fn(async () => state),
      saveAlertRule: vi.fn(async (input) => {
        mutations.onSave?.(input);
        const saved: AlertRuleRecord = {
          id: input.id ?? 'rule_new',
          name: input.name,
          metric: input.metric,
          threshold: input.threshold,
          windowSeconds: input.windowSeconds,
          channels: input.channels,
          cooldownSeconds: input.cooldownSeconds ?? 300,
          enabled: input.enabled ?? true,
          createdAt: NOW,
          updatedAt: NOW,
        };
        state.push(saved);
        return saved;
      }),
      deleteAlertRule: vi.fn(async (id) => {
        mutations.onDelete?.(id);
        const idx = state.findIndex((r) => r.id === id);
        if (idx >= 0) state.splice(idx, 1);
      }),
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
    };
  }

  test('submitting the editor POSTs a new rule through the API client', async () => {
    const onSave = vi.fn();
    const api = makeApi([], { onSave });
    const wrapper = buildWrapper(api);
    render(<AlertsConsole />, { wrapper });

    await waitFor(() => expect(screen.getByText(/no rules yet/i)).toBeInTheDocument());

    await userEvent.clear(screen.getByLabelText(/name/i));
    await userEvent.type(screen.getByLabelText(/name/i), 'Crash spike');
    await userEvent.clear(screen.getByLabelText(/threshold/i));
    await userEvent.type(screen.getByLabelText(/threshold/i), '7');
    await userEvent.click(screen.getByRole('button', { name: /create rule/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      name: 'Crash spike',
      threshold: 7,
      metric: 'crash_count',
    });
  });

  test('clicking Delete calls the API and removes the row from the list', async () => {
    const onDelete = vi.fn();
    const api = makeApi([rule({ id: 'rule_kill', name: 'To be deleted' })], { onDelete });
    const wrapper = buildWrapper(api);
    render(<AlertsConsole />, { wrapper });

    await waitFor(() => expect(screen.getByText('To be deleted')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('rule_kill'));
    await waitFor(() => expect(screen.queryByText('To be deleted')).toBeNull());
  });
});
