import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '@/shared/api/context';
import { AnrsPage } from './AnrsPage';

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ApiProvider baseUrl="">
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/anrs" element={<AnrsPage />} />
            <Route path="/anrs/:id" element={<AnrsPage />} />
          </Routes>
        </MemoryRouter>
      </ApiProvider>
    </QueryClientProvider>,
  );
}

describe('AnrsPage', () => {
  it('renders the ANR inspector panel at /anrs', () => {
    renderAt('/anrs');
    expect(screen.getByRole('heading', { name: /anr inspector/i })).toBeInTheDocument();
  });

  it('still renders at /anrs/:id (route resolves with a seeded instance id)', () => {
    renderAt('/anrs/some-id');
    // With no seeded data the instance won't be found, so the overview
    // heading is shown — we're asserting the deep-link route resolves
    // without crashing.
    expect(screen.getByRole('heading', { name: /anr inspector/i })).toBeInTheDocument();
  });
});
