import { colors } from '@/tokens';
import type { FabricBucket } from './aggregate';
import styles from './FabricHistogram.module.css';

export interface FabricHistogramProps {
  buckets: FabricBucket[];
  height?: number;
}

const SEVERITY_BY_THRESHOLD = (maxMs: number): string => {
  if (maxMs <= 16) return colors.severity.success;
  if (maxMs <= 33) return colors.severity.info;
  if (maxMs <= 100) return colors.severity.warning;
  return colors.severity.critical;
};

export function FabricHistogram({ buckets, height = 140 }: FabricHistogramProps) {
  const total = buckets.reduce((acc, b) => acc + b.count, 0);
  if (total === 0) {
    return <div className={styles.empty}>No Fabric commits recorded yet.</div>;
  }
  const max = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <div className={styles.chart} aria-label="Commit latency bars">
      <div className={styles.bars} style={{ height }}>
        {buckets.map((bucket) => {
          const pct = (bucket.count / max) * 100;
          const color = SEVERITY_BY_THRESHOLD(bucket.maxMs);
          return (
            <div key={bucket.label} className={styles.bar}>
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{ height: `${Math.max(2, pct)}%`, background: color }}
                  title={`${bucket.label}: ${bucket.count} commits`}
                />
              </div>
              <span className={styles.barValue}>{bucket.count}</span>
              <span className={styles.barLabel}>{bucket.label}</span>
            </div>
          );
        })}
      </div>
      <p className={styles.total}>
        {total} commit{total === 1 ? '' : 's'} in window
      </p>
    </div>
  );
}
