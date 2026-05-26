import type { EventRecord, SessionRecord } from '@/shared/api/types';

/** One row of the "top screens" leaderboard. */
export interface ScreenCount {
  screen: string;
  count: number;
}

/**
 * Deterministic, view-agnostic rollup of a single user's footprint across
 * their sessions and events. Pure — no clock, no I/O — so it's trivially
 * testable and safe to memoize off the raw query results.
 */
export interface UserSummary {
  sessionCount: number;
  eventCount: number;
  crashCount: number;
  anrCount: number;
  /** Earliest timestamp seen across sessions + events; null when no data. */
  firstSeen: number | null;
  /** Latest timestamp seen across sessions + events; null when no data. */
  lastSeen: number | null;
  /** Screens ranked by event volume, ties broken alphabetically. */
  topScreens: ScreenCount[];
}

/** An ANR is just a crash-family event flagged by its `type`. */
function isAnrEvent(event: EventRecord): boolean {
  return event.type === 'anr';
}

/** Treat any event whose type starts with `crash` as a crash. */
function isCrashEvent(event: EventRecord): boolean {
  return event.type === 'crash' || event.type.startsWith('crash.');
}

/**
 * Summarize a user's data. `events` and `sessions` are expected to already
 * be scoped to the user (the caller filters by `userId`), but this function
 * does not assume so — it only reads the rows it's given.
 */
export function summarizeUser(
  events: EventRecord[],
  sessions: SessionRecord[],
  options: { topScreensLimit?: number } = {},
): UserSummary {
  const topScreensLimit = options.topScreensLimit ?? 5;

  let firstSeen: number | null = null;
  let lastSeen: number | null = null;
  const observe = (ts: number) => {
    if (firstSeen === null || ts < firstSeen) firstSeen = ts;
    if (lastSeen === null || ts > lastSeen) lastSeen = ts;
  };

  for (const session of sessions) {
    observe(session.startedAt);
    if (typeof session.endedAt === 'number') observe(session.endedAt);
  }

  let crashCount = 0;
  let anrCount = 0;
  const screenCounts = new Map<string, number>();

  for (const event of events) {
    observe(event.timestamp);
    if (isAnrEvent(event)) anrCount += 1;
    else if (isCrashEvent(event)) crashCount += 1;

    const screen = event.screen?.trim();
    if (screen) screenCounts.set(screen, (screenCounts.get(screen) ?? 0) + 1);
  }

  const topScreens = [...screenCounts.entries()]
    .map(([screen, count]) => ({ screen, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.screen.localeCompare(b.screen)))
    .slice(0, topScreensLimit);

  return {
    sessionCount: sessions.length,
    eventCount: events.length,
    crashCount,
    anrCount,
    firstSeen,
    lastSeen,
    topScreens,
  };
}
