import { colors } from '@/tokens';
import type { StartupRecord } from './aggregate';
import styles from './StartupWaterfall.module.css';

export interface StartupWaterfallProps {
  records: StartupRecord[];
}

const KIND_LABELS: Record<string, string> = {
  cold: 'Cold start',
  warm: 'Warm start',
  hot: 'Hot start',
};

const PHASE_PALETTE = [
  colors.severity.info,
  colors.severity.success,
  colors.severity.warning,
  colors.severity.critical,
  colors.brand.mint,
];

export function StartupWaterfall({ records }: StartupWaterfallProps) {
  if (records.length === 0) {
    return <div className={styles.empty}>No startup traces captured yet.</div>;
  }
  const maxTotal = Math.max(...records.map((r) => Math.max(1, r.totalMs)));
  return (
    <div className={styles.chart} aria-label="Startup phase chart">
      {records.map((record) => {
        const widthRatio = record.totalMs / maxTotal;
        return (
          <div key={record.kind} className={styles.row}>
            <div className={styles.label}>
              <span className={styles.kind}>{KIND_LABELS[record.kind] ?? record.kind}</span>
              <span className={styles.total}>{record.totalMs.toFixed(0)} ms</span>
            </div>
            <div className={styles.track} style={{ width: `${Math.max(widthRatio * 100, 6)}%` }}>
              {record.phases.length === 0 ? (
                <div className={styles.segmentFallback} />
              ) : (
                record.phases.map((phase, i) => {
                  const segWidth = (phase.durationMs / Math.max(record.totalMs, 1)) * 100;
                  return (
                    <div
                      key={`${phase.label}-${i}`}
                      className={styles.segment}
                      style={{
                        width: `${segWidth}%`,
                        background: PHASE_PALETTE[i % PHASE_PALETTE.length],
                      }}
                      title={`${phase.label}: ${phase.durationMs.toFixed(0)} ms`}
                    >
                      {segWidth > 10 ? (
                        <span className={styles.phaseLabel}>{phase.label}</span>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
