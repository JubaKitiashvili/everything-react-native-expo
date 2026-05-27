import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthContext, type AuthState, type AuthStatus } from '@/shared/auth/AuthContext';
import { LoginPage } from './LoginPage';

function renderLogin(state: Partial<AuthState>, initialPath = '/login') {
  const value: AuthState = {
    status: (state.status ?? 'unauthenticated') as AuthStatus,
    enforcing: true,
    user: state.user ?? null,
    login: state.login ?? (async () => undefined),
    logout: state.logout ?? (() => undefined),
  };
  const Home = () => <div>overview-home</div>;
  const wrapper = (children: ReactNode) => (
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={children} />
          <Route path="/" element={<Home />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
  return render(wrapper(<LoginPage />));
}

describe('LoginPage', () => {
  test('renders the sign-in form', () => {
    renderLogin({});
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  test('submitting valid credentials calls login', async () => {
    const login = vi.fn(async () => undefined);
    renderLogin({ login });
    await userEvent.type(screen.getByLabelText(/email/i), 'owner@acme.io');
    await userEvent.type(screen.getByLabelText(/password/i), 'hunter2pass');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(login).toHaveBeenCalledWith('owner@acme.io', 'hunter2pass');
  });

  test('a failed login shows an error message', async () => {
    const login = vi.fn(async () => {
      throw new Error('invalid_credentials');
    });
    renderLogin({ login });
    await userEvent.type(screen.getByLabelText(/email/i), 'owner@acme.io');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid email or password/i);
  });

  test('already authenticated → redirects away from /login', () => {
    renderLogin({ status: 'authenticated', user: { id: 'u', email: 'a@b.io', role: 'owner', tenantId: 't' } });
    expect(screen.getByText('overview-home')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /sign in/i })).not.toBeInTheDocument();
  });
});
