import { useMemo } from 'react';
import { Panel } from '@/shared/ui/Panel/Panel';
import { Pill } from '@/shared/ui/Pill/Pill';
import { useEvents } from '@/shared/hooks/useEvents';
import type { EventRecord, Severity } from '@/shared/api/types';
import {
  aggregateSuspense,
  type SuspenseBoundaryStatus,
  type SuspenseBoundarySummary,
  type SuspenseSummary,
} from './aggregate';
import styles from './SuspensePanel.module.css';

const DESCRIPTION =
  'Suspense fallback stalls by boundary — how long each fallback was shown, nesting depth, and resolved vs errored outcomes.';

/** How many suspense events to fetch from the event store. */
const EVENT_LIMIT = 500;

export interface SuspensePanelProps {
  /** Test/storybook escape hatch — bypass the live query when provided. */
  events?: EventRecord[];
}

export function SuspensePanel({ events }: SuspensePanelProps = {}) {
  if (events !== undefined) {
    return <SuspenseView events={events} />;
  }
  return <SuspenseContainer />;
}

function SuspenseContainer() {
  const query = useEvents({ filter: { type: 'suspense', limit: EVENT_LIMIT }, staleTime: 10_000 });

  if (query.isPending) {
    return (
      <Panel title="Suspense Stalls" description={DESCRIPTION}>
        <div className={styles.placeholder}>Loading Suspense stalls…</div>
      </Panel>
    );
  }
  if (query.isError) {
    return (
      <Panel title="Suspense Stalls" description={DESCRIPTION}>
        <div className={styles.error}>
          Couldn&apos;t load Suspense events: {String((query.error as Error)?.message ?? '')}
        </div>
      </Panel>
    );
  }
  return <SuspenseView events={query.data ?? []} />;
}

function SuspenseView({ events }: { events: EventRecord[] }) {
  const summary = useMemo<SuspenseSummary>(() => aggregateSuspense(events), [events]);

  return (
    <Panel
      title="Suspense Stalls"
      description={DESCRIPTION}
      action={
        summary.boundaryCount > 0 ? (
          <span className={styles.meta}>
            {summary.boundaryCount} boundar{summary.boundaryCount === 1 ? 'y' : 'ies'} ·{' '}
            {summary.totalStalls} stall{summary.totalStalls === 1 ? '' : 's'}
          </span>
        ) : undefined
      }
    >
      {summary.boundaries.length === 0 ? (
        <div className={styles.empty}>No Suspense stalls captured yet.</div>
      ) : (
        <table className={styles.table} aria-label="Suspense stalls">
          <thead>
            <tr>
              <th scope="col">Boundary</th>
              <th scope="col" className={styles.num}>
                Stalls
              </th>
              <th scope="col" className={styles.num}>
                Avg
              </th>
              <th scope="col" className={styles.num}>
                P95
              </th>
              <th scope="col" className={styles.num}>
                Longest
              </th>
              <th scope="col" className={styles.num}>
                Depth
              </th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {summary.boundaries.map((boundary) => (
              <BoundaryRow key={boundary.boundary} boundary={boundary} />
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function BoundaryRow({ boundary }: { boundary: SuspenseBoundarySummary }) {
  return (
    <tr>
      <th scope="row" className={styles.boundary} title={boundary.boundary}>
        {boundary.boundary}
      </th>
      <td className={styles.num}>{boundary.stalls}</td>
      <td className={styles.num}>{formatMs(boundary.avgMs)}</td>
      <td className={styles.num}>{formatMs(boundary.p95Ms)}</td>
      <td className={styles.num}>{formatMs(boundary.longestMs)}</td>
      <td className={styles.num}>{boundary.maxDepth > 0 ? boundary.maxDepth : '—'}</td>
      <td>
        <Pill
          severity={statusSeverity(boundary.status)}
          size="sm"
          ariaLabel={boundary.lastError ? `Error: ${boundary.lastError}` : undefined}
        >
          {statusLabel(boundary)}
        </Pill>
      </td>
    </tr>
  );
}

function statusSeverity(status: SuspenseBoundaryStatus): Severity {
  switch (status) {
    case 'error':
      return 'critical';
    case 'slow':
      return 'warning';
    case 'ok':
      return 'success';
  }
}

function statusLabel(boundary: SuspenseBoundarySummary): string {
  switch (boundary.status) {
    case 'error':
      return boundary.errored === 1 ? 'Errored' : `Errored ${boundary.errored}×`;
    case 'slow':
      return 'Slow';
    case 'ok':
      return 'OK';
  }
}

function formatMs(ms: number): string {
  if (ms <= 0) return '—';
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 100) return `${ms.toFixed(1)} ms`;
  if (ms < 10_000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}
