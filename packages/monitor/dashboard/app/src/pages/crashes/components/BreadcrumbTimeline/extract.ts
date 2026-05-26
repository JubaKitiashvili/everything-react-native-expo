import type { EventRecord, Severity } from '@/shared/api/types';

export type BreadcrumbCategory = 'nav' | 'net' | 'touch' | 'state' | 'render' | 'custom' | 'other';

export interface Breadcrumb {
  id: string;
  category: BreadcrumbCategory;
  message: string;
  timestamp: number;
  level: Severity;
  source: 'crash-event' | 'session-event';
  data?: Record<string, unknown>;
}

export interface ExtractSource {
  /** Latest crash event for the selected fingerprint, if any. */
  crashEvent?: EventRecord | null;
  /** Recent session events (any type) as a fallback + overlay. */
  sessionEvents?: EventRecord[];
  /** Cap on the returned list. Default 100. */
  limit?: number;
}

/**
 * Build the breadcrumb trail for the Breadcrumb Timeline panel. Prefers
 * the crumbs embedded inside a selected crash event's payload (that's the
 * trail the SDK froze at crash time); falls back to reconstructing a
 * trail from the session's recent events when there's no crash selected.
 *
 * Everything runs through the same normaliser so icons, labels, and
 * timestamps stay consistent regardless of source.
 */
export function extractBreadcrumbs(source: ExtractSource): Breadcrumb[] {
  const limit = Math.max(1, source.limit ?? 100);
  const fromCrash = source.crashEvent ? crashCrumbs(source.crashEvent) : [];
  if (fromCrash.length > 0) {
    return sliceLatest(fromCrash, limit);
  }
  const sessionCrumbs = (source.sessionEvents ?? []).map(sessionCrumb);
  return sliceLatest(sessionCrumbs, limit);
}

export function categoryFromRaw(raw: unknown): BreadcrumbCategory {
  if (typeof raw !== 'string') return 'other';
  const lowered = raw.toLowerCase();
  if (lowered.startsWith('nav')) return 'nav';
  if (lowered.startsWith('net') || lowered === 'http' || lowered === 'fetch') return 'net';
  if (lowered.startsWith('touch') || lowered === 'tap' || lowered === 'press') return 'touch';
  if (lowered.startsWith('state') || lowered === 'store' || lowered === 'reducer') return 'state';
  if (lowered.startsWith('render') || lowered === 'ui' || lowered === 'component') return 'render';
  if (lowered === 'custom' || lowered === 'event' || lowered === 'log') return 'custom';
  return 'other';
}

export function categoryFromEventType(type: string): BreadcrumbCategory {
  switch (type) {
    case 'navigation':
    case 'nav':
      return 'nav';
    case 'network':
      return 'net';
    case 'touch':
    case 'touch_boundary':
      return 'touch';
    case 'state':
    case 'state_change':
      return 'state';
    case 'render':
    case 'dual_thread_fps':
    case 'fabric_commit':
      return 'render';
    case 'custom':
      return 'custom';
    default:
      return 'other';
  }
}

function crashCrumbs(event: EventRecord): Breadcrumb[] {
  const payload = event.payload as { breadcrumbs?: unknown };
  if (!Array.isArray(payload.breadcrumbs)) return [];
  const out: Breadcrumb[] = [];
  payload.breadcrumbs.forEach((raw, idx) => {
    if (!raw || typeof raw !== 'object') return;
    const entry = raw as Record<string, unknown>;
    const timestamp =
      typeof entry.timestamp === 'number' && Number.isFinite(entry.timestamp)
        ? entry.timestamp
        : event.timestamp;
    out.push({
      id: typeof entry.id === 'string' ? entry.id : `${event.id}-c${idx}`,
      category: categoryFromRaw(entry.category),
      message:
        typeof entry.message === 'string'
          ? entry.message
          : typeof entry.label === 'string'
            ? entry.label
            : '(untitled)',
      timestamp,
      level: normaliseSeverity(entry.level),
      source: 'crash-event',
      data:
        entry.data && typeof entry.data === 'object'
          ? (entry.data as Record<string, unknown>)
          : undefined,
    });
  });
  return out;
}

function sessionCrumb(event: EventRecord): Breadcrumb {
  const payload = event.payload as { message?: unknown };
  const message =
    typeof payload.message === 'string' && payload.message.length > 0
      ? payload.message
      : event.type;
  return {
    id: event.id,
    category: categoryFromEventType(event.type),
    message,
    timestamp: event.timestamp,
    level: event.severity,
    source: 'session-event',
  };
}

function sliceLatest(items: Breadcrumb[], limit: number): Breadcrumb[] {
  return items
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

function normaliseSeverity(value: unknown): Severity {
  if (
    value === 'critical' ||
    value === 'warning' ||
    value === 'info' ||
    value === 'success' ||
    value === 'muted'
  ) {
    return value;
  }
  return 'info';
}
