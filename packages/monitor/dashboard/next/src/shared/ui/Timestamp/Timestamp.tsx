import { formatAbsolute, formatRelative, type TimestampFormat } from './formatTimestamp';
import styles from './Timestamp.module.css';

export interface TimestampProps {
  ts: number;
  format?: TimestampFormat;
  now?: number;
}

export function Timestamp({ ts, format = 'relative', now }: TimestampProps) {
  const relative = formatRelative(ts, now);
  const absolute = formatAbsolute(ts, now);

  const body = format === 'absolute' ? absolute : relative;
  const title =
    format === 'both' ? `${relative} · ${absolute}` : format === 'relative' ? absolute : relative;

  return (
    <time className={styles.ts} dateTime={new Date(ts).toISOString()} title={title}>
      {body}
      {format === 'both' ? <span className={styles.divider}>·</span> : null}
      {format === 'both' ? <span className={styles.muted}>{absolute}</span> : null}
    </time>
  );
}
