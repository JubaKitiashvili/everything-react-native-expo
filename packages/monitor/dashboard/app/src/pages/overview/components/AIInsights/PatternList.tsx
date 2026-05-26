import type { PatternHit } from './aggregate';
import styles from './PatternList.module.css';

export interface PatternListProps {
  hits: PatternHit[];
}

export function PatternList({ hits }: PatternListProps) {
  if (hits.length === 0) {
    return <div className={styles.empty}>No pattern hits yet.</div>;
  }
  const max = Math.max(...hits.map((h) => h.count), 1);
  return (
    <ol className={styles.list} aria-label="Pattern hits list">
      {hits.map((hit) => {
        const pct = (hit.count / max) * 100;
        return (
          <li key={hit.pattern} className={styles.row}>
            <div className={styles.head}>
              <span className={styles.pattern}>{hit.pattern}</span>
              <span className={styles.count}>
                ×{hit.count}
                <span className={styles.confidence}> · {Math.round(hit.avgConfidence * 100)}%</span>
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
