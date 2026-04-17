import { useEffect, useMemo } from 'react';
import { Panel } from '../../shared/ui/Panel/Panel';
import { useEvents } from '../../shared/hooks/useEvents';
import { useSessions } from '../../shared/hooks/useSessions';
import { useUiStore } from '../../shared/store/uiStore';
import { SessionList } from './SessionList';
import { ReplayViewer, type ReplayClock } from './ReplayViewer';
import { extractReplayFrames } from './playback';
import styles from './SessionReplay.module.css';

export interface SessionReplayProps {
  now?: number;
  clock?: ReplayClock;
}

export function SessionReplay({ now, clock }: SessionReplayProps) {
  const sessions = useSessions();
  const selectedSessionId = useUiStore((s) => s.selectedSessionId);
  const setSelectedSession = useUiStore((s) => s.setSelectedSession);

  const events = useEvents({
    filter: selectedSessionId ? { sessionId: selectedSessionId, limit: 500 } : { limit: 0 },
    enabled: selectedSessionId !== null,
  });

  useEffect(() => {
    if (selectedSessionId) return;
    const firstSession = sessions.data?.[0];
    if (firstSession) setSelectedSession(firstSession.id);
  }, [selectedSessionId, sessions.data, setSelectedSession]);

  const frames = useMemo(
    () => (events.data ? extractReplayFrames(events.data) : []),
    [events.data],
  );

  return (
    <Panel
      title="Session Replay"
      description="Timeline scrubber, event overlay, PII masks, 1× / 2× / 4× playback."
      bleed
    >
      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="Replay session list">
          {sessions.isPending ? (
            <div className={styles.placeholder}>Loading sessions…</div>
          ) : sessions.isError ? (
            <div className={styles.error}>Couldn&apos;t load sessions.</div>
          ) : (
            <SessionList
              sessions={sessions.data ?? []}
              selectedSessionId={selectedSessionId}
              onSelect={setSelectedSession}
              {...(now !== undefined ? { now } : {})}
            />
          )}
        </aside>
        <section className={styles.viewer} aria-label="Replay viewer">
          {!selectedSessionId ? (
            <div className={styles.placeholder}>Select a session to replay it.</div>
          ) : events.isPending ? (
            <div className={styles.placeholder}>Loading frames…</div>
          ) : events.isError ? (
            <div className={styles.error}>Couldn&apos;t load events for this session.</div>
          ) : (
            <ReplayViewer
              frames={frames}
              events={events.data ?? []}
              {...(now !== undefined ? { now } : {})}
              {...(clock ? { clock } : {})}
            />
          )}
        </section>
      </div>
    </Panel>
  );
}
