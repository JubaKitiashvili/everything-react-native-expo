import { useEffect, useMemo, useState } from 'react';
import { Panel } from '@/shared/ui/Panel/Panel';
import { FilterBar } from '@/shared/ui/FilterBar/FilterBar';
import { Pill } from '@/shared/ui/Pill/Pill';
import { useEvents } from '@/shared/hooks/useEvents';
import { useSessions } from '@/shared/hooks/useSessions';
import { useUiStore } from '@/shared/store/uiStore';
import type { EventRecord } from '@/shared/api/types';
import { extractNetworkRequests, type NetworkRequest, type RequestSeverity } from './aggregate';
import { RequestRow } from './RequestRow';
import { RequestDetail } from './RequestDetail';
import styles from './NetworkWaterfall.module.css';

export interface NetworkWaterfallProps {
  events?: EventRecord[];
  now?: number;
}

type SeverityFilter = 'all' | RequestSeverity;

const FILTER_OPTIONS: Array<{
  key: SeverityFilter;
  label: string;
  severity: 'muted' | 'critical' | 'warning' | 'success';
}> = [
  { key: 'all', label: 'all', severity: 'muted' },
  { key: 'error', label: 'errors', severity: 'critical' },
  { key: 'slow', label: 'slow', severity: 'warning' },
  { key: 'ok', label: 'ok', severity: 'success' },
];

export function NetworkWaterfall({ events, now }: NetworkWaterfallProps = {}) {
  if (events !== undefined) {
    return <NetworkWaterfallView events={events} {...(now !== undefined ? { now } : {})} />;
  }
  return <NetworkWaterfallContainer {...(now !== undefined ? { now } : {})} />;
}

function NetworkWaterfallContainer({ now }: { now?: number }) {
  const sessions = useSessions();
  const selectedSessionId = useUiStore((s) => s.selectedSessionId);
  const setSelectedSession = useUiStore((s) => s.setSelectedSession);

  useEffect(() => {
    if (selectedSessionId) return;
    const firstSession = sessions.data?.[0];
    if (firstSession) setSelectedSession(firstSession.id);
  }, [selectedSessionId, sessions.data, setSelectedSession]);

  const query = useEvents({
    filter: {
      type: 'network',
      limit: 500,
      ...(selectedSessionId ? { sessionId: selectedSessionId } : {}),
    },
    enabled: true,
  });

  if (query.isPending) {
    return (
      <Panel title="Network Waterfall" description="Per-session request timeline.">
        <div className={styles.placeholder}>Loading network requests…</div>
      </Panel>
    );
  }
  if (query.isError) {
    return (
      <Panel title="Network Waterfall" description="Per-session request timeline.">
        <div className={styles.error}>
          Couldn&apos;t load network events: {String((query.error as Error)?.message ?? '')}
        </div>
      </Panel>
    );
  }
  return <NetworkWaterfallView events={query.data ?? []} {...(now !== undefined ? { now } : {})} />;
}

interface ViewProps {
  events: EventRecord[];
  now?: number;
}

function NetworkWaterfallView({ events }: ViewProps) {
  const requests = useMemo(() => extractNetworkRequests(events), [events]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');

  const filtered = useMemo(() => {
    if (severityFilter === 'all') return requests;
    return requests.filter((r) => r.severity === severityFilter);
  }, [requests, severityFilter]);

  const maxMs = useMemo(() => {
    if (filtered.length === 0) return 0;
    return Math.max(...filtered.map((r) => r.durationMs), 1);
  }, [filtered]);

  const summary = useMemo(() => {
    const counts: Record<RequestSeverity, number> = { error: 0, slow: 0, ok: 0 };
    for (const request of requests) counts[request.severity] += 1;
    return counts;
  }, [requests]);

  return (
    <Panel
      title="Network Waterfall"
      description="Per-session request timeline with slow/errored highlight."
      bleed
      action={
        <FilterBar ariaLabel="Network severity filters">
          {FILTER_OPTIONS.map((opt) => (
            <Pill
              key={opt.key}
              severity={severityFilter === opt.key ? opt.severity : 'muted'}
              size="sm"
              interactive
              onClick={() => setSeverityFilter(opt.key)}
              ariaLabel={`Filter to ${opt.label}`}
            >
              {opt.label}
              {opt.key !== 'all' ? <span className={styles.count}>{summary[opt.key]}</span> : null}
            </Pill>
          ))}
        </FilterBar>
      }
    >
      <div className={styles.body}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            {requests.length === 0
              ? 'No network requests captured yet.'
              : 'No requests match the current filter.'}
          </div>
        ) : (
          <ol className={styles.list} aria-label="Network requests">
            {filtered.map((request) => (
              <RequestItem
                key={request.id}
                request={request}
                windowMaxMs={maxMs}
                expanded={expandedId === request.id}
                onToggle={() => setExpandedId((prev) => (prev === request.id ? null : request.id))}
              />
            ))}
          </ol>
        )}
      </div>
    </Panel>
  );
}

function RequestItem({
  request,
  windowMaxMs,
  expanded,
  onToggle,
}: {
  request: NetworkRequest;
  windowMaxMs: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <li className={styles.item}>
      <RequestRow
        request={request}
        windowMaxMs={windowMaxMs}
        expanded={expanded}
        onToggle={onToggle}
      />
      {expanded ? <RequestDetail request={request} /> : null}
    </li>
  );
}
