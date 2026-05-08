// Task 117.23 — per-button error rate table.

import type { ComponentImpact } from './aggregate';
import styles from './Frustration.module.css';

export interface PerButtonTableProps {
  rows: readonly ComponentImpact[];
  /** Render at most this many rows. Default 12. */
  limit?: number;
}

export function PerButtonTable({ rows, limit = 12 }: PerButtonTableProps) {
  const visible = rows.slice(0, limit);
  if (visible.length === 0) {
    return <div className={styles.empty}>No frustration signals recorded.</div>;
  }
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} aria-label="Per-button frustration impact">
        <thead>
          <tr>
            <th scope="col" className={styles.tableHead}>Component</th>
            <th scope="col" className={styles.tableHead}>Users</th>
            <th scope="col" className={styles.tableHead}>Error rate</th>
            <th scope="col" className={styles.tableHead}>Rage</th>
            <th scope="col" className={styles.tableHead}>Errors</th>
            <th scope="col" className={styles.tableHead}>Taps</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.componentPath} className={styles.tableRow}>
              <td className={styles.tableCell}>
                <code className={styles.componentPath} title={r.componentPath}>
                  {r.componentPath}
                </code>
              </td>
              <td className={`${styles.tableCell} ${styles.numeric}`}>
                <span className={percentClass(r.userImpactPct)}>
                  {Math.round(r.userImpactPct * 100)}%
                </span>
              </td>
              <td className={`${styles.tableCell} ${styles.numeric}`}>
                <span className={percentClass(r.errorRate)}>
                  {(r.errorRate * 100).toFixed(1)}%
                </span>
              </td>
              <td className={`${styles.tableCell} ${styles.numeric}`}>{r.rageTapCount}</td>
              <td className={`${styles.tableCell} ${styles.numeric}`}>{r.errorTapCount}</td>
              <td className={`${styles.tableCell} ${styles.numeric}`}>
                {r.totalTapCount > 0 ? r.totalTapCount : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function percentClass(value: number): string {
  if (value >= 0.1) return `${styles.percent} ${styles.percentCritical}`;
  if (value >= 0.03) return `${styles.percent} ${styles.percentWarning}`;
  if (value === 0) return `${styles.percent} ${styles.percentMuted}`;
  return styles.percent ?? '';
}
