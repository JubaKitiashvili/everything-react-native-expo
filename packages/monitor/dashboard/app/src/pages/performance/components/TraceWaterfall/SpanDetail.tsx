import { formatDurationMs, type SpanNode } from './buildSpanTree';
import styles from './SpanDetail.module.css';

export interface SpanDetailProps {
  span: SpanNode;
  /** Trace window start, so checkpoints can be shown as relative offsets. */
  traceStart: number;
}

export function SpanDetail({ span, traceStart }: SpanDetailProps) {
  const attributes = Object.entries(span.attributes);
  return (
    <div className={styles.detail} aria-label="Span detail">
      <dl className={styles.grid}>
        <Cell label="Span">
          <code className={styles.mono}>{span.name}</code>
        </Cell>
        <Cell label="ID">
          <code className={styles.mono}>{span.id}</code>
        </Cell>
        <Cell label="Duration">
          <span className={styles.number}>{formatDurationMs(span.durationMs)}</span>
        </Cell>
        <Cell label="Start offset">
          <span className={styles.number}>
            +{formatDurationMs(Math.max(0, span.startMs - traceStart))}
          </span>
        </Cell>
      </dl>

      <section className={styles.section} aria-label="Span attributes">
        <h4 className={styles.subhead}>Attributes</h4>
        {attributes.length === 0 ? (
          <p className={styles.muted}>No attributes recorded.</p>
        ) : (
          <dl className={styles.attrGrid}>
            {attributes.map(([key, value]) => (
              <div key={key} className={styles.attrRow}>
                <dt className={styles.attrKey}>{key}</dt>
                <dd className={styles.attrValue}>
                  <code className={styles.mono}>{formatValue(value)}</code>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className={styles.section} aria-label="Span checkpoints">
        <h4 className={styles.subhead}>Checkpoints</h4>
        {span.checkpoints.length === 0 ? (
          <p className={styles.muted}>No checkpoints recorded.</p>
        ) : (
          <ul className={styles.checkpointList}>
            {span.checkpoints.map((cp, index) => (
              <li key={`${cp.label}-${index}`} className={styles.checkpointItem}>
                <span className={styles.checkpointDot} aria-hidden="true" />
                <span className={styles.checkpointLabel}>{cp.label}</span>
                <span className={styles.number}>
                  +{formatDurationMs(Math.max(0, cp.atMs - traceStart))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.cell}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{children}</span>
    </div>
  );
}
