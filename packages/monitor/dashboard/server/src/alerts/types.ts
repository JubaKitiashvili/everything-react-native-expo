// Task 117.99 — alert evaluator + webhook delivery.
//
// Shared types between the evaluator and the delivery transports.
// Kept separate so the evaluator can construct delivery payloads
// without importing transport-specific code, and so transports can
// be unit-tested without the evaluator.

import type { AlertFiringRecord, AlertRuleRecord, Severity } from '../storage/types.js';

/**
 * Metric ids the evaluator understands. Anything else is silently
 * ignored (counted but never matches an event) so a typo in a rule
 * cannot crash the ingest hot path.
 *
 * Future metrics extend this union; the classifier in `evaluator.ts`
 * is the only place that needs to know the event-shape contract for
 * each metric.
 */
export type AlertMetric =
  | 'crash_count'
  | 'event_count'
  | 'error_event_count'
  | 'anr_count'
  | 'frame_drop_count'
  | (string & {});

/**
 * Channel string format: `<type>:<url>`. Examples:
 *   slack:https://hooks.slack.com/services/T000/B000/XXXX
 *   discord:https://discord.com/api/webhooks/000/XXXX
 *   webhook:https://example.com/erne-alerts
 *
 * Bare strings (no colon) are accepted by the rule store for
 * backwards compatibility with pre-117.99 fixtures, but the
 * delivery layer treats them as `unknown` and skips with a
 * `not_a_url` error so operators see a useful failure rather
 * than a silent no-op.
 */
export type AlertChannelType = 'slack' | 'discord' | 'webhook' | 'unknown';

export interface ParsedAlertChannel {
  raw: string;
  type: AlertChannelType;
  url: string | null;
}

/**
 * Outcome of one delivery attempt to one channel. The `attempts`
 * counter is the number of HTTP requests that left the process
 * (including the successful one) so a flaky network shows up as
 * `attempts > 1, ok: true`.
 */
export interface AlertDeliveryResult {
  channel: string;
  type: AlertChannelType;
  ok: boolean;
  attempts: number;
  /** HTTP status of the final response. Absent on network errors. */
  status?: number;
  /** Human-readable failure reason on `ok: false`. */
  error?: string;
  /** Wall-clock duration in ms across all retries. */
  durationMs: number;
}

/**
 * Severity assigned to a firing. Mirrors the events table severity
 * enum so the dashboard can render firings in the same colour scale
 * as their underlying events.
 */
export function severityForMetric(metric: AlertMetric): Severity {
  switch (metric) {
    case 'crash_count':
    case 'anr_count':
    case 'error_event_count':
      return 'critical';
    case 'frame_drop_count':
      return 'warning';
    case 'event_count':
      return 'info';
    default:
      return 'warning';
  }
}

/**
 * Parse a single channel string. Unrecognised types collapse to
 * `unknown` so the delivery layer can record a meaningful failure
 * instead of throwing.
 */
export function parseChannel(raw: string): ParsedAlertChannel {
  const trimmed = raw.trim();
  const idx = trimmed.indexOf(':');
  if (idx < 0) {
    return { raw, type: 'unknown', url: null };
  }
  const head = trimmed.slice(0, idx).toLowerCase();
  const tail = trimmed.slice(idx + 1).trim();
  if (head !== 'slack' && head !== 'discord' && head !== 'webhook') {
    return { raw, type: 'unknown', url: null };
  }
  if (!/^https?:\/\//i.test(tail)) {
    return { raw, type: head, url: null };
  }
  return { raw, type: head, url: tail };
}

/**
 * Compact JSON envelope every transport receives. Each transport
 * decides how to format it for its channel (Slack blocks, Discord
 * embeds, generic JSON) but the common shape lets operators wire
 * one rule to multiple channels and trust they all see the same
 * data.
 */
export interface AlertDeliveryPayload {
  rule: AlertRuleRecord;
  firing: AlertFiringRecord;
  /** True when this delivery was triggered by the test-fire button. */
  test: boolean;
  /** Human-readable summary line. */
  summary: string;
  /** ISO timestamp of `firing.firedAt` for transports that prefer strings. */
  firedAtIso: string;
}

/**
 * Build a default human summary. Transport formatters may override
 * but the evaluator passes this in so the unit tests can assert one
 * canonical phrasing without coupling to transport HTML.
 */
export function defaultSummary(payload: Pick<AlertDeliveryPayload, 'rule' | 'firing' | 'test'>): string {
  const { rule, firing, test } = payload;
  const prefix = test ? '[TEST] ' : '';
  return `${prefix}${rule.name}: ${rule.metric} = ${firing.metricValue} >= ${rule.threshold} in ${rule.windowSeconds}s`;
}
