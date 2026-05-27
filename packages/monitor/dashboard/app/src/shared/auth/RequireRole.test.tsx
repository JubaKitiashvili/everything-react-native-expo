import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { AuthRole, AuthUser } from '@/shared/api/client';
import { AuthContext, type AuthState } from './AuthContext';
import { RequireRole } from './RequireRole';

function withRole(role: AuthRole, children: ReactNode) {
  const user: AuthUser = { id: 'u', email: 'u@x.io', role, tenantId: 't' };
  const value: AuthState = {
    status: 'authenticated',
    enforcing: true,
    user,
    login: async () => undefined,
    logout: () => undefined,
  };
  return render(<AuthContext.Provider value={value}>{children}</AuthContext.Provider>);
}

describe('RequireRole', () => {
  test('owner sees owner-gated content', () => {
    withRole('owner', <RequireRole role="owner">admin</RequireRole>);
    expect(screen.getByText('admin')).toBeInTheDocument();
  });

  test('viewer does not see owner-gated content (renders fallback)', () => {
    withRole(
      'viewer',
      <RequireRole role="owner" fallback={<span>denied</span>}>
        admin
      </RequireRole>,
    );
    expect(screen.queryByText('admin')).not.toBeInTheDocument();
    expect(screen.getByText('denied')).toBeInTheDocument();
  });

  test('member sees member-gated but not owner-gated content', () => {
    withRole(
      'member',
      <>
        <RequireRole role="member">op</RequireRole>
        <RequireRole role="owner">admin</RequireRole>
      </>,
    );
    expect(screen.getByText('op')).toBeInTheDocument();
    expect(screen.queryByText('admin')).not.toBeInTheDocument();
  });
});
