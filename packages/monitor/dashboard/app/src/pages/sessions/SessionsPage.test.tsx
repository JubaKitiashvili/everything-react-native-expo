import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '@/shared/api/context';
import { useUiStore, resetUiStore } from '@/shared/store/uiStore';
import { SessionsPage } from './SessionsPage';

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ApiProvider baseUrl="">
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/sessions/:id" element={<SessionsPage />} />
          </Routes>
        </MemoryRouter>
      </ApiProvider>
    </QueryClientProvider>,
  );
}

describe('SessionsPage', () => {
  beforeEach(() => resetUiStore());

  it('renders the session replay and device switcher panels', () => {
    renderAt('/sessions');
    expect(screen.getByRole('heading', { name: /session replay/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /device switcher/i })).toBeInTheDocument();
  });

  it('seeds the selected session from the :id route param', () => {
    renderAt('/sessions/sess-xyz');
    expect(useUiStore.getState().selectedSessionId).toBe('sess-xyz');
  });

  it('does not force a selection on the plain /sessions route', () => {
    renderAt('/sessions');
    // SessionReplay may auto-select once data loads, but with no data in the
    // test the route itself must not seed a session.
    expect(useUiStore.getState().selectedSessionId).toBeNull();
  });
});
