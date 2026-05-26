import type { CrashGroupRecord } from '@/shared/api/types';
import { Pill } from '@/shared/ui/Pill/Pill';
import { Timestamp } from '@/shared/ui/Timestamp/Timestamp';
import styles from './CrashGroupList.module.css';

export interface CrashGroupListProps {
  groups: CrashGroupRecord[];
  selectedFingerprint: string | null;
  onSelect: (fingerprint: string) => void;
  now?: number;
}

const STATUS_SEVERITY: Record<
  CrashGroupRecord['status'],
  'critical' | 'warning' | 'success' | 'muted'
> = {
  new: 'critical',
  investigating: 'warning',
  resolved: 'success',
  ignored: 'muted',
};

export function CrashGroupList({
  groups,
  selectedFingerprint,
  onSelect,
  now,
}: CrashGroupListProps) {
  if (groups.length === 0) {
    return <p className={styles.empty}>No crashes recorded yet.</p>;
  }
  return (
    <ol className={styles.list} aria-label="Crash groups">
      {groups.map((group) => {
        const isSelected = group.fingerprint === selectedFingerprint;
        return (
          <li key={group.fingerprint} className={styles.item}>
            <button
              type="button"
              className={[styles.row, isSelected ? styles.selected : null]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelect(group.fingerprint)}
              aria-pressed={isSelected}
            >
              <div className={styles.topRow}>
                <Pill severity={STATUS_SEVERITY[group.status]} size="sm">
                  {group.status}
                </Pill>
                <span className={styles.fingerprint}>{group.fingerprint}</span>
                <span className={styles.count}>
                  ×{group.eventCount}
                  <span className={styles.sessions}>
                    {' '}
                    · {group.sessionCount} session{group.sessionCount === 1 ? '' : 's'}
                  </span>
                </span>
              </div>
              <p className={styles.message}>{group.message}</p>
              <div className={styles.meta}>
                {group.topScreen ? <span className={styles.screen}>{group.topScreen}</span> : null}
                <Timestamp ts={group.lastSeen} {...(now !== undefined ? { now } : {})} />
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
