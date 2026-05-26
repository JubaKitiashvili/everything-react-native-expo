// Task 117.99 / 117.19 — alert delivery to every supported channel.
//
// One class wraps the full channel set. Each channel is identified by a
// `<type>:<target>` string in the rule's `channels` array:
//   slack:<url>       Slack incoming webhook (blocks)         — HTTP
//   discord:<url>     Discord webhook (embeds)                — HTTP
//   webhook:<url>     Generic JSON POST (HMAC-signed, 117.63) — HTTP
//   pagerduty:<key>   PagerDuty Events API v2 trigger         — HTTP
//   opsgenie:<key>    Opsgenie Alerts API create              — HTTP
//   email:<address>   Email via an injectable Mailer          — email
//   in-app            Persisted notification row              — in-app
// Anything we can't parse falls through to a `failed` result with an
// `invalid_url` / `unknown_channel_type` error — never a thrown
// exception — so a typo in one channel never blocks the others.
//
// Retries (HTTP only): 5xx and network errors retry with exponential
// backoff up to `maxAttempts` (default 3). 408 and 429 are treated as
// transient too (Slack / Discord / PagerDuty limiters honour 429 with a
// Retry-After header). All other 4xx responses fail immediately — they
// indicate a misconfigured webhook URL / credential and retrying won't
// help. Email + in-app are single-shot (no retry loop).
//
// The transport is intentionally framework-free. We accept an injectable
// `fetch` so unit tests can run without spinning up a real HTTP server,
// an injectable `Mailer` for email (default: a no-op log mailer — wire
// SES / Postmark / Resend / nodemailer here), and an optional
// `notificationSink` the `in-app` channel persists rows through.

import { randomUUID } from 'node:crypto';
import {
  defaultSummary,
  opsgeniePriority,
  pagerDutySeverity,
  parseChannel,
  type AlertDeliveryPayload,
  type AlertDeliveryResult,
  type Mailer,
  type ParsedAlertChannel,
} from './types.js';
import { signPayload, X_ERNE_SIGNATURE_HEADER } from '../webhooks/sign.js';
import type {
  AlertRuleRecord,
  AlertFiringRecord,
  NotificationRecord,
} from '../storage/types.js';

/** Minimal fetch shape we rely on. `globalThis.fetch` matches it. */
export type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

/**
 * Persist an in-app notification. The dashboard server injects a sink
 * backed by `store.insertNotification`; tests inject a capturing array.
 * Throwing rejects the delivery (surfaces as a `failed` result) rather
 * than crashing the dispatcher.
 */
export type NotificationSink = (notification: NotificationRecord) => void | Promise<void>;

/**
 * Default `Mailer` — logs and resolves. Documented seam: a real
 * deployment passes `options.mailer` backed by SES / Postmark / Resend
 * / nodemailer. We add NO email dependency to the dashboard server.
 */
export class LogMailer implements Mailer {
  private readonly log: (line: string) => void;
  constructor(log?: (line: string) => void) {
    this.log = log ?? ((line) => console.info(line));
  }
  async send(message: { to: string; subject: string; text: string }): Promise<void> {
    this.log(
      `[dashboard-server:alert-delivery] email (no mailer configured) to=${message.to} subject=${JSON.stringify(message.subject)}`,
    );
  }
}

