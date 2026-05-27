import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Panel } from '@/shared/ui/Panel/Panel';
import { useApi } from '@/shared/api/useApi';
import { useAuth } from '@/shared/auth/useAuth';
import type { AuthRole, AuthUser } from '@/shared/api/client';
import { roleLabel } from '@/shared/auth/roles';
import styles from './UserManagement.module.css';

const ROLES: AuthRole[] = ['owner', 'member', 'viewer'];

const DESCRIPTION =
  'Who can sign in and what they can do. Owner = full control; Member = operational writes (resolve, ack, status); Viewer = read-only.';

/**
 * Owner-only user administration (Task 117.18). Renders inside <RequireRole
 * role="owner">. In login-free (dormant) mode it doubles as the bootstrap:
 * creating the first user turns RBAC on — after which everyone, including the
 * creator, must sign in (the next request 401s and the app redirects to login).
 */
export function UserManagement() {
  const api = useApi();
  const { enforcing } = useAuth();
  const [users, setUsers] = useState<AuthUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AuthRole>('member');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setUsers(await api.fetchUsers());
    } catch {
      setUsers([]);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.registerUser({ email: email.trim(), password, role });
      setEmail('');
      setPassword('');
      await load();
    } catch {
      setError('Could not create user — the email may be taken or the password is too short.');
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (id: string, next: AuthRole) => {
    setError(null);
    try {
      await api.setUserRole(id, next);
      await load();
    } catch {
      setError('Could not change role — you cannot demote the last owner.');
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await api.deleteUser(id);
      await load();
    } catch {
      setError('Could not remove user — you cannot remove the last owner.');
    }
  };

  return (
    <Panel title="Users & access" description={DESCRIPTION}>
      {!enforcing ? (
        <p className={styles.hint}>
          Authentication is off. Create the first user to enable sign-in — everyone (including you)
          will then need to log in.
        </p>
      ) : null}

      <form className={styles.createForm} onSubmit={onCreate} aria-label="Create user">
        <input
          className={styles.input}
          aria-label="New user email"
          type="email"
          placeholder="email@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className={styles.input}
          aria-label="New user password"
          type="password"
          placeholder="password (min 8)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
        <select
          className={styles.select}
          aria-label="New user role"
          value={role}
          onChange={(e) => setRole(e.target.value as AuthRole)}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </select>
        <button className={styles.button} type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Add user'}
        </button>
      </form>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {users === null ? (
        <p className={styles.hint}>Loading users…</p>
      ) : users.length === 0 ? (
        <p className={styles.hint}>No users yet.</p>
      ) : (
        <table className={styles.table} aria-label="Users">
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <th scope="row" className={styles.emailCell}>
                  {u.email}
                </th>
                <td>
                  <select
                    className={styles.select}
                    aria-label={`Role for ${u.email}`}
                    value={u.role}
                    onChange={(e) => void changeRole(u.id, e.target.value as AuthRole)}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    className={styles.remove}
                    type="button"
                    onClick={() => void remove(u.id)}
                    aria-label={`Remove ${u.email}`}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
