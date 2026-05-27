import { describe, expect, test } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiProvider } from '@/shared/api/context';
import { createApiClient, type DashboardApiClient } from '@/shared/api/client';
import type { CrashGroupRecord, SessionRecord } from '@/shared/api/types';
import { CommandPalette } from './CommandPalette';

const crashGroups: CrashGroupRecord[] = [
  {
    fingerprint: 'fp-login-npe',
    message: 'NullPointerException in LoginScreen',
    firstSeen: 1,
    lastSeen: 2,
    eventCount: 12,
    sessionCount: 5,
    status: 'new',
  },
];
const sessions: SessionRecord[] = [
  { id: 'sess-ios-1', userId: 'user_ab12', startedAt: 1, platform: 'ios', appVersion: '1.4.0', eventCount: 10, crashCount: 1 },
];

function client(): DashboardApiClient {
  return {
    ...createApiClient({ baseUrl: '' }),
    fetchCrashGroups: async () => crashGroups,
    fetchSessions: async () => sessions,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="path">{location.pathname}</div>;
}

function renderPalette() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = (children: ReactNode) => (
    <QueryClientProvider client={qc}>
      <ApiProvider client={client()}>
        <MemoryRouter initialEntries={['/']}>
          <LocationProbe />
          {children}
        </MemoryRouter>
      </ApiProvider>
    </QueryClientProvider>
  );
  return render(wrapper(<CommandPalette />));
}

function openWithShortcut() {
  fireEvent.keyDown(window, { key: 'k', metaKey: true });
}

describe('CommandPalette', () => {
  test('is hidden until Cmd-K, then opens with a search box', async () => {
    renderPalette();
    expect(screen.queryByRole('dialog', { name: /command palette/i })).not.toBeInTheDocument();
    openWithShortcut();
    expect(await screen.findByRole('dialog', { name: /command palette/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });

  test('Escape closes it', async () => {
    renderPalette();
    openWithShortcut();
    await screen.findByRole('dialog', { name: /command palette/i });
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /command palette/i })).not.toBeInTheDocument(),
    );
  });

  test('typing filters to a matching crash', async () => {
    renderPalette();
    openWithShortcut();
    const input = await screen.findByLabelText('Search');
    await userEvent.type(input, 'login');
    expect(await screen.findByText('NullPointerException in LoginScreen')).toBeInTheDocument();
  });

  test('arrow-down + Enter navigates to the selected destination', async () => {
    renderPalette();
    openWithShortcut();
    const input = await screen.findByLabelText('Search');
    // Empty query lists nav destinations; first is Overview ("/"). Move to the
    // second (Crashes → /crashes) and open it.
    await screen.findByRole('option', { name: /Overview/i });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/crashes'));
    // …and the palette closed on select.
    expect(screen.queryByRole('dialog', { name: /command palette/i })).not.toBeInTheDocument();
  });

  test('clicking a crash result navigates to its detail route', async () => {
    renderPalette();
    openWithShortcut();
    const input = await screen.findByLabelText('Search');
    await userEvent.type(input, 'login');
    await userEvent.click(await screen.findByText('NullPointerException in LoginScreen'));
    await waitFor(() =>
      expect(screen.getByTestId('path')).toHaveTextContent('/crashes/fp-login-npe'),
    );
  });
});
