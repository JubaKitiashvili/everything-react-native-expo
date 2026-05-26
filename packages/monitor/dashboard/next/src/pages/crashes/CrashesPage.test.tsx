import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '@/shared/api/context';
import { useUiStore, resetUiStore } from '@/shared/store/uiStore';
import { CrashesPage } from './CrashesPage';

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ApiProvider baseUrl="">
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/crashes" element={<CrashesPage />} />
            <Route path="/crashes/:fingerprint" element={<CrashesPage />} />
          </Routes>
        </MemoryRouter>
      </ApiProvider>
    </QueryClientProvider>,
  );
}

describe('CrashesPage', () => {
  beforeEach(() => resetUiStore());

  it('renders the crash explorer, symbolication, and breadcrumb panels', () => {
    renderAt('/crashes');
    expect(screen.getByRole('heading', { name: /crash explorer/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /symbolication/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /breadcrumb timeline/i })).toBeInTheDocument();
  });

  it('seeds the selected crash group from the :fingerprint route param', () => {
    renderAt('/crashes/fp-test-123');
    expect(useUiStore.getState().selectedCrashFingerprint).toBe('fp-test-123');
  });

  it('does not force a selection on the plain /crashes route', () => {
    renderAt('/crashes');
    // CrashExplorer may auto-select once data loads, but with no data in the
    // test the route itself must not seed a fingerprint.
    expect(useUiStore.getState().selectedCrashFingerprint).toBeNull();
  });
});
