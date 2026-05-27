import { Outlet } from 'react-router-dom';
import { useUiStore, type RealtimeStatus } from '@/shared/store/uiStore';
import { useAuth } from '@/shared/auth/useAuth';
import { roleLabel } from '@/shared/auth/roles';
import { Sidebar } from './Sidebar';
import styles from './AppShell.module.css';

const STATUS_LABEL: Record<RealtimeStatus, string> = {
  idle: 'Idle',
  connecting: 'Connecting…',
  open: 'Live',
  closed: 'Disconnected',
  error: 'Error',
};

/** Compose the dot class for a status (CSS-module classes are `string | undefined`). */
function statusDotClass(status: RealtimeStatus): string {
  const modifier: Record<RealtimeStatus, string | undefined> = {
    idle: undefined,
    connecting: styles.statusConnecting,
    open: styles.statusOpen,
    closed: styles.statusClosed,
    error: styles.statusError,
  };
  return [styles.statusDot, modifier[status]].filter(Boolean).join(' ');
}

/**
 * Persistent layout route: primary sidebar + header chrome wrapping the
 * active page in <Outlet/>. Mounted once for the app lifetime, so page
 * navigation never tears down the realtime socket or the sidebar.
 */
export function AppShell() {
  const status = useUiStore((s) => s.realtimeStatus);
  const { enforcing, user, logout } = useAuth();

  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.body}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.brandMark}>●</span>
            <span className={styles.brandName}>@erne/monitor</span>
            <span className={styles.brandVersion}>v0.1.0</span>
          </div>
          <div className={styles.headerRight}>
            <span
              className={styles.status}
              role="status"
              aria-label={`Realtime: ${STATUS_LABEL[status]}`}
            >
              <span className={statusDotClass(status)} aria-hidden="true" />
              {STATUS_LABEL[status]}
            </span>
            {enforcing && user ? (
              <span className={styles.userChip} aria-label="Current user">
                <span className={styles.userEmail}>{user.email}</span>
                <span className={styles.rolePill}>{roleLabel(user.role)}</span>
                <button type="button" className={styles.logout} onClick={logout}>
                  Sign out
                </button>
              </span>
            ) : null}
          </div>
        </header>
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
