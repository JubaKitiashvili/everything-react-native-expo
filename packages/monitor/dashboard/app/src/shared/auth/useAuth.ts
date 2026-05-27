import { useContext } from 'react';
import { AuthContext, type AuthState } from './AuthContext';

/** Resolve auth state from the nearest `<AuthProvider>`. Throws if absent. */
export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('[@erne/monitor] useAuth() must be used inside <AuthProvider>.');
  }
  return value;
}
