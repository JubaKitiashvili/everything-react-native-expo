import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useEvents, useSessions } from '@/shared/hooks';
import { EventRow, Panel, Pill, Tile, Timestamp } from '@/shared/ui';
import type { SessionRecord } from '@/shared/api/types';
import { summarizeUser } from './summarizeUser';
import styles from './UserDetailPage.module.css';

const RECENT_EVENTS_LIMIT = 50;

/**
 * User-centric detail view served at `/users/:id`. Pulls this user's recent
 * events (server-filtered by `userId`) and the session fleet (filtered
 * client-side, since the sessions endpoint has no per-user filter yet),
 * then renders a KPI header plus session and event timelines.
 */
export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const userId = id ?? '';

  const eventsQuery = useEvents({
    filter: { userId, limit: RECENT_EVENTS_LIMIT },
    enabled: userId.length > 0,
  });
  const sessionsQuery = useSessions({ enabled: userId.length > 0 });

  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);
  const userSessions = useMemo<SessionRecord[]>(
    () => (sessionsQuery.data ?? []).filter((s) => s.userId === userId),
    [sessionsQuery.data, userId],
  );

  const summary = useMemo(() => summarizeUser(events, userSessions), [events, userSessions]);

  const isLoading = eventsQuery.isLoading || sessionsQuery.isLoading;
  const isError = eventsQuery.isError || sessionsQuery.isError;
  const hasData = summary.sessionCount > 0 || summary.eventCount > 0;

  const sortedSessions = useMemo(
    () => [...userSessions].sort((a, b) => b.startedAt - a.startedAt),
    [userSessions],
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>User</span>
        <h1 className={styles.userId}>{userId || 'Unknown user'}</h1>
      </header>

      <section className={styles.tiles} aria-label="User metrics">
        <Tile label="Sessions" value={summary.sessionCount} />
        <Tile label="Events" value={summary.eventCount} />
        <Tile label="Crashes" value={summary.crashCount} />
        <Tile label="ANRs" value={summary.anrCount} />
      </section>

      <Panel title="Activity" description="First and last time we saw this user.">
        {isLoading ? (
          <p className={styles.status}>Loading…</p>
        ) : isError ? (
          <p className={styles.status}>Could not load user data.</p>
        ) : !hasData ? (
          <p className={styles.status}>No activity recorded for this user.</p>
        ) : (
          <div className={styles.sessionMeta}>
            <span>
              First seen:{' '}
              {summary.firstSeen !== null ? <Timestamp ts={summary.firstSeen} format="both" /> : '—'}
            </span>
            <span>
              Last seen:{' '}
              {summary.lastSeen !== null ? <Timestamp ts={summary.lastSeen} format="both" /> : '—'}
            </span>
          </div>
        )}
      </Panel>

      <Panel
        title="Sessions"
        description={summary.sessionCount > 0 ? `${summary.sessionCount} total` : undefined}
      >
        {isLoading ? (
          <p className={styles.status}>Loading sessions…</p>
        ) : sessionsQuery.isError ? (
          <p className={styles.status}>Could not load sessions.</p>
        ) : sortedSessions.length === 0 ? (
          <p className={styles.status}>No sessions for this user.</p>
        ) : (
          <div className={styles.list}>
            {sortedSessions.map((session) => (
              <div key={session.id} className={styles.sessionRow}>
                <span className={styles.sessionId}>{session.id}</span>
                <span className={styles.sessionMeta}>
                  {session.appVersion ? <Pill size="sm">{session.appVersion}</Pill> : null}
                  <Timestamp ts={session.startedAt} />
                  <span>{session.eventCount} events</span>
                  <span>{session.crashCount} crashes</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Recent events" description="Latest activity, newest first.">
        {isLoading ? (
          <p className={styles.status}>Loading events…</p>
        ) : eventsQuery.isError ? (
          <p className={styles.status}>Could not load events.</p>
        ) : events.length === 0 ? (
          <p className={styles.status}>No events for this user.</p>
        ) : (
          <div className={styles.list}>
            {events.map((event) => (
              <EventRow
                key={event.id}
                timestamp={event.timestamp}
                type={event.type}
                severity={event.severity}
                message={event.screen ?? event.type}
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
