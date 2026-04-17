import type { EventRecord, Severity } from '../../shared/api/types';

export interface EventGroup {
  /** Stable id for the group — uses the representative event's id. */
  id: string;
  representative: EventRecord;
  events: EventRecord[];
  count: number;
  firstTimestamp: number;
  lastTimestamp: number;
  /** True if the group collapses more than one event (render storm / recurring crash). */
  isCollapsed: boolean;
}

export interface GroupEventsOptions {
  /** Collapse consecutive events with the same fingerprint within this ms window. Default 60s. */
  fingerprintWindowMs?: number;
  /** Collapse consecutive (type + sessionId + screen) events within this ms window. Default 5s. */
  burstWindowMs?: number;
  /** Never collapse more than this many events into a single group. */
  maxGroupSize?: number;
}

/**
 * Smart grouping for the Live Feed: collapses render storms and recurring
 * crashes so the feed stays readable even when the SDK emits a burst.
 *
 * Rules, applied in order as the event list is walked (input MUST be
 * descending-timestamp — that's what the server returns):
 * 1. Same fingerprint as the tail of the last group AND within
 *    `fingerprintWindowMs` → merge.
 * 2. Same (type + sessionId + screen) as the tail of the last group
 *    AND within `burstWindowMs` AND neither side has a distinct
 *    fingerprint → merge (catches render storms, rage-tap bursts).
 * 3. Otherwise → new group.
 *
 * `maxGroupSize` caps a single group so a truly spammy client can't
 * produce one 100K-event row that defeats the UI.
 */
export function groupEvents(events: EventRecord[], options: GroupEventsOptions = {}): EventGroup[] {
  const fingerprintWindowMs = options.fingerprintWindowMs ?? 60_000;
  const burstWindowMs = options.burstWindowMs ?? 5_000;
  const maxGroupSize = options.maxGroupSize ?? 100;

  const groups: EventGroup[] = [];
  for (const event of events) {
    const last = groups[groups.length - 1];
    if (
      last &&
      last.count < maxGroupSize &&
      canMerge(last, event, fingerprintWindowMs, burstWindowMs)
    ) {
      last.events.push(event);
      last.count = last.events.length;
      last.firstTimestamp = Math.min(last.firstTimestamp, event.timestamp);
      last.lastTimestamp = Math.max(last.lastTimestamp, event.timestamp);
      last.isCollapsed = last.count > 1;
      continue;
    }
    groups.push({
      id: event.id,
      representative: event,
      events: [event],
      count: 1,
      firstTimestamp: event.timestamp,
      lastTimestamp: event.timestamp,
      isCollapsed: false,
    });
  }
  return groups;
}

function canMerge(
  group: EventGroup,
  event: EventRecord,
  fingerprintWindowMs: number,
  burstWindowMs: number,
): boolean {
  const rep = group.representative;
  const within = (window: number): boolean => {
    const newer = Math.max(group.firstTimestamp, group.lastTimestamp);
    const older = Math.min(group.firstTimestamp, group.lastTimestamp);
    const delta = Math.min(Math.abs(newer - event.timestamp), Math.abs(older - event.timestamp));
    return delta <= window;
  };

  if (rep.fingerprint && event.fingerprint && rep.fingerprint === event.fingerprint) {
    return within(fingerprintWindowMs);
  }
  if (
    !rep.fingerprint &&
    !event.fingerprint &&
    rep.type === event.type &&
    rep.sessionId === event.sessionId &&
    rep.screen === event.screen
  ) {
    return within(burstWindowMs);
  }
  return false;
}

export interface FilterEventsOptions {
  types: ReadonlySet<string>;
  severities: ReadonlySet<Severity>;
  search: string;
}

/**
 * Pure filter applied before grouping. Search is case-insensitive and
 * matches message / type / screen / session id so the free-text box
 * does what a user would expect without a query parser.
 */
export function filterEvents(events: EventRecord[], options: FilterEventsOptions): EventRecord[] {
  const q = options.search.trim().toLowerCase();
  return events.filter((event) => {
    if (options.types.size > 0 && !options.types.has(event.type)) return false;
    if (options.severities.size > 0 && !options.severities.has(event.severity)) return false;
    if (q.length === 0) return true;
    const message = String((event.payload as { message?: unknown })?.message ?? '');
    return (
      event.type.toLowerCase().includes(q) ||
      (event.screen?.toLowerCase().includes(q) ?? false) ||
      event.sessionId.toLowerCase().includes(q) ||
      message.toLowerCase().includes(q)
    );
  });
}
