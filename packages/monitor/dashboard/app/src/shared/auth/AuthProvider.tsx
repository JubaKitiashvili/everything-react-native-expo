import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useApi } from '@/shared/api/useApi';
import type { AuthUser } from '@/shared/api/client';
import { AuthContext, type AuthStatus } from './AuthContext';
import * as tokenStore from './tokenStore';

/**
 * Owns the dashboard session. On mount it asks the server `GET /api/auth/me`:
 *   - `enforcing: false` → login-free mode; the synthetic Owner is the user.
 *   - `enforcing: true` + a stored token that verifies → authenticated.
 *   - otherwise → unauthenticated (the guard sends the user to /login).
 *
 * The API client (wired in main.tsx) reads the token from `tokenStore` and
 * calls `tokenStore.handleUnauthorized()` on any 401, which clears the token
 * and notifies here so an expired session logs out immediately.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [enforcing, setEnforcing] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const me = await api.fetchMe();
        if (cancelled) return;
        setEnforcing(me.enforcing);
        if (!me.enforcing) {
          setUser(me.user); // synthetic Owner — login-free
          setStatus('authenticated');
        } else if (tokenStore.getToken()) {
          setUser(me.user);
          setStatus('authenticated');
        } else {
          setUser(null);
          setStatus('unauthenticated');
        }
      } catch {
        if (cancelled) return;
        // 401 / network → treat as enforcing + unauthenticated.
        setEnforcing(true);
        setUser(null);
        setStatus('unauthenticated');
      }
    })();

    // Token cleared out from under us (expiry / 401 side-channel) → log out.
    const unsubscribe = tokenStore.subscribe(() => {
      if (cancelled) return;
      if (tokenStore.getToken() === null) {
        setUser(null);
        setStatus('unauthenticated');
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [api]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { token, user: loggedIn } = await api.login(email, password);
      tokenStore.setToken(token);
      setEnforcing(true);
      setUser(loggedIn);
      setStatus('authenticated');
    },
    [api],
  );

  const logout = useCallback(() => {
    tokenStore.clearToken();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  return (
    <AuthContext.Provider value={{ status, enforcing, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
