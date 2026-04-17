export type TimestampFormat = 'relative' | 'absolute' | 'both';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * Format a millisecond epoch as a short relative string ("just now",
 * "42s ago", "3m ago", "2h ago", "5d ago", "3w ago", "6mo ago", "1y ago").
 * Pure; accepts an explicit `now` for deterministic testing.
 */
export function formatRelative(ts: number, now: number = Date.now()): string {
  const diff = now - ts;
  if (diff < 0) {
    return formatFuture(-diff);
  }
  if (diff < 5 * SECOND) return 'just now';
  if (diff < MINUTE) return `${Math.floor(diff / SECOND)}s ago`;
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d ago`;
  if (diff < MONTH) return `${Math.floor(diff / WEEK)}w ago`;
  if (diff < YEAR) return `${Math.floor(diff / MONTH)}mo ago`;
  return `${Math.floor(diff / YEAR)}y ago`;
}

function formatFuture(absDiff: number): string {
  if (absDiff < MINUTE) return 'in a few seconds';
  if (absDiff < HOUR) return `in ${Math.floor(absDiff / MINUTE)}m`;
  if (absDiff < DAY) return `in ${Math.floor(absDiff / HOUR)}h`;
  return `in ${Math.floor(absDiff / DAY)}d`;
}

/**
 * Locale-aware absolute timestamp (HH:MM:SS on same day, otherwise short
 * date + time).
 */
export function formatAbsolute(ts: number, now: number = Date.now()): string {
  const date = new Date(ts);
  const nowDate = new Date(now);
  const sameDay =
    date.getFullYear() === nowDate.getFullYear() &&
    date.getMonth() === nowDate.getMonth() &&
    date.getDate() === nowDate.getDate();

  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour12: false });
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
