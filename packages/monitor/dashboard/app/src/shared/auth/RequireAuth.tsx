import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import styles from './RequireAuth.module.css';

/**
 * Route guard for the authenticated app. While the initial session check is
 * in flight it shows a splash; an unauthenticated caller (RBAC enforcing, no
 * valid token) is redirected to /login with the attempted location so login
 * can return there. In login-free mode every caller is authenticated.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className={styles.splash} role="status" aria-label="Loading session">
        <span className={styles.spinner} aria-hidden="true" />
        <span className={styles.label}>Loading…</span>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}
