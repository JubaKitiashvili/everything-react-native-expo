import { useMemo } from 'react';
import { Panel } from '@/shared/ui/Panel/Panel';
import { FilterBar } from '@/shared/ui/FilterBar/FilterBar';
import { Pill } from '@/shared/ui/Pill/Pill';
import { EventRow } from '@/shared/ui/EventRow/EventRow';
import { useEvents } from '@/shared/hooks/useEvents';
import { useUiStore, type TypeFilterKey } from '@/shared/store/uiStore';
import type { Severity } from '@/shared/api/types';
import { EventDetailDrawer } from './EventDetailDrawer';
import { filterEvents, groupEvents, type EventGroup } from './groupEvents';
import styles from './LiveFeed.module.css';

export interface LiveFeedProps {
  /** Injected only for deterministic timestamp rendering in tests. */
  now?: number;
}

const TYPE_OPTIONS: Array<{ key: TypeFilterKey; label: string; severity: Severity }> = [
  { key: 'crash', label: 'crash', severity: 'critical' },
  { key: 'anr', label: 'anr', severity: 'warning' },
  { key: 'network', label: 'network', severity: 'info' },
  { key: 'custom', label: 'custom', severity: 'muted' },
];

const SEVERITY_OPTIONS: Array<{ key: Severity; label: string }> = [
  { key: 'critical', label: 'critical' },
  { key: 'warning', label: 'warning' },
  { key: 'info', label: 'info' },
  { key: 'success', label: 'success' },
  { key: 'muted', label: 'muted' },
];

export function LiveFeed({ now }: LiveFeedProps) {
  const events = useEvents({ filter: { limit: 200 } });
  const filters = useUiStore((s) => s.filters);
  const selectedEventId = useUiStore((s) => s.selectedEventId);
  const setSelectedEvent = useUiStore((s) => s.setSelectedEvent);
  const toggleTypeFilter = useUiStore((s) => s.toggleTypeFilter);
  const toggleSeverityFilter = useUiStore((s) => s.toggleSeverityFilter);
  const setSearch = useUiStore((s) => s.setSearch);

  const groups: EventGroup[] = useMemo(() => {
    if (!events.data) return [];
    const activeTypes = new Set<string>(
      (Object.keys(filters.type) as TypeFilterKey[]).filter((k) => filters.type[k]),
    );
    const activeSeverities = new Set<Severity>(
      (Object.keys(filters.severity) as Severity[]).filter((k) => filters.severity[k]),
    );
    const filtered = filterEvents(events.data, {
      types: activeTypes,
      severities: activeSeverities,
      search: filters.search,
    });
    return groupEvents(filtered);
  }, [events.data, filters]);

  const selectedEvent = useMemo(() => {
    if (!selectedEventId || !events.data) return null;
    return events.data.find((e) => e.id === selectedEventId) ?? null;
  }, [selectedEventId, events.data]);

  return (
    <Panel
      title="Live feed"
      description="Most recent monitor events, grouped to hide render storms."
      bleed
      action={
        <FilterBar ariaLabel="Live feed filters">
          {TYPE_OPTIONS.map((opt) => (
            <Pill
              key={opt.key}
              severity={filters.type[opt.key] ? opt.severity : 'muted'}
              size="sm"
              interactive
              onClick={() => toggleTypeFilter(opt.key)}
              ariaLabel={`Toggle ${opt.label} filter`}
            >
              {opt.label}
            </Pill>
          ))}
          <span className={styles.divider} aria-hidden="true" />
          {SEVERITY_OPTIONS.map((opt) => (
            <Pill
              key={opt.key}
              severity={filters.severity[opt.key] ? opt.key : 'muted'}
              size="sm"
              interactive
              onClick={() => toggleSeverityFilter(opt.key)}
              ariaLabel={`Toggle ${opt.label} severity`}
            >
              {opt.label}
            </Pill>
          ))}
          <input
            className={styles.search}
            type="search"
            placeholder="Search message, type, screen, session…"
            value={filters.search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search events"
          />
        </FilterBar>
      }
    >
      <div className={styles.body}>
        {events.isPending ? <LoadingState /> : null}
        {events.isError ? (
          <ErrorState message={String((events.error as Error)?.message ?? '')} />
        ) : null}
        {events.isSuccess && groups.length === 0 ? <EmptyState /> : null}
        {groups.length > 0 ? (
          <ol className={styles.list}>
            {groups.map((group) => (
              <li key={group.id} className={styles.row}>
                <EventRow
                  timestamp={group.representative.timestamp}
                  type={group.representative.type}
                  severity={group.representative.severity}
                  message={messageOf(group)}
                  summary={summaryOf(group)}
                  selected={group.representative.id === selectedEventId}
                  onSelect={() => setSelectedEvent(group.representative.id)}
                  {...(now !== undefined ? { now } : {})}
                />
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      {selectedEvent ? (
        <EventDetailDrawer
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          {...(now !== undefined ? { now } : {})}
        />
      ) : null}
    </Panel>
  );
}

function messageOf(group: EventGroup): string {
  const event = group.representative;
  const rawMessage = String((event.payload as { message?: unknown })?.message ?? '');
  if (rawMessage.length > 0) return rawMessage;
  return event.type;
}

function summaryOf(group: EventGroup): string {
  if (group.count > 1) return `×${group.count}`;
  if (group.representative.fingerprint) return `fp: ${group.representative.fingerprint}`;
  if (group.representative.screen) return group.representative.screen;
  return '';
}

function LoadingState() {
  return <div className={styles.placeholder}>Loading feed…</div>;
}

function EmptyState() {
  return <div className={styles.placeholder}>No events match the current filters.</div>;
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className={styles.error}>
      Couldn&apos;t load events.
      {message ? <div className={styles.errorDetail}>{message}</div> : null}
    </div>
  );
}
