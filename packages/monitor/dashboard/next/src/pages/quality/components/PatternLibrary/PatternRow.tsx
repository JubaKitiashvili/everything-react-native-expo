import { Pill } from '@/shared/ui/Pill/Pill';
import { Timestamp } from '@/shared/ui/Timestamp/Timestamp';
import type { PatternRow as PatternRowData } from './aggregate';
import { CATEGORY_LABEL } from './catalog';
import styles from './PatternRow.module.css';

export interface PatternRowProps {
  row: PatternRowData;
  now?: number;
}

export function PatternRow({ row, now }: PatternRowProps) {
  const pct = Math.round(row.confidence * 100);
  return (
    <li className={styles.row}>
      <div className={styles.head}>
        <span className={styles.name}>{row.name}</span>
        <div className={styles.badges}>
          <Pill size="sm" severity="muted">
            {CATEGORY_LABEL[row.category]}
          </Pill>
          {row.learned ? (
            <Pill size="sm" severity="info">
              learned
            </Pill>
          ) : null}
        </div>
      </div>
      <p className={styles.description}>{row.description}</p>
      <div className={styles.stats}>
        <span className={styles.matchCount}>
          ×{row.matchCount}
          <span className={styles.matchLabel}> matches</span>
        </span>
        <span className={styles.lastSeen}>
          {row.lastMatchedAt !== null ? (
            <>
              last <Timestamp ts={row.lastMatchedAt} {...(now !== undefined ? { now } : {})} />
            </>
          ) : (
            <span className={styles.muted}>never matched</span>
          )}
        </span>
      </div>
      <div className={styles.confidenceTrack}>
        <div
          className={styles.confidenceFill}
          style={{ width: `${pct}%` }}
          aria-hidden="true"
          data-percent={pct}
        />
        <span className={styles.confidenceLabel}>confidence {pct}%</span>
      </div>
    </li>
  );
}
