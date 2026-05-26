import { colors } from '@/tokens';
import type { FpsSeries } from './aggregate';
import styles from './FpsChart.module.css';

export interface FpsChartProps {
  series: FpsSeries;
  width?: number;
  height?: number;
}

export function FpsChart({ series, width = 600, height = 160 }: FpsChartProps) {
  if (series.timestamps.length < 2) {
    return <div className={styles.empty}>Not enough FPS samples yet.</div>;
  }
  const { timestamps, jsThread, uiThread } = series;
  const minTs = timestamps[0]!;
  const maxTs = timestamps[timestamps.length - 1]!;
  const spanTs = Math.max(1, maxTs - minTs);
  const maxFps = 60;

  const toPath = (data: number[]): string =>
    data
      .map((value, i) => {
        const x = ((timestamps[i]! - minTs) / spanTs) * width;
        const y = height - (Math.min(value, maxFps) / maxFps) * height;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');

  const sixtyFpsY = height - (60 / maxFps) * height;
  const thirtyFpsY = height - (30 / maxFps) * height;

  return (
    <div className={styles.chart}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Dual-thread FPS chart"
      >
        <line
          x1={0}
          x2={width}
          y1={sixtyFpsY}
          y2={sixtyFpsY}
          stroke={colors.border.default}
          strokeDasharray="4 4"
        />
        <line
          x1={0}
          x2={width}
          y1={thirtyFpsY}
          y2={thirtyFpsY}
          stroke={colors.border.subtle}
          strokeDasharray="4 4"
        />
        <path d={toPath(uiThread)} fill="none" stroke={colors.severity.success} strokeWidth={1.5} />
        <path d={toPath(jsThread)} fill="none" stroke={colors.severity.info} strokeWidth={1.5} />
      </svg>
      <div className={styles.legend}>
        <LegendSwatch color={colors.severity.info} label={`JS ${avg(jsThread)} fps`} />
        <LegendSwatch color={colors.severity.success} label={`UI ${avg(uiThread)} fps`} />
        <span className={styles.axis}>60 fps reference — dashed</span>
      </div>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className={styles.legendEntry}>
      <span className={styles.swatch} style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

function avg(values: number[]): string {
  if (values.length === 0) return '—';
  const sum = values.reduce((a, b) => a + b, 0);
  return (sum / values.length).toFixed(1);
}
