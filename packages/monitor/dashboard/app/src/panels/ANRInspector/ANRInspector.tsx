import { useMemo } from 'react';
import { Panel } from '../../shared/ui/Panel/Panel';
import { Timestamp } from '../../shared/ui/Timestamp/Timestamp';
import { useEvents } from '../../shared/hooks/useEvents';
import type { EventRecord } from '../../shared/api/types';
import {
  bucketByDuration,
  extractAnrs,
  formatDuration,
  recurrenceBins,
  topScreens,
  type AnrRecord,
} from './aggregate';
import { DurationHistogram } from './DurationHistogram';
import { RecurrenceTimeline } from './RecurrenceTimeline';
import { TopScreens } from './TopScreens';
import styles from './ANRInspector.module.css';

export interface ANRInspectorProps {
  events?: EventRecord[];
  now?: number;
}

const FETCH_LIMIT = 500;

export function ANRInspector({ events, now }: ANRInspectorProps = {}) {
  if (events !== undefined) {
    return <ANRInspectorView events={events} {...(now !== undefined ? { now } : {})} />;
  }
  return <ANRInspectorContainer {...(now !== undefined ? { now } : {})} />;
}

function ANRInspectorContainer({ now }: { now?: number }) {
  const query = useEvents({ filter: { type: ['anr', 'native_anr'], limit: FETCH_LIMIT } });
  if (query.isPending) {
    return (
      <Panel title="ANR Inspector" description="Duration buckets, recurrence, offender screens.">
        <div className={styles.placeholder}>Loading ANR samples…</div>
      </Panel>
    );
  }
  if (query.isError) {
    return (
      <Panel title="ANR Inspector" description="Duration buckets, recurrence, offender screens.">
        <div className={styles.error}>
          Couldn&apos;t load ANR events: {String((query.error as Error)?.message ?? '')}
        </div>
      </Panel>
    );
  }
  return <ANRInspectorView events={query.data ?? []} {...(now !== undefined ? { now } : {})} />;
}

function ANRInspectorView({ events, now }: { events: EventRecord[]; now?: number }) {
  const records = useMemo(() => extractAnrs(events), [events]);
  const buckets = useMemo(() => bucketByDuration(records), [records]);
  const offenders = useMemo(() => topScreens(records), [records]);
  const bins = useMemo(() => recurrenceBins(records), [records]);

  const worst = records.find((r) => r.durationMs >= 10_000) ?? records[0] ?? null;

  return (
    <Panel
      title="ANR Inspector"
      description="Duration buckets, recurrence, stack heads, and offender screens."
    >
      <div className={styles.grid}>
        <section className={styles.cell} aria-label="ANR duration histogram">
          <h3 className={styles.subhead}>Duration</h3>
          <DurationHistogram buckets={buckets} />
        </section>
        <section className={styles.cell} aria-label="ANR recurrence over time">
          <h3 className={styles.subhead}>Recurrence</h3>
          <RecurrenceTimeline bins={bins} />
        </section>
        <section className={styles.cell} aria-label="Top ANR offender screens">
          <h3 className={styles.subhead}>Offender screens</h3>
          <TopScreens offenders={offenders} />
        </section>
        <section className={styles.cell} aria-label="Recent ANR stack heads">
          <h3 className={styles.subhead}>Latest stack heads</h3>
          <StackHeadList records={records.slice(0, 6)} {...(now !== undefined ? { now } : {})} />
          {worst ? <WorstBanner record={worst} /> : null}
        </section>
      </div>
    </Panel>
  );
}

function StackHeadList({ records, now }: { records: AnrRecord[]; now?: number }) {
  if (records.length === 0) {
    return <div className={styles.empty}>No ANRs to show.</div>;
  }
  return (
    <ol className={styles.stackList}>
      {records.map((record) => (
        <li key={record.id} className={styles.stackRow}>
          <div className={styles.stackHeader}>
            <span className={styles.duration}>{formatDuration(record.durationMs)}</span>
            <span className={styles.screen}>{record.screen ?? '<unknown screen>'}</span>
            <Timestamp ts={record.timestamp} {...(now !== undefined ? { now } : {})} />
          </div>
          <code className={styles.stackHead}>{record.stackHead}</code>
        </li>
      ))}
    </ol>
  );
}

function WorstBanner({ record }: { record: AnrRecord }) {
  return (
    <div className={styles.worst} role="note" aria-label="Worst recent ANR">
      <span className={styles.worstLabel}>Worst recent</span>
      <span>{formatDuration(record.durationMs)}</span>
      <span className={styles.worstScreen}>on {record.screen ?? '<unknown screen>'}</span>
    </div>
  );
}
