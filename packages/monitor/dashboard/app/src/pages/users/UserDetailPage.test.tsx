import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '@/shared/api/context';
import { UserDetailPage } from './UserDetailPage';

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ApiProvider baseUrl="">
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/users/:id" element={<UserDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ApiProvider>
    </QueryClientProvider>,
  );
}

describe('UserDetailPage', () => {
  it('renders the user id from the :id route param', () => {
    renderAt('/users/user_ab12');
    expect(screen.getByRole('heading', { name: 'user_ab12' })).toBeInTheDocument();
  });

  it('renders the KPI tiles', () => {
    renderAt('/users/user_ab12');
    const metrics = within(screen.getByLabelText('User metrics'));
    expect(metrics.getByText('Sessions')).toBeInTheDocument();
    expect(metrics.getByText('Events')).toBeInTheDocument();
    expect(metrics.getByText('Crashes')).toBeInTheDocument();
    expect(metrics.getByText('ANRs')).toBeInTheDocument();
  });

  it('renders the sessions and recent-events panels', () => {
    renderAt('/users/user_ab12');
    expect(screen.getByRole('heading', { name: /sessions/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /recent events/i })).toBeInTheDocument();
  });
});
