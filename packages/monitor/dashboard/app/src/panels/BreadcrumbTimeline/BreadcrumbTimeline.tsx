import { useMemo } from 'react';
import { Panel } from '../../shared/ui/Panel/Panel';
import { Timestamp } from '../../shared/ui/Timestamp/Timestamp';
import { useEvents } from '../../shared/hooks/useEvents';
import { useUiStore } from '../../shared/store/uiStore';
import type { EventRecord } from '../../shared/api/types';
import { extractBreadcrumbs, type Breadcrumb } from './extract';
import { CATEGORY_GLYPH, CATEGORY_LABEL } from './icons';
import styles from './BreadcrumbTimeline.module.css';

export interface BreadcrumbTimelineProps {
  /** Event override for test/storybook rendering. */
  crashEvent?: EventRecord | null;
  sessionEvents?: EventRecord[];
  now?: number;
  limit?: number;
}

const FETCH_LIMIT = 200;

export function BreadcrumbTimeline(props: BreadcrumbTimelineProps = {}) {
  if (props.crashEvent !== undefined || props.sessionEvents !== undefined) {
    const passthrough: BreadcrumbTimelineViewProps = {
      ...(props.crashEvent !== undefined ? { crashEvent: props.crashEvent } : {}),
      ...(props.sessionEvents !== undefined ? { sessionEvents: props.sessionEvents } : {}),
      ...(props.now !== undefined ? { now: props.now } : {}),
      ...(props.limit !== undefined ? { limit: props.limit } : {}),
    };
    return <BreadcrumbTimelineView {...passthrough} />;
  }
  return (
    <BreadcrumbTimelineContainer
      {...(props.now !== undefined ? { now: props.now } : {})}
      {...(props.limit !== undefined ? { limit: props.limit } : {})}
    />
  );
}

function BreadcrumbTimelineContainer({ now, limit }: { now?: number; limit?: number }) {
  const selectedFingerprint = useUiStore((s) => s.selectedCrashFingerprint);
  const selectedSessionId = useUiStore((s) => s.selectedSessionId);

  const crashQuery = useEvents({
    filter: {
      type: 'crash',
      ...(selectedFingerprint ? { fingerprint: selectedFingerprint } : {}),
      limit: 1,
    },
    enabled: Boolean(selectedFingerprint),
  });

  const sessionQuery = useEvents({
    filter: {
      ...(selectedSessionId ? { sessionId: selectedSessionId } : {}),
      limit: FETCH_LIMIT,
    },
    enabled: !selectedFingerprint && Boolean(selectedSessionId),
  });

  const crashEvent = selectedFingerprint ? (crashQuery.data?.[0] ?? null) : null;
  const sessionEvents = sessionQuery.data ?? [];

  const viewProps: BreadcrumbTimelineViewProps = {
    crashEvent,
    sessionEvents,
    ...(now !== undefined ? { now } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };
  return <BreadcrumbTimelineView {...viewProps} />;
}

interface BreadcrumbTimelineViewProps {
  crashEvent?: EventRecord | null;
  sessionEvents?: EventRecord[];
  now?: number;
  limit?: number;
}

function BreadcrumbTimelineView({
  crashEvent,
  sessionEvents,
  now,
  limit,
}: BreadcrumbTimelineViewProps) {
  const crumbs = useMemo(
    () =>
      extractBreadcrumbs({
        crashEvent,
        sessionEvents: sessionEvents ?? [],
        ...(limit !== undefined ? { limit } : {}),
      }),
    [crashEvent, sessionEvents, limit],
  );

  const description = crashEvent
    ? `Last ${Math.min(crumbs.length, limit ?? 100)} actions captured at crash time.`
    : 'Recent session actions. Select a crash to freeze the trail at that moment.';

  return (
    <Panel title="Breadcrumb Timeline" description={description}>
      {crumbs.length === 0 ? (
        <div className={styles.empty}>No breadcrumbs to show yet.</div>
      ) : (
        <ol className={styles.timeline} aria-label="Breadcrumb trail">
          {crumbs.map((crumb) => (
            <BreadcrumbItem key={crumb.id} crumb={crumb} {...(now !== undefined ? { now } : {})} />
          ))}
        </ol>
      )}
    </Panel>
  );
}

function BreadcrumbItem({ crumb, now }: { crumb: Breadcrumb; now?: number }) {
  return (
    <li className={styles.item}>
      <span className={styles.marker} data-category={crumb.category} aria-hidden="true">
        <span className={styles.glyph}>{CATEGORY_GLYPH[crumb.category]}</span>
      </span>
      <div className={styles.body}>
        <div className={styles.header}>
          <span className={styles.category}>{CATEGORY_LABEL[crumb.category]}</span>
          <Timestamp ts={crumb.timestamp} {...(now !== undefined ? { now } : {})} />
        </div>
        <p className={styles.message}>{crumb.message}</p>
      </div>
    </li>
  );
}
