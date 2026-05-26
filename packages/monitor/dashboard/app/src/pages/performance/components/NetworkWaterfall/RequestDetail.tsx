import { formatBytes, formatDurationMs, type NetworkRequest } from './aggregate';
import styles from './RequestDetail.module.css';

export interface RequestDetailProps {
  request: NetworkRequest;
}

export function RequestDetail({ request }: RequestDetailProps) {
  const headerDiff = computeHeaderDiff(request.requestHeaders ?? {}, request.responseHeaders ?? {});
  return (
    <div className={styles.detail} aria-label="Request detail">
      <dl className={styles.grid}>
        <Cell label="URL">
          <code className={styles.mono}>{request.url}</code>
        </Cell>
        <Cell label="Session">
          <code className={styles.mono}>{request.sessionId}</code>
        </Cell>
        {request.screen ? (
          <Cell label="Screen">
            <code className={styles.mono}>{request.screen}</code>
          </Cell>
        ) : null}
        {request.initiator ? (
          <Cell label="Initiator">
            <code className={styles.mono}>{request.initiator}</code>
          </Cell>
        ) : null}
        <Cell label="Duration">
          <span className={styles.number}>{formatDurationMs(request.durationMs)}</span>
        </Cell>
        <Cell label="Request / Response size">
          <span className={styles.number}>
            {formatBytes(request.requestSize)} ↑ · {formatBytes(request.responseSize)} ↓
          </span>
        </Cell>
        {request.error ? (
          <Cell label="Error">
            <code className={styles.error}>{request.error}</code>
          </Cell>
        ) : null}
      </dl>

      {headerDiff.length > 0 ? (
        <section className={styles.headers} aria-label="Request and response header diff">
          <h4 className={styles.subhead}>Headers</h4>
          <div className={styles.headerGrid}>
            <div className={styles.headerColumnLabel}>Request</div>
            <div className={styles.headerColumnLabel}>Response</div>
            {headerDiff.map((row) => (
              <HeaderRow key={row.key} row={row} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

interface DiffRow {
  key: string;
  request?: string;
  response?: string;
  kind: 'same' | 'diff' | 'only-request' | 'only-response';
}

function computeHeaderDiff(
  requestHeaders: Record<string, string>,
  responseHeaders: Record<string, string>,
): DiffRow[] {
  const keys = new Set([...Object.keys(requestHeaders), ...Object.keys(responseHeaders)]);
  return [...keys].sort().map((key): DiffRow => {
    const req = requestHeaders[key];
    const res = responseHeaders[key];
    if (req !== undefined && res !== undefined) {
      const row: DiffRow = {
        key,
        request: req,
        response: res,
        kind: req === res ? 'same' : 'diff',
      };
      return row;
    }
    if (req !== undefined) return { key, request: req, kind: 'only-request' };
    return { key, response: res, kind: 'only-response' };
  });
}

function HeaderRow({ row }: { row: DiffRow }) {
  return (
    <>
      <div className={[styles.headerKey, styles[row.kind]].filter(Boolean).join(' ')}>
        {row.key}
      </div>
      <div className={styles.headerValue}>
        {row.request ?? <span className={styles.missing}>—</span>}
      </div>
      <div className={styles.headerValue}>
        {row.response ?? <span className={styles.missing}>—</span>}
      </div>
    </>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.cell}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{children}</span>
    </div>
  );
}
