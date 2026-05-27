import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { ApiProvider } from '@/shared/api/context';
import { createApiClient, type AuthUser, type DashboardApiClient } from '@/shared/api/client';
import { AuthContext, type AuthState } from '@/shared/auth/AuthContext';
import { UserManagement } from './UserManagement';

function makeClient(overrides: Partial<DashboardApiClient>): DashboardApiClient {
  return { ...createApiClient({ baseUrl: '' }), ...overrides };
}

function wrap(client: DashboardApiClient, enforcing = true) {
  const value: AuthState = {
    status: 'authenticated',
    enforcing,
    user: { id: 'me', email: 'owner@acme.io', role: 'owner', tenantId: 't' },
    login: async () => undefined,
    logout: () => undefined,
  };
  return ({ children }: { children: ReactNode }) => (
    <ApiProvider client={client}>
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    </ApiProvider>
  );
}

const USERS: AuthUser[] = [
  { id: 'usr_1', email: 'owner@acme.io', role: 'owner', tenantId: 't' },
  { id: 'usr_2', email: 'dev@acme.io', role: 'member', tenantId: 't' },
];

describe('UserManagement', () => {
  test('lists existing users with their roles', async () => {
    const client = makeClient({ fetchUsers: vi.fn(async () => USERS) });
    render(<UserManagement />, { wrapper: wrap(client) });
    expect(await screen.findByText('dev@acme.io')).toBeInTheDocument();
    expect(screen.getByText('owner@acme.io')).toBeInTheDocument();
    expect((screen.getByLabelText('Role for dev@acme.io') as HTMLSelectElement).value).toBe('member');
  });

  test('creating a user calls registerUser then refetches', async () => {
    const registerUser = vi.fn(async () => USERS[1]!);
    const fetchUsers = vi.fn(async () => USERS);
    const client = makeClient({ fetchUsers, registerUser });
    render(<UserManagement />, { wrapper: wrap(client) });
    await screen.findByText('owner@acme.io');

    await userEvent.type(screen.getByLabelText('New user email'), 'new@acme.io');
    await userEvent.type(screen.getByLabelText('New user password'), 'longenough1');
    await userEvent.selectOptions(screen.getByLabelText('New user role'), 'viewer');
    await userEvent.click(screen.getByRole('button', { name: /add user/i }));

    await waitFor(() =>
      expect(registerUser).toHaveBeenCalledWith({
        email: 'new@acme.io',
        password: 'longenough1',
        role: 'viewer',
      }),
    );
    expect(fetchUsers).toHaveBeenCalledTimes(2); // initial + post-create refetch
  });

  test('changing a role calls setUserRole', async () => {
    const setUserRole = vi.fn(async () => undefined);
    const client = makeClient({ fetchUsers: vi.fn(async () => USERS), setUserRole });
    render(<UserManagement />, { wrapper: wrap(client) });
    await screen.findByText('dev@acme.io');

    await userEvent.selectOptions(screen.getByLabelText('Role for dev@acme.io'), 'owner');
    await waitFor(() => expect(setUserRole).toHaveBeenCalledWith('usr_2', 'owner'));
  });

  test('a failed delete (last owner) surfaces an error', async () => {
    const deleteUser = vi.fn(async () => {
      throw new Error('409 last-owner');
    });
    const client = makeClient({ fetchUsers: vi.fn(async () => [USERS[0]!]), deleteUser });
    render(<UserManagement />, { wrapper: wrap(client) });
    await screen.findByText('owner@acme.io');

    await userEvent.click(screen.getByRole('button', { name: /remove owner@acme.io/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/last owner/i);
  });

  test('login-free mode shows the bootstrap hint', async () => {
    const client = makeClient({ fetchUsers: vi.fn(async () => []) });
    render(<UserManagement />, { wrapper: wrap(client, false) });
    expect(await screen.findByText(/authentication is off/i)).toBeInTheDocument();
  });
});
