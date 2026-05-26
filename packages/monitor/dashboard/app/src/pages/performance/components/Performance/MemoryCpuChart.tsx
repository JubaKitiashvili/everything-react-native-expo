import { colors } from '@/tokens';
import type { ResourceSeries } from './aggregate';
import styles from './MemoryCpuChart.module.css';

export interface MemoryCpuChartProps {
  series: ResourceSeries;
  width?: number;
  height?: number;
}

export function MemoryCpuChart({ series, width = 600, height = 160 }: MemoryCpuChartProps) {
  if (series.timestamps.length < 2) {
    return <div className={styles.empty}>No CPU/memory samples yet.</div>;
  }
  const { timestamps, cpuPercent, memoryMb } = series;
  const minTs = timestamps[0]!;
  const maxTs = timestamps[timestamps.length - 1]!;
  const spanTs = Math.max(1, maxTs - minTs);
  const maxMem = Math.max(...memoryMb, 1);

  const memArea = (() => {
    const line = memoryMb
      .map((value, i) => {
        const x = ((timestamps[i]! - minTs) / spanTs) * width;
        const y = height - (value / maxMem) * height;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
    const firstX = ((timestamps[0]! - minTs) / spanTs) * width;
    const lastX = ((timestamps[timestamps.length - 1]! - minTs) / spanTs) * width;
    return `${line} L ${lastX.toFixed(2)} ${height} L ${firstX.toFixed(2)} ${height} Z`;
  })();

  const cpuLine = cpuPercent
    .map((value, i) => {
      const x = ((timestamps[i]! - minTs) / spanTs) * width;
      const y = height - (Math.min(value, 100) / 100) * height;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

  const lastMem = memoryMb[memoryMb.length - 1] ?? 0;
  const lastCpu = cpuPercent[cpuPercent.length - 1] ?? 0;

  return (
    <div className={styles.chart}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Memory and CPU chart"
      >
        <path d={memArea} fill={`${colors.severity.info}33`} stroke="none" />
        <path d={cpuLine} fill="none" stroke={colors.severity.warning} strokeWidth={1.5} />
      </svg>
      <div className={styles.legend}>
        <span className={styles.legendEntry}>
          <span className={styles.swatch} style={{ background: colors.severity.info }} />
          Memory {lastMem.toFixed(1)} MB
        </span>
        <span className={styles.legendEntry}>
          <span className={styles.swatch} style={{ background: colors.severity.warning }} />
          CPU {lastCpu.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
