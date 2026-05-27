import { createContext } from 'react';
import type { AuthUser } from '@/shared/api/client';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthState {
  status: AuthStatus;
  /**
   * Whether the server enforces RBAC. When false, the dashboard runs
   * login-free and `user` is the synthetic Owner — every action is allowed.
   */
  enforcing: boolean;
  user: AuthUser | null;
  /** Exchange credentials for a session. Rejects on bad credentials. */
  login: (email: string, password: string) => Promise<void>;
  /** Clear the local session. */
  logout: () => void;
}

/**
 * In its own file so the provider component + the `useAuth` hook can live
 * separately without tripping react-refresh's `only-export-components` rule.
 */
export const AuthContext = createContext<AuthState | null>(null);
