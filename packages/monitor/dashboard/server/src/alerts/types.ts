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
 * Channel string format: `<type>:<target>`. Examples:
 *   slack:https://hooks.slack.com/services/T000/B000/XXXX
 *   discord:https://discord.com/api/webhooks/000/XXXX
 *   webhook:https://example.com/erne-alerts
 *   pagerduty:<32-char-routing-key>          (Task 117.19)
 *   opsgenie:<api-key>                        (Task 117.19)
 *   email:ops@example.com                     (Task 117.19)
 *   in-app                                    (Task 117.19, no target)
 *
 * The `<target>` is a URL for the HTTP-webhook channels (slack /
 * discord / webhook), a credential for PagerDuty / Opsgenie, an
 * address for email, and absent for `in-app`.
 *
 * Bare strings (no colon) are accepted by the rule store for
 * backwards compatibility with pre-117.99 fixtures, but — except for
 * the credential-free `in-app` channel — the delivery layer treats
 * them as `unknown` and skips with an `invalid_url`/`unknown_channel`
 * error so operators see a useful failure rather than a silent no-op.
 */
export type AlertChannelType =
  | 'slack'
  | 'discord'
  | 'webhook'
  | 'pagerduty'
  | 'opsgenie'
  | 'email'
  | 'in-app'
  | 'unknown';

/**
 * How the delivery layer reaches a channel. HTTP channels (slack /
 * discord / webhook / pagerduty / opsgenie) POST a formatted body; the
 * `endpoint` is either an operator-supplied URL (slack / discord /
 * webhook) or the provider's fixed Events API URL with the credential
 * carried separately (pagerduty / opsgenie). `email` is dispatched via
 * the injected `Mailer`; `in-app` is persisted as a notification row.
 */
export type AlertChannelTransport = 'http' | 'email' | 'in-app' | 'none';

export interface ParsedAlertChannel {
  raw: string;
  type: AlertChannelType;
  /**
   * Resolved HTTP endpoint for transport === 'http'. For slack /
   * discord / webhook this is the operator-supplied URL; for pagerduty
   * / opsgenie it is the provider's fixed Events API URL. `null` when
   * the channel has no HTTP endpoint (email / in-app) or failed to
   * parse (missing URL / unknown type).
   */
  url: string | null;
  /** How to dispatch to this channel. */
  transport: AlertChannelTransport;
  /**
   * Credential / address parsed out of the channel string:
   *   - pagerduty: the Events API v2 routing key
   *   - opsgenie:  the API key (sent as `Authorization: GenieKey <key>`)
   *   - email:     the recipient address
   * `null` for channels that embed their secret in the URL (slack /
   * discord / webhook) or carry no credential (in-app).
   */
  credential: string | null;
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
 * PagerDuty Events API v2 enqueue endpoint. The routing key is carried
 * in the JSON body (`routing_key`), not the URL.
 */
export const PAGERDUTY_EVENTS_URL = 'https://events.pagerduty.com/v2/enqueue';

/**
 * Opsgenie Alerts API create endpoint (US region). EU customers can
 * override by pointing the rule at a `webhook:` channel instead; the
 * MVP targets the default region. The API key is carried in the
 * `Authorization: GenieKey <key>` header, not the URL.
 */
export const OPSGENIE_ALERTS_URL = 'https://api.opsgenie.com/v2/alerts';

/**
 * Parse a single channel string into a typed target. Recognised heads:
 *   slack / discord / webhook → HTTP transport, URL required
 *   pagerduty                 → HTTP transport, fixed PD URL, key = credential
 *   opsgenie                  → HTTP transport, fixed Opsgenie URL, key = credential
 *   email                     → email transport, address = credential
 *   in-app                    → in-app transport, no target needed
 * Anything else collapses to `unknown` so the delivery layer can record
 * a meaningful failure instead of throwing.
 */
export function parseChannel(raw: string): ParsedAlertChannel {
  const trimmed = raw.trim();

  // `in-app` is the one credential-free channel: accept it with or
  // without a trailing colon (`in-app` or `in-app:`).
  const head0 = (trimmed.includes(':') ? trimmed.slice(0, trimmed.indexOf(':')) : trimmed)
    .trim()
    .toLowerCase();
  if (head0 === 'in-app') {
    return { raw, type: 'in-app', url: null, transport: 'in-app', credential: null };
  }

  const idx = trimmed.indexOf(':');
  if (idx < 0) {
    return { raw, type: 'unknown', url: null, transport: 'none', credential: null };
  }
  const head = trimmed.slice(0, idx).trim().toLowerCase();
  const tail = trimmed.slice(idx + 1).trim();

  switch (head) {
    case 'slack':
    case 'discord':
    case 'webhook': {
      if (!/^https?:\/\//i.test(tail)) {
        return { raw, type: head, url: null, transport: 'http', credential: null };
      }
      return { raw, type: head, url: tail, transport: 'http', credential: null };
    }
    case 'pagerduty': {
      if (tail.length === 0) {
        return { raw, type: 'pagerduty', url: null, transport: 'http', credential: null };
      }
      return {
        raw,
        type: 'pagerduty',
        url: PAGERDUTY_EVENTS_URL,
        transport: 'http',
        credential: tail,
      };
    }
    case 'opsgenie': {
      if (tail.length === 0) {
        return { raw, type: 'opsgenie', url: null, transport: 'http', credential: null };
      }
      return {
        raw,
        type: 'opsgenie',
        url: OPSGENIE_ALERTS_URL,
        transport: 'http',
        credential: tail,
      };
    }
    case 'email': {
      if (!isEmailAddress(tail)) {
        return { raw, type: 'email', url: null, transport: 'email', credential: null };
      }
      return { raw, type: 'email', url: null, transport: 'email', credential: tail };
    }
    default:
      return { raw, type: 'unknown', url: null, transport: 'none', credential: null };
  }
}

/** Minimal address sanity check — full RFC validation is the mailer's job. */
function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * PagerDuty Events API v2 severity. Maps the dashboard severity scale
 * onto the four PD severities. `success`/`muted` collapse to `info` —
 * an alert firing is at least informational.
 */
export function pagerDutySeverity(severity: Severity): 'critical' | 'error' | 'warning' | 'info' {
  switch (severity) {
    case 'critical':
      return 'critical';
    case 'warning':
      return 'warning';
    case 'info':
    case 'success':
    case 'muted':
    default:
      return 'info';
  }
}

/**
 * Opsgenie alert priority. P1 (highest) → P5 (lowest). Maps the
 * dashboard severity scale onto the Opsgenie priority enum.
 */
export function opsgeniePriority(severity: Severity): 'P1' | 'P2' | 'P3' | 'P4' | 'P5' {
  switch (severity) {
    case 'critical':
      return 'P1';
    case 'warning':
      return 'P3';
    case 'info':
      return 'P4';
    case 'success':
    case 'muted':
    default:
      return 'P5';
  }
}

/**
 * Email transport seam. The default implementation (see
 * `delivery.ts`) just logs — a real deployment injects an adapter that
 * forwards to SES / Postmark / Resend / nodemailer. Kept dependency-free
 * on purpose: the dashboard server ships no email client.
 */
export interface Mailer {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
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