export interface AlertDeliveryOptions {
  fetch?: FetchLike;
  /** Wall-clock per-attempt timeout. Default 5s. */
  timeoutMs?: number;
  /** Total attempts including the first. Default 3 (so 2 retries). */
  maxAttempts?: number;
  /**
   * Backoff schedule in ms. Capped at maxAttempts-1 entries; if shorter
   * the last value repeats. Default `[250, 1000, 4000]`.
   */
  backoffMs?: number[];
  /** Injection point for tests that need a deterministic clock. */
  now?: () => number;
  /**
   * Sleep override for backoff. Tests pass an instant resolver to avoid
   * real timers; production uses `setTimeout`.
   */
  sleep?: (ms: number) => Promise<void>;
  /** Logged when a final delivery attempt fails. */
  onError?: (err: Error, context: { rule: string; channel: string }) => void;
  /**
   * Task 117.63 — shared HMAC secret for outbound `webhook:` deliveries.
   * When set, every generic webhook request carries an `X-ERNE-Signature:
   * sha256=<hex>` header computed over the exact request body, letting the
   * receiver verify authenticity + integrity. Slack / Discord deliveries
   * are unaffected — those providers have their own URL-embedded secrets
   * and do not consume a custom signature header.
   */
  webhookSigningSecret?: string | null;
  /**
   * Task 117.19 — email transport. Defaults to a `LogMailer` that just
   * logs the message (documented seam — wire SES / Postmark / Resend /
   * nodemailer here; no email dependency is bundled). The `email:`
   * channel dispatches through this.
   */
  mailer?: Mailer;
  /**
   * Task 117.19 — in-app notification sink. When provided, the `in-app`
   * channel persists one `NotificationRecord` per firing through it. When
   * absent, an `in-app` channel reports a `no_notification_sink` failure
   * (so a rule asking for in-app delivery on a server without a store
   * sink fails loudly instead of silently dropping).
   */
  notificationSink?: NotificationSink;
  /**
   * Id generator for notification rows. Defaults to a `notif_<uuid>`
   * generator; tests inject a deterministic one.
   */
  generateNotificationId?: () => string;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = [250, 1_000, 4_000];

const NON_RETRYABLE_4XX = new Set([
  400, // Bad request — payload shape will not change on retry
  401, // Unauthorized — webhook URL revoked
  403, // Forbidden — webhook URL revoked
  404, // Not found — webhook URL gone
  410, // Gone
  422, // Unprocessable
]);

function isRetryableStatus(status: number): boolean {
  if (status >= 500 && status < 600) return true;
  if (status === 408) return true;
  if (status === 429) return true;
  return false;
}

function isNonRetryable4xx(status: number): boolean {
  if (status >= 400 && status < 500) {
    return NON_RETRYABLE_4XX.has(status) || !isRetryableStatus(status);
  }
  return false;
}

export class AlertDelivery {
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly backoffMs: number[];
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly onError: (err: Error, context: { rule: string; channel: string }) => void;
  private readonly webhookSigningSecret: string | null;
  private readonly mailer: Mailer;
  private readonly notificationSink: NotificationSink | null;
  private readonly generateNotificationId: () => string;

  constructor(options: AlertDeliveryOptions = {}) {
    this.fetchImpl =
      options.fetch ??
      (globalThis.fetch as unknown as FetchLike) ??
      ((): never => {
        throw new Error('AlertDelivery: no fetch available; pass options.fetch');
      });
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    this.backoffMs =
      options.backoffMs && options.backoffMs.length > 0 ? options.backoffMs : DEFAULT_BACKOFF_MS;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.onError =
      options.onError ??
      ((err, ctx) => {
        // Mirror the rest of the dashboard server's logger style:
        // `[dashboard-server:alert-delivery]` with rule + channel.
        console.error(
          `[dashboard-server:alert-delivery] rule=${ctx.rule} channel=${ctx.channel} ${err.message}`,
        );
      });
    this.webhookSigningSecret = options.webhookSigningSecret ?? null;
    this.mailer = options.mailer ?? new LogMailer();
    this.notificationSink = options.notificationSink ?? null;
    this.generateNotificationId =
      options.generateNotificationId ?? (() => `notif_${randomUUID()}`);
  }

  /**
   * Dispatch the firing to every channel on the rule. Resolves once all
   * deliveries finish (success OR final failure). Failures never throw —
   * they surface in the returned `AlertDeliveryResult[]`.
   */
  async deliverAll(
    rule: AlertRuleRecord,
    firing: AlertFiringRecord,
    options: { test?: boolean } = {},
  ): Promise<AlertDeliveryResult[]> {
    const test = options.test ?? false;
    const payload: AlertDeliveryPayload = {
      rule,
      firing,
      test,
      summary: defaultSummary({ rule, firing, test }),
      firedAtIso: new Date(firing.firedAt).toISOString(),
    };
    const channels = rule.channels.map(parseChannel);
    return Promise.all(channels.map((c) => this.deliverOne(c, payload, rule.id)));
  }

  private async deliverOne(
    channel: ParsedAlertChannel,
    payload: AlertDeliveryPayload,
    ruleId: string,
  ): Promise<AlertDeliveryResult> {
    const start = this.now();

    // Unknown type, or a known type that failed to resolve its target
    // (missing URL / credential / address). Fail fast, no dispatch.
    if (channel.type === 'unknown') {
      return this.failResult(channel, start, ruleId, 'unknown_channel_type');
    }
    if (channel.transport === 'http' && channel.url === null) {
      return this.failResult(channel, start, ruleId, 'invalid_url');
    }
    if (channel.transport === 'email' && channel.credential === null) {
      return this.failResult(channel, start, ruleId, 'invalid_address');
    }

    switch (channel.transport) {
      case 'http':
        return this.deliverHttp(channel, payload, ruleId, start);
      case 'email':
        return this.deliverEmail(channel, payload, ruleId, start);
      case 'in-app':
        return this.deliverInApp(channel, payload, ruleId, start);
      default:
        return this.failResult(channel, start, ruleId, 'unknown_channel_type');
    }
  }

