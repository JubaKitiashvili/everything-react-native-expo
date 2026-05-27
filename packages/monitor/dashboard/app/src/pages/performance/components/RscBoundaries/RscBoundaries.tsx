import { useMemo } from 'react';
import { Panel } from '@/shared/ui/Panel/Panel';
import { Pill } from '@/shared/ui/Pill/Pill';
import { useEvents } from '@/shared/hooks/useEvents';
import type { EventRecord, Severity } from '@/shared/api/types';
import {
  aggregateRscBoundaries,
  type RscBoundariesSummary,
  type RscBoundaryStatus,
  type RscBoundarySummary,
} from './aggregate';
import styles from './RscBoundaries.module.css';

const DESCRIPTION =
  'React Server Component boundaries by route — server render timing, payload size, cache hits, and streaming state.';

/** How many boundaries to fetch from the event store. */
const EVENT_LIMIT = 500;

export interface RscBoundariesProps {
  /** Test/storybook escape hatch — bypass the live query when provided. */
  events?: EventRecord[];
}

export function RscBoundaries({ events }: RscBoundariesProps = {}) {
  if (events !== undefined) {
    return <RscBoundariesView events={events} />;
  }
  return <RscBoundariesContainer />;
}

function RscBoundariesContainer() {
  // The server's canonical ingest promotes the SDK's custom `rsc` events to
  // top-level `type: 'rsc'`, so query that directly (matches aggregate + seed).
  const query = useEvents({ filter: { type: 'rsc', limit: EVENT_LIMIT }, staleTime: 10_000 });

  if (query.isPending) {
    return (
      <Panel title="RSC Boundaries" description={DESCRIPTION}>
        <div className={styles.placeholder}>Loading RSC boundaries…</div>
      </Panel>
    );
  }
  if (query.isError) {
    return (
      <Panel title="RSC Boundaries" description={DESCRIPTION}>
        <div className={styles.error}>
          Couldn&apos;t load RSC events: {String((query.error as Error)?.message ?? '')}
        </div>
      </Panel>
    );
  }
  return <RscBoundariesView events={query.data ?? []} />;
}

function RscBoundariesView({ events }: { events: EventRecord[] }) {
  const summary = useMemo<RscBoundariesSummary>(() => aggregateRscBoundaries(events), [events]);

  return (
    <Panel
      title="RSC Boundaries"
      description={DESCRIPTION}
      action={
        summary.routeCount > 0 ? (
          <span className={styles.meta}>
            {summary.routeCount} route{summary.routeCount === 1 ? '' : 's'} ·{' '}
            {summary.totalRenders} render{summary.totalRenders === 1 ? '' : 's'}
          </span>
        ) : undefined
      }
    >
      {summary.boundaries.length === 0 ? (
        <div className={styles.empty}>No RSC boundaries captured yet.</div>
      ) : (
        <table className={styles.table} aria-label="RSC boundaries">
          <thead>
            <tr>
              <th scope="col">Route</th>
              <th scope="col" className={styles.num}>
                Renders
              </th>
              <th scope="col" className={styles.num}>
                Avg
              </th>
              <th scope="col" className={styles.num}>
                P95
              </th>
              <th scope="col" className={styles.num}>
                Payload
              </th>
              <th scope="col" className={styles.num}>
                Cache
              </th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {summary.boundaries.map((boundary) => (
              <BoundaryRow key={boundary.route} boundary={boundary} />
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function BoundaryRow({ boundary }: { boundary: RscBoundarySummary }) {
  return (
    <tr>
      <th scope="row" className={styles.route} title={boundary.route}>
        {boundary.route}
      </th>
      <td className={styles.num}>{boundary.renders}</td>
      <td className={styles.num}>{formatMs(boundary.avgMs)}</td>
      <td className={styles.num}>{formatMs(boundary.p95Ms)}</td>
      <td className={styles.num}>
        {boundary.maxPayloadBytes > 0 ? formatBytes(boundary.maxPayloadBytes) : '—'}
      </td>
      <td className={styles.num}>
        {boundary.cacheSamples > 0 ? `${Math.round(boundary.cacheHitRatio * 100)}%` : '—'}
      </td>
      <td>
        <Pill severity={statusSeverity(boundary.status)} size="sm">
          {statusLabel(boundary)}
        </Pill>
      </td>
    </tr>
  );
}

function statusSeverity(status: RscBoundaryStatus): Severity {
  switch (status) {
    case 'slow':
      return 'warning';
    case 'streaming':
      return 'info';
    case 'ok':
      return 'success';
  }
}

function statusLabel(boundary: RscBoundarySummary): string {
  switch (boundary.status) {
    case 'slow':
      return 'Slow';
    case 'streaming':
      return `Streaming ${boundary.chunksReceived}/${boundary.chunkTotal}`;
    case 'ok':
      return 'OK';
  }
}

function formatMs(ms: number): string {
  if (ms <= 0) return '—';
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 100) return `${ms.toFixed(1)} ms`;
  return `${Math.round(ms)} ms`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
