import { useState, type FormEvent } from 'react';
import { Pill } from '@/shared/ui/Pill/Pill';
import { Timestamp } from '@/shared/ui/Timestamp/Timestamp';
import type { BugReportRecord } from '@/shared/api/types';
import type { UpdateBugReportInput } from '@/shared/api/client';
import styles from './ReportDetail.module.css';

export interface ReportDetailProps {
  report: BugReportRecord;
  onUpdate?: (id: string, patch: UpdateBugReportInput) => void;
  busy?: boolean;
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

export function ReportDetail({ report, onUpdate, busy, now }: ReportDetailProps) {
  const [assigneeDraft, setAssigneeDraft] = useState<string>(report.assignee ?? '');
  const screenshotUrl = readScreenshotUrl(report);
  const breadcrumbs = readBreadcrumbs(report);
  const device = readDevice(report);
  const isBusy = Boolean(busy);

  const handleAssign = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = assigneeDraft.trim();
    const patch: UpdateBugReportInput = {};
    if (trimmed.length > 0) patch.assignee = trimmed;
    patch.status = 'assigned';
    onUpdate?.(report.id, patch);
  };

  return (
    <div className={styles.detail}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>{report.title ?? '(untitled report)'}</h3>
          <Pill severity={STATUS_SEVERITY[report.status]} size="md">
            {report.status}
          </Pill>
        </div>
        <div className={styles.meta}>
          <span>session {report.sessionId}</span>
          <Timestamp
            ts={report.submittedAt}
            format="both"
            {...(now !== undefined ? { now } : {})}
          />
        </div>
      </header>

      {report.description ? (
        <section className={styles.description} aria-label="Report description">
          <p className={styles.descriptionBody}>{report.description}</p>
        </section>
      ) : null}

      {screenshotUrl ? (
        <section className={styles.screenshot} aria-label="Report screenshot">
          <img src={screenshotUrl} alt="Bug report screenshot" className={styles.screenshotImage} />
        </section>
      ) : null}

      {device ? (
        <section aria-label="Device info">
          <h4 className={styles.subhead}>Device</h4>
          <dl className={styles.deviceGrid}>
            {Object.entries(device).map(([key, value]) => (
              <div key={key} className={styles.deviceCell}>
                <dt>{key}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {breadcrumbs.length > 0 ? (
        <section aria-label="Report breadcrumbs">
          <h4 className={styles.subhead}>Breadcrumbs</h4>
          <ol className={styles.breadcrumbs}>
            {breadcrumbs.map((crumb, i) => (
              <li key={i} className={styles.crumb}>
                <span className={styles.crumbCategory}>{crumb.category ?? 'event'}</span>
                <span className={styles.crumbMessage}>{crumb.message ?? ''}</span>
                {crumb.timestamp !== undefined ? (
                  <Timestamp ts={crumb.timestamp} {...(now !== undefined ? { now } : {})} />
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <form className={styles.actions} onSubmit={handleAssign} aria-label="Assign report form">
        <input
          className={styles.input}
          placeholder="assignee"
          value={assigneeDraft}
          onChange={(e) => setAssigneeDraft(e.target.value)}
        />
        <button type="submit" className={styles.primary} disabled={isBusy} aria-busy={isBusy}>
          {isBusy ? 'Saving…' : 'Assign'}
        </button>
        <button
          type="button"
          className={styles.ghost}
          disabled={isBusy || report.status === 'resolved'}
          aria-busy={isBusy}
          onClick={() => onUpdate?.(report.id, { status: 'resolved' })}
        >
          {isBusy ? 'Saving…' : 'Mark resolved'}
        </button>
      </form>
    </div>
  );
}

interface Breadcrumb {
  category?: string;
  message?: string;
  timestamp?: number;
}

function readScreenshotUrl(report: BugReportRecord): string | null {
  const attachments = report.attachments ?? {};
  const value =
    typeof attachments.screenshotUrl === 'string'
      ? attachments.screenshotUrl
      : typeof attachments.screenshot === 'string'
        ? attachments.screenshot
        : '';
  return value.length > 0 ? value : null;
}

function readBreadcrumbs(report: BugReportRecord): Breadcrumb[] {
  const attachments = report.attachments ?? {};
  if (!Array.isArray(attachments.breadcrumbs)) return [];
  return attachments.breadcrumbs.filter(
    (entry): entry is Breadcrumb => typeof entry === 'object' && entry !== null,
  );
}

function readDevice(report: BugReportRecord): Record<string, unknown> | null {
  const attachments = report.attachments ?? {};
  const device = attachments.device;
  if (!device || typeof device !== 'object') return null;
  const entries = Object.entries(device as Record<string, unknown>);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}