  /** Build + log a failed (no-dispatch) result. */
  private failResult(
    channel: ParsedAlertChannel,
    start: number,
    ruleId: string,
    message: string,
  ): AlertDeliveryResult {
    const err = new Error(message);
    this.onError(err, { rule: ruleId, channel: channel.raw });
    return {
      channel: channel.raw,
      type: channel.type,
      ok: false,
      attempts: 0,
      error: message,
      durationMs: this.now() - start,
    };
  }

  /** Email transport — single-shot via the injected Mailer. */
  private async deliverEmail(
    channel: ParsedAlertChannel,
    payload: AlertDeliveryPayload,
    ruleId: string,
    start: number,
  ): Promise<AlertDeliveryResult> {
    const to = channel.credential as string;
    try {
      await this.mailer.send({
        to,
        subject: payload.summary,
        text: formatEmailText(payload),
      });
      return {
        channel: channel.raw,
        type: channel.type,
        ok: true,
        attempts: 1,
        durationMs: this.now() - start,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.onError(err instanceof Error ? err : new Error(message), {
        rule: ruleId,
        channel: channel.raw,
      });
      return {
        channel: channel.raw,
        type: channel.type,
        ok: false,
        attempts: 1,
        error: message,
        durationMs: this.now() - start,
      };
    }
  }

  /** In-app transport — persist one notification row via the sink. */
  private async deliverInApp(
    channel: ParsedAlertChannel,
    payload: AlertDeliveryPayload,
    ruleId: string,
    start: number,
  ): Promise<AlertDeliveryResult> {
    if (!this.notificationSink) {
      return this.failResult(channel, start, ruleId, 'no_notification_sink');
    }
    const notification: NotificationRecord = {
      id: this.generateNotificationId(),
      createdAt: payload.firing.firedAt,
      severity: payload.firing.severity,
      title: payload.test ? `[TEST] ${payload.rule.name}` : payload.rule.name,
      body: payload.summary,
      ruleId: payload.rule.id,
      firingId: payload.firing.id,
      read: false,
      metadata: {
        test: payload.test,
        metric: payload.rule.metric,
        metricValue: payload.firing.metricValue,
        threshold: payload.rule.threshold,
        windowSeconds: payload.rule.windowSeconds,
      },
    };
    try {
      await this.notificationSink(notification);
      return {
        channel: channel.raw,
        type: channel.type,
        ok: true,
        attempts: 1,
        durationMs: this.now() - start,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.onError(err instanceof Error ? err : new Error(message), {
        rule: ruleId,
        channel: channel.raw,
      });
      return {
        channel: channel.raw,
        type: channel.type,
        ok: false,
        attempts: 1,
        error: message,
        durationMs: this.now() - start,
      };
    }
  }

  /** HTTP transport — formatted body + retry loop (Slack/Discord/webhook/PagerDuty/Opsgenie). */
  private async deliverHttp(
    channel: ParsedAlertChannel,
    payload: AlertDeliveryPayload,
    ruleId: string,
    start: number,
  ): Promise<AlertDeliveryResult> {
    const url = channel.url as string;
    const body = formatBody(channel, payload);
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    // Task 117.63 — sign generic webhook bodies so the receiver can
    // verify authenticity + integrity. Only the generic `webhook` type
    // gets the header; Slack / Discord rely on their URL-embedded secret,
    // PagerDuty / Opsgenie carry their key in body / Authorization.
    if (channel.type === 'webhook' && this.webhookSigningSecret) {
      headers[X_ERNE_SIGNATURE_HEADER] = signPayload(this.webhookSigningSecret, body);
    }
    // Opsgenie authenticates via `Authorization: GenieKey <api-key>`.
    if (channel.type === 'opsgenie' && channel.credential) {
      headers['authorization'] = `GenieKey ${channel.credential}`;
    }

    let attempts = 0;
    let lastStatus: number | undefined;
    let lastError: string | undefined;
    while (attempts < this.maxAttempts) {
      attempts += 1;
      try {
        const controller = new AbortController();
        const timeoutHandle: { id: NodeJS.Timeout | null } = { id: null };
        timeoutHandle.id = setTimeout(() => controller.abort(), this.timeoutMs);
        let response: Awaited<ReturnType<FetchLike>>;
        try {
          response = await this.fetchImpl(url, {
            method: 'POST',
            headers,
            body,
            signal: controller.signal,
          });
        } finally {
          if (timeoutHandle.id) clearTimeout(timeoutHandle.id);
        }
        lastStatus = response.status;
        if (response.ok) {
          return {
            channel: channel.raw,
            type: channel.type,
            ok: true,
            attempts,
            status: response.status,
            durationMs: this.now() - start,
          };
        }
        if (isNonRetryable4xx(response.status)) {
          // Drain the body for the error message but cap it so a
          // misbehaving server can't OOM us via response.text().
          const text = await safeReadBody(response);
          lastError = `${response.status}${text ? ` ${text}` : ''}`;
          break;
        }
        if (!isRetryableStatus(response.status)) {
          const text = await safeReadBody(response);
          lastError = `${response.status}${text ? ` ${text}` : ''}`;
          break;
        }
        // Retryable 5xx / 408 / 429 — fall through to backoff.
        const text = await safeReadBody(response);
        lastError = `${response.status}${text ? ` ${text}` : ''}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
      // Either retryable status or thrown — backoff if we have attempts left.
      if (attempts < this.maxAttempts) {
        const delay = this.backoffMs[Math.min(attempts - 1, this.backoffMs.length - 1)] ?? 0;
        await this.sleep(delay);
      }
    }

    const finalErr = new Error(lastError ?? 'delivery_failed');
    this.onError(finalErr, { rule: ruleId, channel: channel.raw });
    const result: AlertDeliveryResult = {
      channel: channel.raw,
      type: channel.type,
      ok: false,
      attempts,
      error: lastError ?? 'delivery_failed',
      durationMs: this.now() - start,
    };
    if (typeof lastStatus === 'number') result.status = lastStatus;
    return result;
  }
}

async function safeReadBody(response: { text: () => Promise<string> }): Promise<string> {
  try {
    const text = await response.text();
    return text.length > 200 ? `${text.slice(0, 200)}…` : text;
  } catch {
    return '';
  }
}

function formatBody(channel: ParsedAlertChannel, payload: AlertDeliveryPayload): string {
  switch (channel.type) {
    case 'slack':
      return JSON.stringify(formatSlack(payload));
    case 'discord':
      return JSON.stringify(formatDiscord(payload));
    case 'pagerduty':
      // The routing key lives in the PD body, not the URL.
      return JSON.stringify(formatPagerDuty(payload, channel.credential ?? ''));
    case 'opsgenie':
      return JSON.stringify(formatOpsgenie(payload));
    case 'webhook':
    default:
      return JSON.stringify(formatGeneric(payload));
  }
}

interface SlackBody {
  text: string;
  blocks: Array<{
    type: string;
    text?: { type: string; text: string };
    fields?: Array<{ type: string; text: string }>;
  }>;
}

function formatSlack(payload: AlertDeliveryPayload): SlackBody {
  const { rule, firing, summary, firedAtIso } = payload;
  return {
    text: summary,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*${summary}*` } },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Metric:*\n${rule.metric}` },
          { type: 'mrkdwn', text: `*Value:*\n${firing.metricValue}` },
          { type: 'mrkdwn', text: `*Threshold:*\n${rule.threshold}` },
          { type: 'mrkdwn', text: `*Window:*\n${rule.windowSeconds}s` },
          { type: 'mrkdwn', text: `*Severity:*\n${firing.severity}` },
          { type: 'mrkdwn', text: `*Fired at:*\n${firedAtIso}` },
        ],
      },
    ],
  };
}

interface DiscordBody {
  content: string;
  embeds: Array<{
    title: string;
    description: string;
    color: number;
    fields: Array<{ name: string; value: string; inline: boolean }>;
    timestamp: string;
  }>;
}

function formatDiscord(payload: AlertDeliveryPayload): DiscordBody {
  const { rule, firing, summary, firedAtIso, test } = payload;
  // Colour code mirrors the dashboard severity scale.
  const color =
    firing.severity === 'critical'
      ? 0xff3b30
      : firing.severity === 'warning'
        ? 0xff9500
        : firing.severity === 'info'
          ? 0x0a84ff
          : 0x8e8e93;
  return {
    content: test ? `[TEST] ${rule.name}` : rule.name,
    embeds: [
      {
        title: summary,
        description: `Threshold exceeded for **${rule.metric}**`,
        color,
        fields: [
          { name: 'Metric', value: rule.metric, inline: true },
          { name: 'Value', value: String(firing.metricValue), inline: true },
          { name: 'Threshold', value: String(rule.threshold), inline: true },
          { name: 'Window', value: `${rule.windowSeconds}s`, inline: true },
          { name: 'Severity', value: firing.severity, inline: true },
          { name: 'Rule', value: rule.id, inline: true },
        ],
        timestamp: firedAtIso,
      },
    ],
  };
}

interface GenericBody {
  source: 'erne-monitor';
  test: boolean;
  rule: { id: string; name: string; metric: string; threshold: number; windowSeconds: number };
  firing: {
    id: string;
    firedAt: number;
    firedAtIso: string;
    metricValue: number;
    severity: string;
  };
  summary: string;
}

function formatGeneric(payload: AlertDeliveryPayload): GenericBody {
  const { rule, firing, summary, firedAtIso, test } = payload;
  return {
    source: 'erne-monitor',
    test,
    rule: {
      id: rule.id,
      name: rule.name,
      metric: rule.metric,
      threshold: rule.threshold,
      windowSeconds: rule.windowSeconds,
    },
    firing: {
      id: firing.id,
      firedAt: firing.firedAt,
      firedAtIso,
      metricValue: firing.metricValue,
      severity: firing.severity,
    },
    summary,
  };
}

interface PagerDutyBody {
  routing_key: string;
  event_action: 'trigger';
  /** Dedup key = rule id so repeated firings collapse onto one PD incident. */
  dedup_key: string;
  payload: {
    summary: string;
    source: string;
    severity: 'critical' | 'error' | 'warning' | 'info';
    timestamp: string;
    component: string;
    group: string;
    custom_details: Record<string, unknown>;
  };
}

function formatPagerDuty(payload: AlertDeliveryPayload, routingKey: string): PagerDutyBody {
  const { rule, firing, summary, firedAtIso, test } = payload;
  return {
    routing_key: routingKey,
    event_action: 'trigger',
    // Dedup on rule id (spec): all firings of one rule fold into a single
    // open PD incident until it's resolved on the PagerDuty side.
    dedup_key: rule.id,
    payload: {
      summary,
      source: 'erne-monitor',
      severity: pagerDutySeverity(firing.severity),
      timestamp: firedAtIso,
      component: rule.metric,
      group: 'erne-monitor-alerts',
      custom_details: {
        test,
        ruleId: rule.id,
        ruleName: rule.name,
        metric: rule.metric,
        metricValue: firing.metricValue,
        threshold: rule.threshold,
        windowSeconds: rule.windowSeconds,
        firingId: firing.id,
      },
    },
  };
}

interface OpsgenieBody {
  message: string;
  /** Opsgenie dedup alias — rule id so re-firings update one alert. */
  alias: string;
  description: string;
  priority: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  source: string;
  tags: string[];
  details: Record<string, string>;
}

function formatOpsgenie(payload: AlertDeliveryPayload): OpsgenieBody {
  const { rule, firing, summary, firedAtIso, test } = payload;
  return {
    message: summary.length > 130 ? `${summary.slice(0, 127)}...` : summary,
    // Opsgenie de-duplicates by `alias`; rule id keeps re-firings on one alert.
    alias: rule.id,
    description: `Threshold exceeded for ${rule.metric}: ${firing.metricValue} >= ${rule.threshold} in ${rule.windowSeconds}s`,
    priority: opsgeniePriority(firing.severity),
    source: 'erne-monitor',
    tags: ['erne-monitor', rule.metric, firing.severity, ...(test ? ['test'] : [])],
    details: {
      test: String(test),
      ruleId: rule.id,
      ruleName: rule.name,
      metric: rule.metric,
      metricValue: String(firing.metricValue),
      threshold: String(rule.threshold),
      windowSeconds: String(rule.windowSeconds),
      firingId: firing.id,
      firedAt: firedAtIso,
    },
  };
}

/** Plain-text email body. Subject is the firing summary (set by deliverEmail). */
function formatEmailText(payload: AlertDeliveryPayload): string {
  const { rule, firing, summary, firedAtIso, test } = payload;
  const lines = [
    summary,
    '',
    `Rule:      ${rule.name} (${rule.id})`,
    `Metric:    ${rule.metric}`,
    `Value:     ${firing.metricValue}`,
    `Threshold: ${rule.threshold}`,
    `Window:    ${rule.windowSeconds}s`,
    `Severity:  ${firing.severity}`,
    `Fired at:  ${firedAtIso}`,
  ];
  if (test) lines.push('', 'This is a TEST notification triggered from the dashboard.');
  return lines.join('\n');
}
