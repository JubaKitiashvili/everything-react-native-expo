import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { ApiProvider } from '@/shared/api/context';
import { createApiClient, type DashboardApiClient, type MeResponse } from '@/shared/api/client';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';
import * as tokenStore from './tokenStore';

/** Build a client whose auth methods are scripted; data methods are inert. */
function makeClient(overrides: Partial<DashboardApiClient>): DashboardApiClient {
  return { ...createApiClient({ baseUrl: '' }), ...overrides };
}

function wrap(client: DashboardApiClient) {
  return ({ children }: { children: ReactNode }) => (
    <ApiProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </ApiProvider>
  );
}

/** Probe component surfacing the auth state as text. */
function Probe() {
  const { status, enforcing, user } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="enforcing">{String(enforcing)}</span>
      <span data-testid="user">{user?.email ?? 'none'}</span>
      <span data-testid="role">{user?.role ?? 'none'}</span>
    </div>
  );
}

const DORMANT: MeResponse = {
  enforcing: false,
  user: { id: 'system', email: 'system@localhost', role: 'owner', tenantId: 'default' },
};

beforeEach(() => {
  tokenStore.__resetForTests();
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});
afterEach(() => {
  tokenStore.__resetForTests();
});

describe('AuthProvider', () => {
  test('dormant mode → authenticated as the synthetic Owner, login-free', async () => {
    const client = makeClient({ fetchMe: async () => DORMANT });
    render(<Probe />, { wrapper: wrap(client) });

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('enforcing')).toHaveTextContent('false');
    expect(screen.getByTestId('role')).toHaveTextContent('owner');
  });

  test('enforcing + no token → unauthenticated', async () => {
    const client = makeClient({
      fetchMe: async () => {
        throw new Error('401'); // server 401s an anonymous /me when enforcing
      },
    });
    render(<Probe />, { wrapper: wrap(client) });

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    expect(screen.getByTestId('enforcing')).toHaveTextContent('true');
    expect(screen.getByTestId('user')).toHaveTextContent('none');
  });

  test('enforcing + stored token → authenticated as that user', async () => {
    tokenStore.setToken('a.valid.jwt');
    const client = makeClient({
      fetchMe: async () => ({
        enforcing: true,
        user: { id: 'usr_1', email: 'dev@acme.io', role: 'member', tenantId: 'tnt_1' },
      }),
    });
    render(<Probe />, { wrapper: wrap(client) });

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('member');
    expect(screen.getByTestId('user')).toHaveTextContent('dev@acme.io');
  });

  test('login stores the token + flips to authenticated', async () => {
    const login = vi.fn(async () => ({
      token: 'fresh.jwt.token',
      user: { id: 'usr_9', email: 'owner@acme.io', role: 'owner' as const, tenantId: 'tnt_1' },
    }));
    const client = makeClient({
      fetchMe: async () => {
        throw new Error('401');
      },
      login,
    });

    function LoginProbe() {
      const { status, login: doLogin } = useAuth();
      return (
        <div>
          <span data-testid="status">{status}</span>
          <button onClick={() => void doLogin('owner@acme.io', 'pw')}>go</button>
        </div>
      );
    }
    render(<LoginProbe />, { wrapper: wrap(client) });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));

    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(login).toHaveBeenCalledWith('owner@acme.io', 'pw');
    expect(tokenStore.getToken()).toBe('fresh.jwt.token');
  });

  test('a 401 side-channel (token cleared) logs the user out', async () => {
    tokenStore.setToken('soon.to.expire');
    const client = makeClient({
      fetchMe: async () => ({
        enforcing: true,
        user: { id: 'usr_1', email: 'dev@acme.io', role: 'viewer', tenantId: 'tnt_1' },
      }),
    });
    render(<Probe />, { wrapper: wrap(client) });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    // Simulate the client's onUnauthorized firing on a later 401.
    tokenStore.handleUnauthorized();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    expect(screen.getByTestId('user')).toHaveTextContent('none');
  });
});
