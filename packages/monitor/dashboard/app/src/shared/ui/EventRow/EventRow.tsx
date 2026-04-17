import { type ReactNode } from 'react';
import { type Severity } from '../../../tokens';
import { Pill } from '../Pill/Pill';
import { Timestamp } from '../Timestamp/Timestamp';
import styles from './EventRow.module.css';

export interface EventRowProps {
  timestamp: number;
  type: string;
  severity: Severity;
  message: ReactNode;
  summary?: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  now?: number;
}

export function EventRow({
  timestamp,
  type,
  severity,
  message,
  summary,
  selected = false,
  onSelect,
  now,
}: EventRowProps) {
  const className = [
    styles.row,
    selected ? styles.selected : null,
    onSelect ? styles.clickable : null,
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      <span className={styles.dot} data-severity={severity} aria-hidden="true" />
      <Timestamp ts={timestamp} now={now} />
      <Pill severity={severity} size="sm">
        {type}
      </Pill>
      <span className={styles.message}>{message}</span>
      {summary ? <span className={styles.summary}>{summary}</span> : null}
    </>
  );

  if (onSelect) {
    return (
      <button
        type="button"
        className={className}
        onClick={onSelect}
        aria-pressed={selected}
        data-severity={severity}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={className} data-severity={severity}>
      {content}
    </div>
  );
}
