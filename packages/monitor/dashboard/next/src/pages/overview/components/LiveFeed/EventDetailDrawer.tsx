import type { EventRecord } from '@/shared/api/types';
import { Pill } from '@/shared/ui/Pill/Pill';
import { Timestamp } from '@/shared/ui/Timestamp/Timestamp';
import styles from './EventDetailDrawer.module.css';

export interface EventDetailDrawerProps {
  event: EventRecord | null;
  onClose: () => void;
  now?: number;
}

export function EventDetailDrawer({ event, onClose, now }: EventDetailDrawerProps) {
  if (!event) return null;
  const message = String((event.payload as { message?: unknown })?.message ?? '');
  return (
    <aside className={styles.drawer} role="dialog" aria-label="Event details">
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <Pill severity={event.severity} size="sm">
            {event.type}
          </Pill>
          <Timestamp ts={event.timestamp} format="both" now={now} />
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Close event details"
        >
          ×
        </button>
      </header>

      {message ? <p className={styles.message}>{message}</p> : null}

      <dl className={styles.grid}>
        <dt>Session</dt>
        <dd className={styles.mono}>{event.sessionId}</dd>

        {event.fingerprint ? (
          <>
            <dt>Fingerprint</dt>
            <dd className={styles.mono}>{event.fingerprint}</dd>
          </>
        ) : null}

        {event.screen ? (
          <>
            <dt>Screen</dt>
            <dd>{event.screen}</dd>
          </>
        ) : null}

        {event.platform ? (
          <>
            <dt>Platform</dt>
            <dd>{event.platform}</dd>
          </>
        ) : null}

        {event.userId ? (
          <>
            <dt>User</dt>
            <dd className={styles.mono}>{event.userId}</dd>
          </>
        ) : null}
      </dl>

      <section className={styles.payload}>
        <h3 className={styles.subheading}>Payload</h3>
        <pre className={styles.json}>{JSON.stringify(event.payload, null, 2)}</pre>
      </section>
    </aside>
  );
}
