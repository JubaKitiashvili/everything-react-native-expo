import { Pill } from '@/shared/ui/Pill/Pill';
import { Timestamp } from '@/shared/ui/Timestamp/Timestamp';
import type { AlertFiringRecord } from '@/shared/api/client';
import type { AlertRuleRecord } from '@/shared/api/types';
import styles from './HistoryList.module.css';

export interface HistoryListProps {
  history: AlertFiringRecord[];
  rules: AlertRuleRecord[];
  now?: number;
}

export function HistoryList({ history, rules, now }: HistoryListProps) {
  if (history.length === 0) {
    return <p className={styles.empty}>No alerts have fired recently.</p>;
  }
  const rulesById = new Map(rules.map((r) => [r.id, r]));
  return (
    <ul className={styles.list} aria-label="Fired alert history entries">
      {history.map((firing) => {
        const rule = rulesById.get(firing.ruleId);
        return (
          <li key={firing.id} className={styles.row}>
            <span className={styles.severity} data-severity={firing.severity} aria-hidden="true" />
            <div className={styles.body}>
              <div className={styles.head}>
                <span className={styles.name}>{rule?.name ?? firing.ruleId}</span>
                <Pill severity={firing.severity} size="sm">
                  {firing.severity}
                </Pill>
              </div>
              <div className={styles.meta}>
                <span>metric value {firing.metricValue}</span>
                <Timestamp ts={firing.firedAt} {...(now !== undefined ? { now } : {})} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
