import { colors } from '../../tokens';
import type { ConfidenceSample } from './aggregate';
import styles from './ConfidenceTrend.module.css';

export interface ConfidenceTrendProps {
  samples: ConfidenceSample[];
  width?: number;
  height?: number;
}

export function ConfidenceTrend({ samples, width = 280, height = 80 }: ConfidenceTrendProps) {
  if (samples.length < 2) {
    return <div className={styles.empty}>Not enough AI samples yet.</div>;
  }
  const minTs = samples[0]!.timestamp;
  const maxTs = samples[samples.length - 1]!.timestamp;
  const span = Math.max(1, maxTs - minTs);

  const path = samples
    .map((sample, i) => {
      const x = ((sample.timestamp - minTs) / span) * width;
      const y = height - sample.confidence * height;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

  const avg = samples.reduce((acc, s) => acc + s.confidence, 0) / samples.length;
  const avgY = height - avg * height;

  return (
    <div className={styles.trend}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="AI confidence trend"
      >
        <line
          x1={0}
          x2={width}
          y1={avgY}
          y2={avgY}
          stroke={colors.border.default}
          strokeDasharray="4 4"
        />
        <path
          d={path}
          fill="none"
          stroke={colors.brand.mint}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </svg>
      <p className={styles.summary}>
        avg {Math.round(avg * 100)}% · {samples.length} samples
      </p>
    </div>
  );
}
