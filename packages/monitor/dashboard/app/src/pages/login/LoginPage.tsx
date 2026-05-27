import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/shared/auth/useAuth';
import styles from './LoginPage.module.css';

interface LocationState {
  from?: string;
}

/**
 * Standalone login screen (rendered outside the AppShell). Shown by the route
 * guard when RBAC is enforcing and the visitor has no valid session. On
 * success the auth state flips to authenticated and we redirect to the page
 * the visitor originally tried to reach (or the overview).
 */
export function LoginPage() {
  const { status, login } = useAuth();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in (or login-free mode) → bounce to the app.
  if (status === 'authenticated') {
    return <Navigate to={from} replace />;
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      // Redirect handled by the `status === 'authenticated'` branch on re-render.
    } catch {
      setError('Invalid email or password.');
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.screen}>
      <form className={styles.card} onSubmit={onSubmit} aria-label="Sign in">
        <div className={styles.brand}>
          <span className={styles.brandMark}>●</span>
          <span className={styles.brandName}>@erne/monitor</span>
        </div>
        <h1 className={styles.heading}>Sign in</h1>

        <label className={styles.field}>
          <span className={styles.label}>Email</span>
          <input
            className={styles.input}
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Password</span>
          <input
            className={styles.input}
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <button className={styles.submit} type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
