import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '@/shared/api/context';
import { QualityPage } from './QualityPage';

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ApiProvider baseUrl="">
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/quality" element={<QualityPage />} />
          </Routes>
        </MemoryRouter>
      </ApiProvider>
    </QueryClientProvider>,
  );
}

describe('QualityPage', () => {
  it('renders the alerts, bug reports, frustration, and pattern library panels', () => {
    renderAt('/quality');
    expect(screen.getByRole('heading', { name: /alerts console/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /bug reports/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /error taps/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /pattern library/i })).toBeInTheDocument();
  });
});
