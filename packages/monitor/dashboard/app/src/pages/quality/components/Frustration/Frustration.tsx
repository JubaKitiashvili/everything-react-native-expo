// Task 117.23 — Frustration panel (Error Taps).
//
// Renders a top-line "this button causes errors for X% of users"
// headline, a per-button error-rate table, and a dead-zones list.
// Hydrates from the events API by fetching `custom` events (which
// carry both `frustration` emissions and the underlying `touch`
// taps the SDK records). When no events match, every panel section
// shows an honest empty state — we never invent stats.

import { useMemo } from 'react';
import { Panel } from '@/shared/ui/Panel/Panel';
import { useEvents } from '@/shared/hooks/useEvents';
import type { EventRecord } from '@/shared/api/types';
import {
  aggregateByComponent,
  countSessions,
  countTapsByComponent,
  extractFrustrations,
  pickHeadline,
} from './aggregate';
import { UserImpactCard } from './UserImpactCard';
import { PerButtonTable } from './PerButtonTable';
import { DeadZonesList } from './DeadZonesList';
import styles from './Frustration.module.css';

export interface FrustrationProps {
  /** Test injection: bypass the data hook with a pre-built event list. */
  events?: EventRecord[];
}

const FETCH_LIMIT = 1_000;

export function Frustration({ events }: FrustrationProps = {}) {
  if (events !== undefined) {
    return <FrustrationView events={events} />;
  }
  return <FrustrationContainer />;
}

function FrustrationContainer() {
  const query = useEvents({ filter: { type: 'custom', limit: FETCH_LIMIT } });
  if (query.isPending) {
    return (
      <Panel title="Error Taps" description="Per-button frustration impact.">
        <div className={styles.placeholder}>Loading frustration signals…</div>
      </Panel>
    );
  }
  if (query.isError) {
    return (
      <Panel title="Error Taps" description="Per-button frustration impact.">
        <div className={styles.error}>
          Couldn&apos;t load frustration events: {String((query.error as Error)?.message ?? '')}
        </div>
      </Panel>
    );
  }
  return <FrustrationView events={query.data ?? []} />;
}

function FrustrationView({ events }: { events: EventRecord[] }) {
  const frustrations = useMemo(() => extractFrustrations(events), [events]);
  const taps = useMemo(() => countTapsByComponent(events), [events]);
  const totalSessions = useMemo(() => countSessions(events), [events]);
  const impacts = useMemo(
    () => aggregateByComponent(frustrations, taps, totalSessions),
    [frustrations, taps, totalSessions],
  );
  const headline = useMemo(() => pickHeadline(impacts, totalSessions), [impacts, totalSessions]);
  const topImpact = impacts[0] ?? null;

  return (
    <Panel
      title="Error Taps"
      description='Per-button error rate, rage taps, dead zones, user impact.'
    >
      <div className={styles.layout}>
        <div className={styles.left}>
          <UserImpactCard
            headline={headline}
            totalSessions={totalSessions}
            topImpact={topImpact}
          />
          <section className={styles.section} aria-labelledby="per-button-heading">
            <h3 id="per-button-heading" className={styles.subhead}>Per-button impact</h3>
            <PerButtonTable rows={impacts} />
          </section>
        </div>
        <div className={styles.right}>
          <section className={styles.section} aria-labelledby="dead-zones-heading">
            <h3 id="dead-zones-heading" className={styles.subhead}>Dead zones</h3>
            <DeadZonesList rows={impacts} />
          </section>
        </div>
      </div>
    </Panel>
  );
}
