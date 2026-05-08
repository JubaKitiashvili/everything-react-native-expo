// Task 117.22 — ANR list view (overview page).
//
// Sortable + filterable table of every ANR instance. Each row is a
// full-width button so keyboard users navigate naturally and the
// onSelect call fires for both click + Enter/Space. Filters are
// uncontrolled (local state) — when 117.1 lands and the dashboard
// gets a real router, this becomes the body of the `/monitor/anrs`
// route.

import { useMemo, useState } from 'react';
import { Timestamp } from '../../shared/ui/Timestamp/Timestamp';
import { formatDuration, type AnrInstance } from './aggregate';
import styles from './ANRList.module.css';

export interface ANRListProps {
  instances: readonly AnrInstance[];
  onSelect: (id: string) => void;
  now?: number;
}

type SortKey = 'timestamp' | 'duration';

const ALL_SCREEN_FILTER = '__all__';

const DURATION_FILTERS: Array<{ id: string; label: string; min: number; max: number }> = [
  { id: 'all', label: 'All durations', min: 0, max: Number.POSITIVE_INFINITY },
  { id: 'lt5', label: '< 5 s', min: 0, max: 5_000 },
  { id: '5to10', label: '5–10 s', min: 5_000, max: 10_000 },
  { id: '10to20', label: '10–20 s', min: 10_000, max: 20_000 },
  { id: 'gte20', label: '≥ 20 s', min: 20_000, max: Number.POSITIVE_INFINITY },
];

export function ANRList({ instances, onSelect, now }: ANRListProps) {
  const [screenFilter, setScreenFilter] = useState<string>(ALL_SCREEN_FILTER);
  const [durationFilter, setDurationFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('timestamp');

  const screenOptions = useMemo(() => {
    const set = new Set<string>();
    for (const i of instances) {
      if (i.screen) set.add(i.screen);
    }
    return [...set].sort();
  }, [instances]);

  const durationRange = DURATION_FILTERS.find((f) => f.id === durationFilter) ?? DURATION_FILTERS[0]!;
  const filtered = useMemo(() => {
    return instances.filter((i) => {
      if (
        screenFilter !== ALL_SCREEN_FILTER &&
        (screenFilter === '<unknown>' ? i.screen !== null : i.screen !== screenFilter)
      ) {
        return false;
      }
      if (i.durationMs < durationRange.min || i.durationMs >= durationRange.max) return false;
      return true;
    });
  }, [instances, screenFilter, durationRange.min, durationRange.max]);

  const sorted = useMemo(() => {
    const copy = filtered.slice();
    copy.sort((a, b) => {
      if (sortKey === 'duration') return b.durationMs - a.durationMs;
      return b.timestamp - a.timestamp;
    });
    return copy;
  }, [filtered, sortKey]);

  return (
    <div className={styles.root} aria-label="ANR list">
      <div className={styles.controls}>
        <label className={styles.label}>
          Screen{' '}
          <select
            className={styles.select}
            value={screenFilter}
            onChange={(e) => setScreenFilter(e.target.value)}
            aria-label="Filter by screen"
          >
            <option value={ALL_SCREEN_FILTER}>All</option>
            {screenOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value="<unknown>">{'<unknown>'}</option>
          </select>
        </label>
        <label className={styles.label}>
          Duration{' '}
          <select
            className={styles.select}
            value={durationFilter}
            onChange={(e) => setDurationFilter(e.target.value)}
            aria-label="Filter by duration"
          >
            {DURATION_FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <span className={styles.count}>
          {sorted.length} of {instances.length}
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className={styles.empty}>No ANRs match the current filters.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="ANR list table">
            <thead>
              <tr>
                <th
                  scope="col"
                  className={`${styles.head} ${styles.headSortable}`}
                  onClick={() => setSortKey('timestamp')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setSortKey('timestamp');
                  }}
                  role="button"
                  tabIndex={0}
                  aria-sort={sortKey === 'timestamp' ? 'descending' : 'none'}
                >
                  When{' '}
                  {sortKey === 'timestamp' ? <span className={styles.sortIcon}>▼</span> : null}
                </th>
                <th
                  scope="col"
                  className={`${styles.head} ${styles.headSortable}`}
                  onClick={() => setSortKey('duration')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setSortKey('duration');
                  }}
                  role="button"
                  tabIndex={0}
                  aria-sort={sortKey === 'duration' ? 'descending' : 'none'}
                >
                  Duration{' '}
                  {sortKey === 'duration' ? <span className={styles.sortIcon}>▼</span> : null}
                </th>
                <th scope="col" className={styles.head}>
                  Screen
                </th>
                <th scope="col" className={styles.head}>
                  Stack head
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((instance) => (
                <tr key={instance.id} className={styles.row}>
                  <td className={styles.cell}>
                    <button
                      type="button"
                      className={styles.rowButton}
                      onClick={() => onSelect(instance.id)}
                      aria-label={`Open ANR from ${instance.screen ?? 'unknown screen'}, ${formatDuration(instance.durationMs)}`}
                    >
                      <Timestamp ts={instance.timestamp} {...(now !== undefined ? { now } : {})} />
                    </button>
                  </td>
                  <td className={styles.cell}>
                    <span
                      className={`${styles.duration} ${
                        instance.durationMs >= 10_000
                          ? styles.durationCritical
                          : instance.durationMs >= 5_000
                            ? styles.durationWarning
                            : ''
                      }`}
                    >
                      {formatDuration(instance.durationMs)}
                    </span>
                  </td>
                  <td className={styles.cell}>
                    {instance.screen ? (
                      <span className={styles.screen}>{instance.screen}</span>
                    ) : (
                      <span className={styles.screenUnknown}>{'<unknown>'}</span>
                    )}
                  </td>
                  <td className={styles.cell}>
                    <code className={styles.stackHead} title={instance.stackHead}>
                      {instance.stackHead}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
