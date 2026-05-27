import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '@/shared/api/context';
import { createApiClient, type DashboardApiClient } from '@/shared/api/client';
import { AuthProvider } from '@/shared/auth/AuthProvider';
import * as tokenStore from '@/shared/auth/tokenStore';
import { RealtimeProvider } from '@/realtime/RealtimeProvider';
import { resetUiStore } from '@/shared/store/uiStore';
import { AppRoutes } from './routes';

const NAV_LABELS = ['Overview', 'Crashes', 'ANRs', 'Performance', 'Sessions', 'Quality', 'Settings'];

/**
 * Real client for data fetches (queries fail in jsdom → empty states, which
 * these structural assertions tolerate) but with `fetchMe` pinned to the
 * dormant / login-free response so the auth guard renders the shell rather
 * than redirecting to /login.
 */
function dormantClient(): DashboardApiClient {
  return {
    ...createApiClient({ baseUrl: '' }),
    fetchMe: async () => ({
      enforcing: false,
      user: { id: 'system', email: 'system@localhost', role: 'owner', tenantId: 'default' },
    }),
  };
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ApiProvider client={dormantClient()}>
        <AuthProvider>
          {/* enabled=false: no socket needed for routing/structure assertions */}
          <RealtimeProvider url="ws://test/ws/subscribe" enabled={false}>
            <MemoryRouter initialEntries={[path]}>
              <AppRoutes />
            </MemoryRouter>
          </RealtimeProvider>
        </AuthProvider>
      </ApiProvider>
    </QueryClientProvider>,
  );
}

describe('AppRoutes + AppShell', () => {
  beforeEach(() => {
    resetUiStore();
    tokenStore.__resetForTests();
  });

  it('renders all 7 primary nav links in the sidebar', async () => {
    renderAt('/');
    // Await the async session resolution → shell renders past the splash.
    expect(await screen.findByRole('link', { name: 'Overview' })).toBeInTheDocument();
    for (const name of NAV_LABELS) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
  });

  it('renders the Overview page at "/"', async () => {
    renderAt('/');
    expect(await screen.findByText('Crashes / 24h')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /live feed/i })).toBeInTheDocument();
  });

  it('marks the active route in the sidebar (aria-current)', async () => {
    renderAt('/');
    expect(await screen.findByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Crashes' })).not.toHaveAttribute('aria-current');
  });

  it('redirects unknown routes back to Overview', async () => {
    renderAt('/this-route-does-not-exist-yet');
    expect(await screen.findByText('Crashes / 24h')).toBeInTheDocument();
  });

  it('exposes the realtime status region in the header', async () => {
    renderAt('/');
    // Scope to the header's realtime status (aria-label "Realtime: …") to
    // avoid the auth splash + transient panel loaders that also use role=status.
    expect(await screen.findByRole('status', { name: /realtime/i })).toBeInTheDocument();
  });
});
