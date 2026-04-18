import { Pill } from '../../shared/ui/Pill/Pill';
import type { Severity } from '../../shared/api/types';
import { formatBytes, formatDurationMs, type NetworkRequest } from './aggregate';
import styles from './RequestRow.module.css';

export interface RequestRowProps {
  request: NetworkRequest;
  /** Max duration in the current window — the row scales its bar against it. */
  windowMaxMs: number;
  expanded: boolean;
  onToggle: () => void;
}

const SEVERITY_LABEL: Record<NetworkRequest['severity'], { label: string; severity: Severity }> = {
  error: { label: 'error', severity: 'critical' },
  slow: { label: 'slow', severity: 'warning' },
  ok: { label: 'ok', severity: 'success' },
};

export function RequestRow({ request, windowMaxMs, expanded, onToggle }: RequestRowProps) {
  const meta = SEVERITY_LABEL[request.severity];
  const pct = windowMaxMs > 0 ? Math.min(100, (request.durationMs / windowMaxMs) * 100) : 0;
  const statusLabel = request.status !== null ? String(request.status) : '—';
  return (
    <button
      type="button"
      className={[styles.row, expanded ? styles.expanded : null, styles[request.severity]]
        .filter(Boolean)
        .join(' ')}
      aria-expanded={expanded}
      onClick={onToggle}
    >
      <div className={styles.gutter} data-severity={request.severity} aria-hidden="true" />
      <span className={styles.method}>{request.method}</span>
      <span className={styles.status} data-severity={request.severity}>
        {statusLabel}
      </span>
      <span className={styles.host} title={request.url}>
        <span className={styles.hostPart}>{request.host || '—'}</span>
        <span className={styles.pathPart}>{request.path}</span>
      </span>
      <div className={styles.trackWrap} aria-hidden="true">
        <div className={styles.track}>
          <div
            className={styles.bar}
            style={{ width: `${Math.max(2, pct)}%` }}
            data-severity={request.severity}
          />
        </div>
      </div>
      <span className={styles.duration}>{formatDurationMs(request.durationMs)}</span>
      <span className={styles.size}>
        {formatBytes(request.requestSize)} ↑ · {formatBytes(request.responseSize)} ↓
      </span>
      <span className={styles.pillCell}>
        <Pill severity={meta.severity} size="sm">
          {meta.label}
        </Pill>
      </span>
    </button>
  );
}
