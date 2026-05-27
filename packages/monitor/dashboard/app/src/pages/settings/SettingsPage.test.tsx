import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '@/shared/api/context';
import { AuthContext, type AuthState } from '@/shared/auth/AuthContext';
import { SettingsPage } from './SettingsPage';

const OWNER_AUTH: AuthState = {
  status: 'authenticated',
  enforcing: false,
  user: { id: 'system', email: 'system@localhost', role: 'owner', tenantId: 'default' },
  login: async () => undefined,
  logout: () => undefined,
};

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ApiProvider baseUrl="">
        <AuthContext.Provider value={OWNER_AUTH}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </ApiProvider>
    </QueryClientProvider>,
  );
}

describe('SettingsPage', () => {
  it('renders the onboarding, settings, consent, and replay masker panels', () => {
    renderAt('/settings');
    expect(screen.getByRole('heading', { name: /welcome to erne monitor/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^settings$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /consent & privacy/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /replay masker/i })).toBeInTheDocument();
  });
});
