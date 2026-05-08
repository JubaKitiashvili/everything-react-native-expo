// Task 117.22 — ANR detail view (drill-down).
//
// Renders one ANR instance with the full stack, summary chips, and a
// "same ANR seen before" recurrence list grouped by fingerprint.
// Stays a pure presentation component — selection state lives in the
// parent so the URL story is easy when react-router lands (117.1).

import { Timestamp } from '../../shared/ui/Timestamp/Timestamp';
import { formatDuration, type AnrInstance } from './aggregate';
import styles from './ANRDetail.module.css';

export interface ANRDetailProps {
  instance: AnrInstance;
  /** Other instances sharing the same fingerprint (newest-first). */
  recurrence: readonly AnrInstance[];
  onBack: () => void;
  /**
   * Optional select handler so clicking an entry in the recurrence
   * list jumps to that instance's detail view.
   */
  onSelectInstance?: (id: string) => void;
  now?: number;
}

export function ANRDetail({
  instance,
  recurrence,
  onBack,
  onSelectInstance,
  now,
}: ANRDetailProps) {
  const durationClass =
    instance.durationMs >= 10_000
      ? styles.durationCritical
      : instance.durationMs >= 5_000
        ? styles.durationWarning
        : '';

  // First "at …" frame is the most actionable — it's where the main
  // thread was when the watchdog fired. We highlight it visually so
  // the eye lands on the culprit without reading the whole stack.
  const topFrameIndex = instance.stackFrames.findIndex((f) => f.startsWith('at '));

  return (
    <div className={styles.root} aria-label="ANR detail">
      <div className={styles.headerBar}>
        <button type="button" className={styles.backButton} onClick={onBack} aria-label="Back to ANR list">
          ← Back to list
        </button>
        <span className={styles.summaryLabel}>
          {instance.kind === 'native_anr' ? 'Native ANR' : 'JS ANR'}
        </span>
      </div>

      <div className={styles.summary}>
        <div className={styles.summaryCell}>
          <span className={styles.summaryLabel}>Duration</span>
          <span className={`${styles.summaryValue} ${durationClass}`}>
            {formatDuration(instance.durationMs)}
          </span>
        </div>
        <div className={styles.summaryCell}>
          <span className={styles.summaryLabel}>Screen</span>
          <span className={styles.summaryValue}>{instance.screen ?? '<unknown>'}</span>
        </div>
        <div className={styles.summaryCell}>
          <span className={styles.summaryLabel}>When</span>
          <span className={styles.summaryValue}>
            <Timestamp ts={instance.timestamp} {...(now !== undefined ? { now } : {})} />
          </span>
        </div>
        <div className={styles.summaryCell}>
          <span className={styles.summaryLabel}>Session</span>
          <span className={styles.summaryValue} title={instance.sessionId}>
            {truncate(instance.sessionId, 14)}
          </span>
        </div>
      </div>

      <section className={styles.stackPanel} aria-label="Stack at ANR time">
        <h3 className={styles.subhead}>Stack at ANR time</h3>
        {instance.stackFrames.length === 0 ? (
          <div className={styles.stackEmpty}>No JS frames captured (native ANR).</div>
        ) : (
          <ol className={styles.stackList}>
            {instance.stackFrames.map((frame, idx) => (
              <li
                key={`${idx}:${frame}`}
                className={[
                  styles.stackFrame,
                  idx === topFrameIndex ? styles.stackFrameTop : '',
                  !frame.startsWith('at ') ? styles.stackHeader : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className={styles.stackIndex} aria-hidden>
                  {frame.startsWith('at ') ? `#${idx}` : ''}
                </span>
                <code>{frame}</code>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className={styles.recurrencePanel} aria-label="Recurrences with same fingerprint">
        <h3 className={styles.subhead}>
          Same fingerprint ({recurrence.length} occurrence{recurrence.length === 1 ? '' : 's'})
        </h3>
        {recurrence.length === 0 ? (
          <div className={styles.notice}>This is the only ANR with this fingerprint so far.</div>
        ) : (
          <ul className={styles.recurrenceList}>
            {recurrence.map((entry) => {
              const isActive = entry.id === instance.id;
              const content = (
                <>
                  <span>
                    <Timestamp ts={entry.timestamp} {...(now !== undefined ? { now } : {})} />{' '}
                    <span className={styles.recurrenceCount}>on {entry.screen ?? '<unknown>'}</span>
                  </span>
                  <span className={styles.recurrenceCountStrong}>
                    {formatDuration(entry.durationMs)}
                  </span>
                </>
              );
              const className = `${styles.recurrenceRow}${isActive ? ` ${styles.recurrenceRowActive}` : ''}`;
              if (onSelectInstance && !isActive) {
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className={className}
                      style={{ width: '100%', appearance: 'none', border: 0, background: 'none', font: 'inherit', color: 'inherit', textAlign: 'inherit' }}
                      onClick={() => onSelectInstance(entry.id)}
                      aria-label={`Open ANR from ${entry.screen ?? 'unknown screen'}, ${formatDuration(entry.durationMs)}`}
                    >
                      {content}
                    </button>
                  </li>
                );
              }
              return (
                <li key={entry.id} className={className} aria-current={isActive ? 'true' : undefined}>
                  {content}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
