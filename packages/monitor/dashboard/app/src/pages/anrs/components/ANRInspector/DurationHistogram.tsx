import { colors } from '@/tokens';
import type { AnrBucket } from './aggregate';
import styles from './DurationHistogram.module.css';

export interface DurationHistogramProps {
  buckets: AnrBucket[];
}

const BUCKET_COLORS = [
  colors.severity.warning,
  colors.severity.warning,
  colors.severity.critical,
  colors.severity.critical,
];

export function DurationHistogram({ buckets }: DurationHistogramProps) {
  const total = buckets.reduce((acc, b) => acc + b.count, 0);
  if (total === 0) {
    return <div className={styles.empty}>No ANRs in window.</div>;
  }
  const max = Math.max(...buckets.map((b) => b.count), 1);
  return (
    <div className={styles.chart} aria-label="ANR duration buckets">
      <div className={styles.bars}>
        {buckets.map((bucket, i) => {
          const pct = (bucket.count / max) * 100;
          return (
            <div key={bucket.label} className={styles.bar}>
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{
                    height: `${Math.max(2, pct)}%`,
                    background: BUCKET_COLORS[i] ?? colors.severity.warning,
                  }}
                  title={`${bucket.label}: ${bucket.count} ANR${bucket.count === 1 ? '' : 's'}`}
                />
              </div>
              <span className={styles.barValue}>{bucket.count}</span>
              <span className={styles.barLabel}>{bucket.label}</span>
            </div>
          );
        })}
      </div>
      <p className={styles.total}>{total} total</p>
    </div>
  );
}
