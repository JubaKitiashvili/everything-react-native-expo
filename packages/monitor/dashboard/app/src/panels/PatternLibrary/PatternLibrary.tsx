import { useMemo, useState } from 'react';
import { Panel } from '../../shared/ui/Panel/Panel';
import { useCrashGroups } from '../../shared/hooks/useCrashGroups';
import { useEvents } from '../../shared/hooks/useEvents';
import type { CrashGroupRecord, EventRecord } from '../../shared/api/types';
import { buildPatternRows } from './aggregate';
import { PatternRow } from './PatternRow';
import styles from './PatternLibrary.module.css';

export interface PatternLibraryProps {
  events?: EventRecord[];
  groups?: CrashGroupRecord[];
  now?: number;
}

export function PatternLibrary({ events, groups, now }: PatternLibraryProps = {}) {
  if (events !== undefined && groups !== undefined) {
    return (
      <PatternLibraryView events={events} groups={groups} {...(now !== undefined ? { now } : {})} />
    );
  }
  return <PatternLibraryContainer {...(now !== undefined ? { now } : {})} />;
}

function PatternLibraryContainer({ now }: { now?: number }) {
  const eventsQuery = useEvents({
    filter: { type: ['pattern_match', 'ai_suggestion'], limit: 500 },
    staleTime: 30_000,
  });
  const groupsQuery = useCrashGroups();

  if (eventsQuery.isPending || groupsQuery.isPending) {
    return (
      <Panel title="Pattern Library" description="Built-in + learned patterns, confidence decay.">
        <div className={styles.placeholder}>Loading patterns…</div>
      </Panel>
    );
  }
  if (eventsQuery.isError || groupsQuery.isError) {
    return (
      <Panel title="Pattern Library" description="Built-in + learned patterns, confidence decay.">
        <div className={styles.error}>Couldn&apos;t load patterns.</div>
      </Panel>
    );
  }
  return (
    <PatternLibraryView
      events={eventsQuery.data ?? []}
      groups={groupsQuery.data ?? []}
      {...(now !== undefined ? { now } : {})}
    />
  );
}

interface ViewProps {
  events: EventRecord[];
  groups: CrashGroupRecord[];
  now?: number;
}

function PatternLibraryView({ events, groups, now }: ViewProps) {
  const [threshold, setThreshold] = useState<number>(0);
  const [showLearnedOnly, setShowLearnedOnly] = useState<boolean>(false);

  const rows = useMemo(
    () => buildPatternRows(events, groups, now !== undefined ? { now } : {}),
    [events, groups, now],
  );

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (showLearnedOnly && !row.learned) return false;
      if (row.matchCount > 0) return row.confidence >= threshold;
      // Unmatched built-ins always show unless the user filtered to learned-only.
      return !showLearnedOnly;
    });
  }, [rows, threshold, showLearnedOnly]);

  const activeSummary = useMemo(() => {
    const matched = rows.filter((r) => r.matchCount > 0);
    const above = matched.filter((r) => r.confidence >= threshold);
    return {
      matched: matched.length,
      above: above.length,
      total: rows.length,
    };
  }, [rows, threshold]);

  return (
    <Panel
      title="Pattern Library"
      description="20 built-in + learned patterns. Confidence decays with recency."
    >
      <div className={styles.controls} aria-label="Pattern browser controls">
        <label className={styles.sliderLabel}>
          <span>Confidence threshold</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            aria-label="Confidence threshold"
          />
          <span className={styles.sliderValue}>{Math.round(threshold * 100)}%</span>
        </label>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={showLearnedOnly}
            onChange={(e) => setShowLearnedOnly(e.target.checked)}
          />
          Learned only
        </label>
        <span className={styles.summary}>
          {activeSummary.above}/{activeSummary.matched} matched above threshold ·{' '}
          {activeSummary.total} total
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>No patterns match the current filter.</div>
      ) : (
        <ol className={styles.list} aria-label="Pattern library entries">
          {filtered.map((row) => (
            <PatternRow key={row.id} row={row} {...(now !== undefined ? { now } : {})} />
          ))}
        </ol>
      )}
    </Panel>
  );
}
