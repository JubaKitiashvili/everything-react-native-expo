import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '@/shared/api/context';
import { PerformancePage } from './PerformancePage';

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ApiProvider baseUrl="">
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/performance" element={<PerformancePage />} />
          </Routes>
        </MemoryRouter>
      </ApiProvider>
    </QueryClientProvider>,
  );
}

describe('PerformancePage', () => {
  it('renders the performance and network waterfall panels', () => {
    renderAt('/performance');
    expect(screen.getByRole('heading', { name: /performance/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /network waterfall/i })).toBeInTheDocument();
  });
});
