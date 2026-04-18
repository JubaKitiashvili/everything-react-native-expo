import { formatDuration, type ScreenOffender } from './aggregate';
import styles from './TopScreens.module.css';

export interface TopScreensProps {
  offenders: ScreenOffender[];
}

export function TopScreens({ offenders }: TopScreensProps) {
  if (offenders.length === 0) {
    return <div className={styles.empty}>No offender screens yet.</div>;
  }
  const max = Math.max(...offenders.map((o) => o.count), 1);
  return (
    <ol className={styles.list} aria-label="Offender screens list">
      {offenders.map((offender) => {
        const pct = (offender.count / max) * 100;
        return (
          <li key={offender.screen} className={styles.row}>
            <div className={styles.head}>
              <span className={styles.screen}>{offender.screen}</span>
              <span className={styles.count}>
                {offender.count} ·{' '}
                <span className={styles.longest}>worst {formatDuration(offender.longestMs)}</span>
              </span>
            </div>
            <div className={styles.track}>
              <div className={styles.fill} style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
