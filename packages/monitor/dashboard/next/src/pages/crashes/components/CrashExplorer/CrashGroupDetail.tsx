import type { CrashGroupRecord, EventRecord } from '@/shared/api/types';
import { Pill } from '@/shared/ui/Pill/Pill';
import { Timestamp } from '@/shared/ui/Timestamp/Timestamp';
import { StackViewer } from './StackViewer';
import styles from './CrashGroupDetail.module.css';

export interface CrashGroupDetailProps {
  group: CrashGroupRecord;
  /** Most-recent event in this crash group (source of stack + breadcrumbs). */
  latestEvent?: EventRecord | null;
  now?: number;
}

export interface Breadcrumb {
  category?: string;
  message?: string;
  timestamp?: number;
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

export function CrashGroupDetail({ group, latestEvent, now }: CrashGroupDetailProps) {
  const stack = readStack(latestEvent);
  const breadcrumbs = readBreadcrumbs(latestEvent);
  const aiSuggestion = readAiSuggestion(group, latestEvent);

  return (
    <div className={styles.detail}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <Pill severity={STATUS_SEVERITY[group.status]} size="md">
            {group.status}
          </Pill>
          <code className={styles.fingerprint}>{group.fingerprint}</code>
        </div>
        <p className={styles.message}>{group.message}</p>
      </header>

      <section className={styles.metaGrid} aria-label="Crash group metadata">
        <MetaCell label="First seen">
          <Timestamp ts={group.firstSeen} {...(now !== undefined ? { now } : {})} />
        </MetaCell>
        <MetaCell label="Last seen">
          <Timestamp ts={group.lastSeen} {...(now !== undefined ? { now } : {})} />
        </MetaCell>
        <MetaCell label="Events">
          <span className={styles.number}>{group.eventCount}</span>
        </MetaCell>
        <MetaCell label="Sessions">
          <span className={styles.number}>{group.sessionCount}</span>
        </MetaCell>
        {group.topScreen ? (
          <MetaCell label="Top screen">
            <code className={styles.mono}>{group.topScreen}</code>
          </MetaCell>
        ) : null}
      </section>

      {aiSuggestion ? (
        <section className={styles.ai} aria-label="AI fix suggestion">
          <h3 className={styles.subhead}>Suggested fix</h3>
          <p className={styles.aiBody}>{aiSuggestion}</p>
        </section>
      ) : null}

      <section aria-label="Stack trace">
        <h3 className={styles.subhead}>Stack</h3>
        <StackViewer stack={stack} />
      </section>

      {breadcrumbs.length > 0 ? (
        <section aria-label="Breadcrumb trail">
          <h3 className={styles.subhead}>Breadcrumb trail</h3>
          <ol className={styles.breadcrumbs}>
            {breadcrumbs.map((crumb, i) => (
              <li key={i} className={styles.breadcrumb}>
                <span className={styles.category}>{crumb.category ?? 'event'}</span>
                <span className={styles.crumbMessage}>{crumb.message ?? ''}</span>
                {crumb.timestamp !== undefined ? (
                  <Timestamp ts={crumb.timestamp} {...(now !== undefined ? { now } : {})} />
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.metaCell}>
      <span className={styles.metaLabel}>{label}</span>
      <span className={styles.metaValue}>{children}</span>
    </div>
  );
}

function readStack(event: EventRecord | null | undefined): string {
  if (!event) return '';
  const payload = event.payload as { stack?: unknown };
  return typeof payload.stack === 'string' ? payload.stack : '';
}

function readBreadcrumbs(event: EventRecord | null | undefined): Breadcrumb[] {
  if (!event) return [];
  const payload = event.payload as { breadcrumbs?: unknown };
  if (!Array.isArray(payload.breadcrumbs)) return [];
  return payload.breadcrumbs.filter(
    (entry): entry is Breadcrumb => typeof entry === 'object' && entry !== null,
  );
}

function readAiSuggestion(
  group: CrashGroupRecord,
  event: EventRecord | null | undefined,
): string | null {
  const fromGroup = typeof group.aiSuggestion?.text === 'string' ? group.aiSuggestion.text : '';
  if (fromGroup.length > 0) return fromGroup;
  const fromEvent = event?.payload as { aiSuggestion?: { text?: unknown } };
  const text = typeof fromEvent?.aiSuggestion?.text === 'string' ? fromEvent.aiSuggestion.text : '';
  return text.length > 0 ? text : null;
}
