import { Pill } from '../../shared/ui/Pill/Pill';
import { Timestamp } from '../../shared/ui/Timestamp/Timestamp';
import type { AlertRuleRecord } from '../../shared/api/types';
import styles from './RuleList.module.css';

export interface RuleListProps {
  rules: AlertRuleRecord[];
  onEdit?: (rule: AlertRuleRecord) => void;
  onDelete?: (id: string) => void;
  deletingId?: string | null;
  now?: number;
}

export function RuleList({ rules, onEdit, onDelete, deletingId, now }: RuleListProps) {
  if (rules.length === 0) {
    return <p className={styles.empty}>No rules yet. Create one on the left to get started.</p>;
  }
  return (
    <ul className={styles.list} aria-label="Alert rule items">
      {rules.map((rule) => (
        <li key={rule.id} className={styles.row}>
          <div className={styles.head}>
            <span className={styles.name}>{rule.name}</span>
            <Pill severity={rule.enabled ? 'success' : 'muted'} size="sm">
              {rule.enabled ? 'enabled' : 'disabled'}
            </Pill>
          </div>
          <div className={styles.meta}>
            <code className={styles.mono}>{rule.metric}</code>
            <span>≥ {rule.threshold}</span>
            <span>in {formatSeconds(rule.windowSeconds)}</span>
            <span>· cooldown {formatSeconds(rule.cooldownSeconds)}</span>
          </div>
          <div className={styles.channels}>
            {rule.channels.length === 0 ? (
              <span className={styles.empty}>no channels</span>
            ) : (
              rule.channels.map((channel) => (
                <Pill key={channel} size="sm" severity="info">
                  {channel}
                </Pill>
              ))
            )}
          </div>
          <div className={styles.footer}>
            <span className={styles.updated}>
              updated <Timestamp ts={rule.updatedAt} {...(now !== undefined ? { now } : {})} />
            </span>
            <div className={styles.actions}>
              {onEdit ? (
                <button type="button" className={styles.ghost} onClick={() => onEdit(rule)}>
                  Edit
                </button>
              ) : null}
              {onDelete ? (
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() => onDelete(rule.id)}
                  disabled={deletingId === rule.id}
                  aria-busy={deletingId === rule.id}
                >
                  {deletingId === rule.id ? 'Deleting…' : 'Delete'}
                </button>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86_400) return `${(seconds / 3_600).toFixed(1)} h`;
  return `${(seconds / 86_400).toFixed(1)} d`;
}
