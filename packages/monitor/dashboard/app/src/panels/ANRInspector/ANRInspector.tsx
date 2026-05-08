import { useMemo, useState } from 'react';
import { Panel } from '../../shared/ui/Panel/Panel';
import { Timestamp } from '../../shared/ui/Timestamp/Timestamp';
import { useEvents } from '../../shared/hooks/useEvents';
import type { EventRecord } from '../../shared/api/types';
import {
  bucketByDuration,
  extractAnrInstances,
  extractAnrs,
  findInstance,
  formatDuration,
  groupByFingerprint,
  recurrenceBins,
  topScreens,
  type AnrInstance,
  type AnrRecord,
} from './aggregate';
import { DurationHistogram } from './DurationHistogram';
import { RecurrenceTimeline } from './RecurrenceTimeline';
import { TopScreens } from './TopScreens';
import { ANRList } from './ANRList';
import { ANRDetail } from './ANRDetail';
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
  // Records (existing API) drive the legacy aggregate widgets so the
  // tests that count "Worst recent" / offenders keep working byte-for-
  // byte. Instances (Task 117.22) carry the full stack + fingerprint
  // for the new list / detail views.
  const records = useMemo(() => extractAnrs(events), [events]);
  const instances = useMemo(() => extractAnrInstances(events), [events]);
  const buckets = useMemo(() => bucketByDuration(records), [records]);
  const offenders = useMemo(() => topScreens(records), [records]);
  const bins = useMemo(() => recurrenceBins(records), [records]);

  const worst = records.find((r) => r.durationMs >= 10_000) ?? records[0] ?? null;

  // Selection state for the multi-page split. When react-router 7 lands
  // (Task 117.1) this becomes a URL param; for now it's local state so
  // the overview / detail flow still works in the existing single-panel
  // shell.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId !== null ? findInstance(instances, selectedId) : null;
  const recurrence = useMemo<AnrInstance[]>(() => {
    if (!selected) return [];
    const clusters = groupByFingerprint(instances);
    const cluster = clusters.find((c) => c.fingerprint === selected.fingerprint);
    return cluster ? cluster.instances : [];
  }, [instances, selected]);

  if (selected) {
    return (
      <Panel
        title="ANR Inspector"
        description={`Detail view: ${selected.screen ?? 'unknown screen'} · ${formatDuration(selected.durationMs)}`}
      >
        <ANRDetail
          instance={selected}
          recurrence={recurrence}
          onBack={() => setSelectedId(null)}
          onSelectInstance={setSelectedId}
          {...(now !== undefined ? { now } : {})}
        />
      </Panel>
    );
  }

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
      <section className={styles.listSection} aria-label="All ANR instances">
        <h3 className={styles.listSubhead}>All ANRs</h3>
        <ANRList
          instances={instances}
          onSelect={setSelectedId}
          {...(now !== undefined ? { now } : {})}
        />
      </section>
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
