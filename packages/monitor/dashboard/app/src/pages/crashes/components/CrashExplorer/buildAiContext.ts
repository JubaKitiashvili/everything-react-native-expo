import type { CrashGroupRecord, EventRecord } from '@/shared/api/types';
import { parseStack } from './parseStack';

export interface BuildAiContextInput {
  group: CrashGroupRecord;
  /** Most-recent event in this crash group — source of stack + breadcrumbs + device. */
  latestEvent?: EventRecord | null;
}

interface RawBreadcrumb {
  category?: unknown;
  message?: unknown;
  label?: unknown;
  timestamp?: unknown;
}

/**
 * Render a selected crash group (+ its latest event) into a Claude-ready
 * plain-text block: enough context to paste straight into a chat and ask
 * "why is this crashing?" without the model needing the dashboard.
 *
 * Deterministic by design — timestamps are emitted as ISO strings (no
 * locale formatting) so the same input always yields the same text, which
 * keeps it pure and unit-testable.
 */
export function buildAiContext({ group, latestEvent }: BuildAiContextInput): string {
  const lines: string[] = [];

  lines.push('# Crash report');
  lines.push('');
  lines.push(`Message: ${group.message}`);
  lines.push(`Fingerprint: ${group.fingerprint}`);
  lines.push(`Status: ${group.status}`);
  lines.push(`First seen: ${isoOrUnknown(group.firstSeen)}`);
  lines.push(`Last seen: ${isoOrUnknown(group.lastSeen)}`);
  lines.push(`Events: ${group.eventCount} across ${group.sessionCount} sessions`);
  if (group.topScreen) {
    lines.push(`Top screen: ${group.topScreen}`);
  }

  const device = readDevice(latestEvent);
  if (device.length > 0) {
    lines.push('');
    lines.push('## Device / session');
    for (const entry of device) {
      lines.push(`- ${entry}`);
    }
  }

  const stackText = readStackText(latestEvent);
  const parsed = parseStack(stackText);
  if (parsed.message || parsed.frames.length > 0) {
    lines.push('');
    lines.push('## Stack');
    if (parsed.message) {
      lines.push(parsed.message);
    }
    for (const frame of parsed.frames) {
      lines.push(frame.location ? `  at ${frame.symbol} (${frame.location})` : `  at ${frame.symbol}`);
    }
  }

  const breadcrumbs = readBreadcrumbs(latestEvent);
  if (breadcrumbs.length > 0) {
    lines.push('');
    lines.push('## Breadcrumbs');
    for (const crumb of breadcrumbs) {
      lines.push(formatBreadcrumb(crumb));
    }
  }

  return lines.join('\n');
}

function readStackText(event: EventRecord | null | undefined): string {
  if (!event) return '';
  const payload = event.payload as { stack?: unknown };
  return typeof payload.stack === 'string' ? payload.stack : '';
}

function readBreadcrumbs(event: EventRecord | null | undefined): RawBreadcrumb[] {
  if (!event) return [];
  const payload = event.payload as { breadcrumbs?: unknown };
  if (!Array.isArray(payload.breadcrumbs)) return [];
  return payload.breadcrumbs.filter(
    (entry): entry is RawBreadcrumb => typeof entry === 'object' && entry !== null,
  );
}

function formatBreadcrumb(crumb: RawBreadcrumb): string {
  const category = typeof crumb.category === 'string' ? crumb.category : 'event';
  const message =
    typeof crumb.message === 'string'
      ? crumb.message
      : typeof crumb.label === 'string'
        ? crumb.label
        : '';
  const ts = typeof crumb.timestamp === 'number' ? ` @ ${isoOrUnknown(crumb.timestamp)}` : '';
  return `- [${category}] ${message}${ts}`;
}

// Device + session metadata lives on the event (platform/screen/ids) and,
// when the SDK captured it, under `payload.device`. We surface whatever is
// present and skip the rest rather than emit empty fields.
function readDevice(event: EventRecord | null | undefined): string[] {
  if (!event) return [];
  const out: string[] = [];
  if (event.platform) out.push(`Platform: ${event.platform}`);
  if (event.screen) out.push(`Screen: ${event.screen}`);
  out.push(`Session: ${event.sessionId}`);
  if (event.userId) out.push(`User: ${event.userId}`);

  const payload = event.payload as { device?: unknown };
  if (payload.device && typeof payload.device === 'object') {
    for (const [key, value] of Object.entries(payload.device as Record<string, unknown>)) {
      if (value === null || value === undefined) continue;
      if (typeof value === 'object') continue;
      out.push(`${key}: ${String(value)}`);
    }
  }
  return out;
}

function isoOrUnknown(ts: number): string {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return 'unknown';
  return new Date(ts).toISOString();
}
