import type { RecurrenceBin } from './aggregate';
import styles from './RecurrenceTimeline.module.css';

export interface RecurrenceTimelineProps {
  bins: RecurrenceBin[];
}

export function RecurrenceTimeline({ bins }: RecurrenceTimelineProps) {
  const totalCount = bins.reduce((acc, b) => acc + b.count, 0);
  if (bins.length === 0 || totalCount === 0) {
    return <div className={styles.empty}>No ANRs to chart.</div>;
  }
  const max = Math.max(...bins.map((b) => b.count), 1);
  return (
    <div className={styles.timeline} aria-label="ANR recurrence timeline">
      <div className={styles.bars}>
        {bins.map((bin, i) => {
          const heightPct = (bin.count / max) * 100;
          return (
            <div key={i} className={styles.bin}>
              <div
                className={styles.binFill}
                style={{ height: `${Math.max(2, heightPct)}%` }}
                title={`${bin.count} ANR${bin.count === 1 ? '' : 's'}`}
              />
            </div>
          );
        })}
      </div>
      <div className={styles.meta}>
        <span>Oldest</span>
        <span>Newest</span>
      </div>
    </div>
  );
}
