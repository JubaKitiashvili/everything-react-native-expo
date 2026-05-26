import type { DoraMetric, TrendDirection } from './aggregate';
import styles from './MetricCard.module.css';

export interface MetricCardProps {
  label: string;
  value: string;
  previous: string;
  metric: DoraMetric;
  trend: TrendDirection;
  /** Describes what the metric counts, e.g. "resolved crashes". */
  unit: string;
}

const ARROW: Record<TrendDirection, string> = {
  up: '▲',
  down: '▼',
  flat: '■',
};

export function MetricCard({ label, value, previous, metric, trend, unit }: MetricCardProps) {
  return (
    <div className={styles.card} aria-label={`${label} metric card`}>
      <span className={styles.label}>{label}</span>
      <div className={styles.valueRow}>
        <span className={styles.value}>{value}</span>
        <span className={styles.trend} data-direction={trend} aria-label={`trend ${trend}`}>
          {ARROW[trend]}
        </span>
      </div>
      <div className={styles.meta}>
        <span>previous {previous}</span>
        <span>
          {metric.samples} {unit}
        </span>
      </div>
    </div>
  );
}
