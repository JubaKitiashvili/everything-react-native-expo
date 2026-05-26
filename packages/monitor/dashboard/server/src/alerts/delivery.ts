// Task 117.99 — alert delivery to Slack / Discord / generic webhooks.
//
// One class wraps the three transports the spec calls "first cut": Slack
// incoming-webhooks, Discord webhooks, and a generic JSON POST. Each
// channel is identified by a `<type>:<url>` string in the rule's
// `channels` array. Anything we can't parse falls through to a `failed`
// result with `error: 'not_a_url'` — never a thrown exception — so a
// typo in one channel never blocks delivery to the others.
//
// Retries: 5xx and network errors retry with exponential backoff up to
// `maxAttempts` (default 3). 408 and 429 are treated as transient too
// (the Slack/Discord limiters honour 429 with a Retry-After header). All
// other 4xx responses fail immediately — they indicate a misconfigured
// webhook URL and retrying won't help.
//
// The transport is intentionally framework-free. We accept an injectable
// `fetch` so unit tests can run without spinning up a real HTTP server.

import {
  defaultSummary,
  parseChannel,
  type AlertChannelType,
  type AlertDeliveryPayload,
  type AlertDeliveryResult,
  type ParsedAlertChannel,
} from './types.js';
import { signPayload, X_ERNE_SIGNATURE_HEADER } from '../webhooks/sign.js';
import type { AlertRuleRecord, AlertFiringRecord } from '../storage/types.js';

/** Minimal fetch shape we rely on. `globalThis.fetch` matches it. */
export type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

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
    if (channel.type === 'unknown' || channel.url === null) {
      const err = new Error(channel.url === null ? 'invalid_url' : 'unknown_channel_type');
      this.onError(err, { rule: ruleId, channel: channel.raw });
      return {
        channel: channel.raw,
        type: channel.type,
        ok: false,
        attempts: 0,
        error: err.message,
        durationMs: this.now() - start,
      };
    }
    const body = formatBody(channel.type, payload);
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    // Task 117.63 — sign generic webhook bodies so the receiver can
    // verify authenticity + integrity. Only the generic `webhook` type
    // gets the header; Slack / Discord rely on their URL-embedded secret.
    if (channel.type === 'webhook' && this.webhookSigningSecret) {
      headers[X_ERNE_SIGNATURE_HEADER] = signPayload(this.webhookSigningSecret, body);
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
          response = await this.fetchImpl(channel.url, {
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

function formatBody(type: AlertChannelType, payload: AlertDeliveryPayload): string {
  switch (type) {
    case 'slack':
      return JSON.stringify(formatSlack(payload));
    case 'discord':
      return JSON.stringify(formatDiscord(payload));
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
