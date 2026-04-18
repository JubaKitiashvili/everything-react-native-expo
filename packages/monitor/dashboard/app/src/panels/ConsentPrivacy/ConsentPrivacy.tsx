import { useState, type FormEvent } from 'react';
import { Panel } from '../../shared/ui/Panel/Panel';
import { Pill } from '../../shared/ui/Pill/Pill';
import { Timestamp } from '../../shared/ui/Timestamp/Timestamp';
import { useApi } from '../../shared/api/useApi';
import type { UserDataExport, UserDataSummary } from '../../shared/api/types';
import styles from './ConsentPrivacy.module.css';

export interface ConsentPrivacyProps {
  /** Override (tests): returning `null` mimics an unknown user. */
  onLookup?: (userId: string) => Promise<UserDataSummary | null>;
  onExport?: (userId: string) => Promise<UserDataExport>;
  onDelete?: (userId: string) => Promise<{ deletedEvents: number }>;
  /** Swap the browser download machinery out in tests. */
  downloader?: (filename: string, body: string) => void;
  now?: number;
}

export function ConsentPrivacy({
  onLookup,
  onExport,
  onDelete,
  downloader,
  now,
}: ConsentPrivacyProps = {}) {
  if (onLookup !== undefined) {
    return (
      <ConsentPrivacyView
        onLookup={onLookup}
        {...(onExport !== undefined ? { onExport } : {})}
        {...(onDelete !== undefined ? { onDelete } : {})}
        {...(downloader !== undefined ? { downloader } : {})}
        {...(now !== undefined ? { now } : {})}
      />
    );
  }
  return <ConsentPrivacyContainer {...(now !== undefined ? { now } : {})} />;
}

function ConsentPrivacyContainer({ now }: { now?: number }) {
  const api = useApi();
  return (
    <ConsentPrivacyView
      onLookup={async (userId) => {
        try {
          return await api.fetchUserSummary(userId);
        } catch {
          return null;
        }
      }}
      onExport={async (userId) => api.exportUserData(userId)}
      onDelete={async (userId) => api.deleteUserData(userId)}
      {...(now !== undefined ? { now } : {})}
    />
  );
}

interface ViewProps extends Required<Pick<ConsentPrivacyProps, 'onLookup'>> {
  onExport?: ConsentPrivacyProps['onExport'];
  onDelete?: ConsentPrivacyProps['onDelete'];
  downloader?: ConsentPrivacyProps['downloader'];
  now?: number;
}

type Status = 'idle' | 'loading' | 'loaded' | 'exporting' | 'deleting';

function defaultDownloader(filename: string, body: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([body], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ConsentPrivacyView({
  onLookup,
  onExport,
  onDelete,
  downloader = defaultDownloader,
  now,
}: ViewProps) {
  const [userId, setUserId] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [summary, setSummary] = useState<UserDataSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);

  const handleLookup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = userId.trim();
    if (!trimmed) return;
    setStatus('loading');
    setError(null);
    setFeedback(null);
    try {
      const result = await onLookup(trimmed);
      setSummary(result);
      setStatus('loaded');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('idle');
    }
  };

  const handleExport = async () => {
    if (!summary || !onExport) return;
    setStatus('exporting');
    setError(null);
    setFeedback(null);
    try {
      const exported = await onExport(summary.userId);
      // Sanitise the userId for the download filename — slashes / dots /
      // control chars would either confuse the OS save dialog or produce
      // accidental path segments on misbehaving browsers.
      const safe = summary.userId.replace(/[^\w.-]/g, '_').slice(0, 120) || 'user';
      downloader(`erne-monitor-${safe}.json`, JSON.stringify(exported, null, 2));
      setStatus('loaded');
      setFeedback(`Exported ${exported.events.length} events.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('loaded');
    }
  };

  const handleDelete = async () => {
    if (!summary || !onDelete) return;
    setStatus('deleting');
    setError(null);
    setFeedback(null);
    try {
      const { deletedEvents } = await onDelete(summary.userId);
      setSummary(null);
      setStatus('idle');
      setFeedback(`Deleted ${deletedEvents} events + sessions for ${summary.userId}.`);
      setPendingDelete(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('loaded');
    }
  };

  return (
    <Panel
      title="Consent & Privacy"
      description="DSAR tooling — look up everything on file for a user, export it, or purge it."
    >
      <form className={styles.lookup} onSubmit={handleLookup}>
        <label className={styles.field}>
          <span>User ID</span>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            aria-label="User ID"
            placeholder="user_abc123"
          />
        </label>
        <button type="submit" className={styles.primary} disabled={status === 'loading'}>
          {status === 'loading' ? 'Loading…' : 'Look up'}
        </button>
      </form>

      {error ? <p className={styles.error}>{error}</p> : null}
      {feedback ? <p className={styles.success}>{feedback}</p> : null}

      {status === 'loaded' && summary === null ? (
        <p className={styles.empty}>No records on file for that user id.</p>
      ) : null}

      {summary ? (
        <div className={styles.card} aria-label={`Consent card for ${summary.userId}`}>
          <header className={styles.cardHeader}>
            <code className={styles.userIdBadge}>{summary.userId}</code>
            <Pill size="sm" severity={summary.crashCount > 0 ? 'critical' : 'info'}>
              {summary.crashCount} crash{summary.crashCount === 1 ? '' : 'es'}
            </Pill>
          </header>

          <dl className={styles.stats}>
            <div>
              <dt>Sessions</dt>
              <dd>{summary.sessionCount}</dd>
            </div>
            <div>
              <dt>Events</dt>
              <dd>{summary.eventCount}</dd>
            </div>
            <div>
              <dt>First seen</dt>
              <dd>
                {summary.firstSeen !== null ? (
                  <Timestamp ts={summary.firstSeen} {...(now !== undefined ? { now } : {})} />
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt>Last seen</dt>
              <dd>
                {summary.lastSeen !== null ? (
                  <Timestamp ts={summary.lastSeen} {...(now !== undefined ? { now } : {})} />
                ) : (
                  '—'
                )}
              </dd>
            </div>
          </dl>

          {summary.eventTypes.length > 0 ? (
            <section aria-label="Event type breakdown" className={styles.categories}>
              <h4 className={styles.subhead}>Category breakdown</h4>
              <ul className={styles.categoryList}>
                {summary.eventTypes.map((row) => (
                  <li key={row.type}>
                    <code>{row.type}</code>
                    <span className={styles.categoryCount}>{row.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <footer className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              onClick={() => {
                void handleExport();
              }}
              disabled={status === 'exporting'}
            >
              {status === 'exporting' ? 'Exporting…' : 'Export user data (JSON)'}
            </button>
            {pendingDelete ? (
              <div className={styles.confirmRow} role="alertdialog" aria-label="Confirm delete">
                <span>Delete all data for {summary.userId}?</span>
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() => {
                    void handleDelete();
                  }}
                  disabled={status === 'deleting'}
                >
                  {status === 'deleting' ? 'Deleting…' : 'Confirm delete'}
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => setPendingDelete(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={styles.danger}
                onClick={() => setPendingDelete(true)}
              >
                Delete user data
              </button>
            )}
          </footer>
        </div>
      ) : null}
    </Panel>
  );
}
