import { useMemo } from 'react';
import { Panel } from '@/shared/ui/Panel/Panel';
import { Pill } from '@/shared/ui/Pill/Pill';
import { useEvents } from '@/shared/hooks/useEvents';
import type { EventRecord, Severity } from '@/shared/api/types';
import { buildJourneyGraph, type ScreenStat, type Transition } from './aggregate';
import styles from './UserJourneys.module.css';

const PANEL_TITLE = 'User Journeys';
const PANEL_DESCRIPTION =
  'Screen-to-screen flow weighted across sessions, with per-screen crash & ANR risk.';
const MAX_TRANSITIONS = 12;

export interface UserJourneysProps {
  /** When provided, skips the network query (used in tests / composition). */
  events?: EventRecord[];
}

export function UserJourneys({ events }: UserJourneysProps = {}) {
  if (events !== undefined) {
    return <UserJourneysView events={events} />;
  }
  return <UserJourneysContainer />;
}

function UserJourneysContainer() {
  const query = useEvents({ filter: { limit: 500 } });

  if (query.isPending) {
    return (
      <Panel title={PANEL_TITLE} description={PANEL_DESCRIPTION}>
        <div className={styles.placeholder}>Loading user journeys…</div>
      </Panel>
    );
  }
  if (query.isError) {
    return (
      <Panel title={PANEL_TITLE} description={PANEL_DESCRIPTION}>
        <div className={styles.error}>Couldn&apos;t load user journeys.</div>
      </Panel>
    );
  }
  return <UserJourneysView events={query.data ?? []} />;
}

function UserJourneysView({ events }: { events: EventRecord[] }) {
  const graph = useMemo(() => buildJourneyGraph(events), [events]);
  const topTransitions = graph.transitions.slice(0, MAX_TRANSITIONS);
  const maxCount = topTransitions[0]?.count ?? 0;

  if (graph.screens.length === 0) {
    return (
      <Panel title={PANEL_TITLE} description={PANEL_DESCRIPTION}>
        <div className={styles.placeholder}>No screen activity yet.</div>
      </Panel>
    );
  }

  return (
    <Panel title={PANEL_TITLE} description={PANEL_DESCRIPTION}>
      <div className={styles.layout}>
        <section className={styles.section} aria-label="Top screen transitions">
          <h3 className={styles.sectionTitle}>Top transitions</h3>
          {topTransitions.length === 0 ? (
            <p className={styles.placeholder}>No screen transitions recorded.</p>
          ) : (
            <ol className={styles.flowList}>
              {topTransitions.map((transition) => (
                <TransitionRow
                  key={`${transition.from}→${transition.to}`}
                  transition={transition}
                  maxCount={maxCount}
                />
              ))}
            </ol>
          )}
        </section>

        <section className={styles.section} aria-label="Per-screen risk">
          <h3 className={styles.sectionTitle}>Screen risk</h3>
          <ul className={styles.screenList}>
            {graph.screens.map((screen) => (
              <ScreenRow key={screen.screen} screen={screen} />
            ))}
          </ul>
        </section>
      </div>
    </Panel>
  );
}

function TransitionRow({ transition, maxCount }: { transition: Transition; maxCount: number }) {
  const width = maxCount > 0 ? Math.max(2, Math.round((transition.count / maxCount) * 100)) : 0;
  return (
    <li className={styles.flowRow} aria-label={`${transition.from} to ${transition.to}`}>
      <span className={styles.flowLabel}>
        <span className={styles.flowFrom}>{transition.from}</span>
        <span className={styles.flowArrow} aria-hidden="true">
          →
        </span>
        <span className={styles.flowTo}>{transition.to}</span>
      </span>
      <span className={styles.flowCount}>{transition.count}</span>
      <span className={styles.barTrack}>
        <span className={styles.bar} style={{ width: `${width}%` }} />
      </span>
    </li>
  );
}

function ScreenRow({ screen }: { screen: ScreenStat }) {
  const risk = riskFor(screen);
  return (
    <li className={styles.screenRow} aria-label={`${screen.screen} screen`}>
      <span className={styles.screenName}>{screen.screen}</span>
      <span className={styles.screenMeta}>
        <span className={styles.visits}>{screen.visits} visits</span>
        <Pill severity={risk.severity} size="sm" ariaLabel={`${screen.screen} risk: ${risk.label}`}>
          {risk.label}
        </Pill>
      </span>
    </li>
  );
}

function riskFor(screen: ScreenStat): { label: string; severity: Severity } {
  const total = screen.crashes + screen.anrs;
  if (total === 0) {
    return { label: 'Healthy', severity: 'success' };
  }
  const parts: string[] = [];
  if (screen.crashes > 0) parts.push(`${screen.crashes} crash${screen.crashes === 1 ? '' : 'es'}`);
  if (screen.anrs > 0) parts.push(`${screen.anrs} ANR${screen.anrs === 1 ? '' : 's'}`);
  const label = parts.join(' · ');
  // Any crash is critical; ANR-only is a warning.
  const severity: Severity = screen.crashes > 0 ? 'critical' : 'warning';
  return { label, severity };
}
