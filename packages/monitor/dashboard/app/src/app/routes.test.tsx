import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '@/shared/api/context';
import { RealtimeProvider } from '@/realtime/RealtimeProvider';
import { resetUiStore } from '@/shared/store/uiStore';
import { AppRoutes } from './routes';

const NAV_LABELS = ['Overview', 'Crashes', 'ANRs', 'Performance', 'Sessions', 'Quality', 'Settings'];

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ApiProvider baseUrl="">
        {/* enabled=false: no socket needed for routing/structure assertions */}
        <RealtimeProvider url="ws://test/ws/subscribe" enabled={false}>
          <MemoryRouter initialEntries={[path]}>
            <AppRoutes />
          </MemoryRouter>
        </RealtimeProvider>
      </ApiProvider>
    </QueryClientProvider>,
  );
}

describe('AppRoutes + AppShell', () => {
  beforeEach(() => resetUiStore());

  it('renders all 7 primary nav links in the sidebar', () => {
    renderAt('/');
    for (const name of NAV_LABELS) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
  });

  it('renders the Overview page at "/"', () => {
    renderAt('/');
    expect(screen.getByText('Crashes / 24h')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /live feed/i })).toBeInTheDocument();
  });

  it('marks the active route in the sidebar (aria-current)', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Crashes' })).not.toHaveAttribute('aria-current');
  });

  it('redirects unknown routes back to Overview', () => {
    renderAt('/this-route-does-not-exist-yet');
    expect(screen.getByText('Crashes / 24h')).toBeInTheDocument();
  });

  it('exposes the realtime status region in the header', () => {
    renderAt('/');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
