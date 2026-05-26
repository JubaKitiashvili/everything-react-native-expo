import type { SessionRecord } from '@/shared/api/types';
import { Timestamp } from '@/shared/ui/Timestamp/Timestamp';
import styles from './SessionList.module.css';

export interface SessionListProps {
  sessions: SessionRecord[];
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
  now?: number;
}

export function SessionList({ sessions, selectedSessionId, onSelect, now }: SessionListProps) {
  if (sessions.length === 0) {
    return <p className={styles.empty}>No sessions yet.</p>;
  }
  return (
    <ol className={styles.list} aria-label="Sessions with replay">
      {sessions.map((session) => {
        const isSelected = session.id === selectedSessionId;
        return (
          <li key={session.id} className={styles.item}>
            <button
              type="button"
              className={[styles.row, isSelected ? styles.selected : null]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelect(session.id)}
              aria-pressed={isSelected}
            >
              <div className={styles.top}>
                <code className={styles.id}>{session.id}</code>
                {session.crashCount > 0 ? (
                  <span className={styles.crashBadge}>
                    ×{session.crashCount} crash{session.crashCount === 1 ? '' : 'es'}
                  </span>
                ) : null}
              </div>
              <div className={styles.meta}>
                <span>
                  {session.platform ?? '—'}
                  {session.appVersion ? ` · ${session.appVersion}` : ''}
                </span>
                <Timestamp ts={session.startedAt} {...(now !== undefined ? { now } : {})} />
              </div>
              <span className={styles.footer}>
                {session.eventCount} event{session.eventCount === 1 ? '' : 's'}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
