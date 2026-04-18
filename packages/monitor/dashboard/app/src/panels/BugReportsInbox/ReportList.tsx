import { Pill } from '../../shared/ui/Pill/Pill';
import { Timestamp } from '../../shared/ui/Timestamp/Timestamp';
import type { BugReportRecord } from '../../shared/api/types';
import styles from './ReportList.module.css';

export interface ReportListProps {
  reports: BugReportRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  now?: number;
}

const STATUS_SEVERITY: Record<
  BugReportRecord['status'],
  'critical' | 'warning' | 'success' | 'muted'
> = {
  new: 'critical',
  assigned: 'warning',
  resolved: 'success',
};

export function ReportList({ reports, selectedId, onSelect, now }: ReportListProps) {
  if (reports.length === 0) {
    return <p className={styles.empty}>No bug reports yet.</p>;
  }
  return (
    <ol className={styles.list} aria-label="Bug report entries">
      {reports.map((report) => {
        const isSelected = report.id === selectedId;
        return (
          <li key={report.id} className={styles.item}>
            <button
              type="button"
              className={[styles.row, isSelected ? styles.selected : null]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelect(report.id)}
              aria-pressed={isSelected}
            >
              <div className={styles.top}>
                <span className={styles.title}>{report.title ?? '(untitled report)'}</span>
                <Pill severity={STATUS_SEVERITY[report.status]} size="sm">
                  {report.status}
                </Pill>
              </div>
              <p className={styles.preview}>{report.description ?? 'No description provided.'}</p>
              <div className={styles.meta}>
                <span>{report.assignee ? `@${report.assignee}` : 'unassigned'}</span>
                <Timestamp ts={report.submittedAt} {...(now !== undefined ? { now } : {})} />
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
