// Task 117.23 — dead zones list (taps that landed on a non-handler).

import type { ComponentImpact } from './aggregate';
import styles from './Frustration.module.css';

export interface DeadZonesListProps {
  rows: readonly ComponentImpact[];
  /** Render at most this many. Default 8. */
  limit?: number;
}

export function DeadZonesList({ rows, limit = 8 }: DeadZonesListProps) {
  const filtered = rows
    .filter((r) => r.deadTapCount > 0)
    .sort((a, b) => b.deadTapCount - a.deadTapCount)
    .slice(0, limit);
  if (filtered.length === 0) {
    return <div className={styles.empty}>No dead zones detected.</div>;
  }
  return (
    <ul className={styles.list} aria-label="Dead zones">
      {filtered.map((r) => (
        <li key={r.componentPath} className={styles.listRow}>
          <code className={styles.listLabel} title={r.componentPath}>
            {r.componentPath}
          </code>
          <span className={styles.listCount}>
            {r.deadTapCount} dead tap{r.deadTapCount === 1 ? '' : 's'}
          </span>
        </li>
      ))}
    </ul>
  );
}
