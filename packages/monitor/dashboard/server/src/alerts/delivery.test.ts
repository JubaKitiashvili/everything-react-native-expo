// Task 117.99 — AlertDelivery unit tests.

import { describe, expect, test } from 'vitest';
import { AlertDelivery, type FetchLike } from './delivery.js';
import { verifySignature, X_ERNE_SIGNATURE_HEADER } from '../webhooks/sign.js';
import type { AlertFiringRecord, AlertRuleRecord } from '../storage/types.js';

const NOW = 1_770_000_000_000;

function makeRule(overrides: Partial<AlertRuleRecord> = {}): AlertRuleRecord {
  return {
    id: 'rule-1',
    name: 'Crash spike',
    metric: 'crash_count',
    threshold: 5,
    windowSeconds: 300,
    channels: [],
    cooldownSeconds: 60,
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeFiring(overrides: Partial<AlertFiringRecord> = {}): AlertFiringRecord {
  return {
    id: 'fire-1',
    ruleId: 'rule-1',
    firedAt: NOW,
    metricValue: 7,
    severity: 'critical',
    ...overrides,
  };
}

interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function makeFetch(
  responder: (req: RecordedRequest, callIndex: number) =>
    | { ok: boolean; status: number; body?: string; throwOnFetch?: never }
    | { throwOnFetch: Error; ok?: never; status?: never; body?: never },
): { fetch: FetchLike; calls: RecordedRequest[] } {
  const calls: RecordedRequest[] = [];
  const fetch: FetchLike = async (url, init) => {
    const req: RecordedRequest = {
      url,
      method: init.method,
      headers: init.headers,
      body: init.body ? JSON.parse(init.body) : null,
    };
    calls.push(req);
    const out = responder(req, calls.length - 1);
    if ('throwOnFetch' in out && out.throwOnFetch) throw out.throwOnFetch;
    if (out.ok === undefined) throw new Error('test fetch responder missing ok');
    return {
      ok: out.ok,
      status: out.status,
      text: async () => out.body ?? '',
    };
  };
  return { fetch, calls };
}

describe('AlertDelivery — channel parsing + formatting', () => {
  test('Slack channel posts blocks-formatted body to the URL', async () => {
    const { fetch, calls } = makeFetch(() => ({ ok: true, status: 200 }));
    const delivery = new AlertDelivery({ fetch, sleep: async () => {} });
    const rule = makeRule({ channels: ['slack:https://hooks.slack.com/services/T/X/Y'] });
    const results = await delivery.deliverAll(rule, makeFiring());
    expect(results).toHaveLength(1);
    expect(results[0]?.ok).toBe(true);
    expect(results[0]?.type).toBe('slack');
    expect(results[0]?.attempts).toBe(1);
    expect(calls[0]?.url).toBe('https://hooks.slack.com/services/T/X/Y');
    expect(calls[0]?.method).toBe('POST');
    const body = calls[0]?.body as { text: string; blocks: unknown[] };
    expect(body.text).toContain('Crash spike');
    expect(body.blocks.length).toBeGreaterThan(0);
  });

  test('Discord channel posts embed-formatted body', async () => {
    const { fetch, calls } = makeFetch(() => ({ ok: true, status: 204 }));
    const delivery = new AlertDelivery({ fetch, sleep: async () => {} });
    const rule = makeRule({ channels: ['discord:https://discord.com/api/webhooks/1/x'] });
    await delivery.deliverAll(rule, makeFiring({ severity: 'warning' }));
    const body = calls[0]?.body as { embeds: Array<{ color: number; fields: Array<unknown> }> };
    expect(body.embeds[0]?.color).toBe(0xff9500);
    expect(body.embeds[0]?.fields.length).toBeGreaterThan(0);
  });

  test('Generic webhook posts the documented JSON envelope', async () => {
    const { fetch, calls } = makeFetch(() => ({ ok: true, status: 200 }));
    const delivery = new AlertDelivery({ fetch, sleep: async () => {} });
    const rule = makeRule({ channels: ['webhook:https://example.com/erne'] });
    await delivery.deliverAll(rule, makeFiring(), { test: true });
    const body = calls[0]?.body as {
      source: string;
      test: boolean;
      rule: { id: string };
      firing: { metricValue: number };
      summary: string;
    };
    expect(body.source).toBe('erne-monitor');
    expect(body.test).toBe(true);
    expect(body.rule.id).toBe('rule-1');
    expect(body.firing.metricValue).toBe(7);
    expect(body.summary).toContain('[TEST]');
  });

  test('Unknown channel type fails fast with not_a_url-style error and no fetch call', async () => {
    const { fetch, calls } = makeFetch(() => ({ ok: true, status: 200 }));
    const delivery = new AlertDelivery({ fetch, sleep: async () => {}, onError: () => {} });
    const rule = makeRule({ channels: ['email:ops@example.com'] });
    const results = await delivery.deliverAll(rule, makeFiring());
    expect(calls).toHaveLength(0);
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.type).toBe('unknown');
    expect(results[0]?.attempts).toBe(0);
  });

  test('Missing protocol falls into invalid_url failure', async () => {
    const { fetch, calls } = makeFetch(() => ({ ok: true, status: 200 }));
    const delivery = new AlertDelivery({ fetch, sleep: async () => {}, onError: () => {} });
    const rule = makeRule({ channels: ['slack:no-scheme.example.com'] });
    const results = await delivery.deliverAll(rule, makeFiring());
    expect(calls).toHaveLength(0);
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.error).toBe('invalid_url');
    // Type is preserved so the operator sees what they configured.
    expect(results[0]?.type).toBe('slack');
  });

  test('Bare strings (no colon) collapse to unknown', async () => {
    const { fetch, calls } = makeFetch(() => ({ ok: true, status: 200 }));
    const delivery = new AlertDelivery({ fetch, sleep: async () => {}, onError: () => {} });
    const rule = makeRule({ channels: ['slack'] });
    const results = await delivery.deliverAll(rule, makeFiring());
    expect(calls).toHaveLength(0);
    expect(results[0]?.type).toBe('unknown');
  });
});

describe('AlertDelivery — retries', () => {
  test('5xx retries up to maxAttempts then surfaces failure', async () => {
    let attempt = 0;
    const { fetch, calls } = makeFetch(() => {
      attempt += 1;
      return { ok: false, status: 502, body: 'bad gateway' };
    });
    const delivery = new AlertDelivery({
      fetch,
      sleep: async () => {},
      maxAttempts: 3,
      onError: () => {},
    });
    const rule = makeRule({ channels: ['webhook:https://example.com'] });
    const results = await delivery.deliverAll(rule, makeFiring());
    expect(attempt).toBe(3);
    expect(calls).toHaveLength(3);
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.attempts).toBe(3);
    expect(results[0]?.status).toBe(502);
    expect(results[0]?.error).toContain('502');
  });

  test('5xx then 200 succeeds with attempts=2', async () => {
    let attempt = 0;
    const { fetch } = makeFetch(() => {
      attempt += 1;
      return attempt === 1
        ? { ok: false, status: 503, body: 'unavailable' }
        : { ok: true, status: 200 };
    });
    const delivery = new AlertDelivery({ fetch, sleep: async () => {}, onError: () => {} });
    const rule = makeRule({ channels: ['webhook:https://example.com'] });
    const results = await delivery.deliverAll(rule, makeFiring());
    expect(results[0]?.ok).toBe(true);
    expect(results[0]?.attempts).toBe(2);
  });

  test('429 is treated as retryable', async () => {
    let attempt = 0;
    const { fetch } = makeFetch(() => {
      attempt += 1;
      return attempt === 1
        ? { ok: false, status: 429, body: 'slow down' }
        : { ok: true, status: 200 };
    });
    const delivery = new AlertDelivery({ fetch, sleep: async () => {}, onError: () => {} });
    const rule = makeRule({ channels: ['webhook:https://example.com'] });
    const results = await delivery.deliverAll(rule, makeFiring());
    expect(results[0]?.ok).toBe(true);
    expect(results[0]?.attempts).toBe(2);
  });

  test('404 fails immediately without retry', async () => {
    let attempt = 0;
    const { fetch } = makeFetch(() => {
      attempt += 1;
      return { ok: false, status: 404, body: 'gone' };
    });
    const delivery = new AlertDelivery({ fetch, sleep: async () => {}, onError: () => {} });
    const rule = makeRule({ channels: ['webhook:https://example.com'] });
    const results = await delivery.deliverAll(rule, makeFiring());
    expect(attempt).toBe(1);
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.status).toBe(404);
    expect(results[0]?.attempts).toBe(1);
  });

  test('Network error retries up to maxAttempts', async () => {
    let attempt = 0;
    const { fetch } = makeFetch(() => {
      attempt += 1;
      return { throwOnFetch: new Error('ECONNRESET') };
    });
    const delivery = new AlertDelivery({
      fetch,
      sleep: async () => {},
      maxAttempts: 3,
      onError: () => {},
    });
    const rule = makeRule({ channels: ['webhook:https://example.com'] });
    const results = await delivery.deliverAll(rule, makeFiring());
    expect(attempt).toBe(3);
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.attempts).toBe(3);
    expect(results[0]?.error).toContain('ECONNRESET');
    expect(results[0]?.status).toBeUndefined();
  });

  test('Network error then 200 succeeds', async () => {
    let attempt = 0;
    const { fetch } = makeFetch(() => {
      attempt += 1;
      if (attempt === 1) return { throwOnFetch: new Error('socket hang up') };
      return { ok: true, status: 200 };
    });
    const delivery = new AlertDelivery({ fetch, sleep: async () => {}, onError: () => {} });
    const rule = makeRule({ channels: ['webhook:https://example.com'] });
    const results = await delivery.deliverAll(rule, makeFiring());
    expect(results[0]?.ok).toBe(true);
    expect(results[0]?.attempts).toBe(2);
  });

  test('Multi-channel delivery dispatches in parallel and reports each', async () => {
    const { fetch, calls } = makeFetch((req) => {
      if (req.url.includes('slack')) return { ok: true, status: 200 };
      if (req.url.includes('discord')) return { ok: false, status: 404, body: 'gone' };
      return { ok: true, status: 200 };
    });
    const delivery = new AlertDelivery({ fetch, sleep: async () => {}, onError: () => {} });
    const rule = makeRule({
      channels: [
        'slack:https://hooks.slack.com/x',
        'discord:https://discord.com/api/webhooks/1/x',
        'webhook:https://example.com',
      ],
    });
    const results = await delivery.deliverAll(rule, makeFiring());
    expect(results).toHaveLength(3);
    const byType = Object.fromEntries(results.map((r) => [r.type, r.ok]));
    expect(byType.slack).toBe(true);
    expect(byType.discord).toBe(false);
    expect(byType.webhook).toBe(true);
    expect(calls).toHaveLength(3);
  });
});

describe('AlertDelivery — HMAC webhook signatures (Task 117.63)', () => {
  const SECRET = 'shared-webhook-secret';

  /** Capture the exact raw body string so we can verify the signature. */
  function makeCapturingFetch(): {
    fetch: FetchLike;
    sent: Array<{ url: string; headers: Record<string, string>; rawBody: string }>;
  } {
    const sent: Array<{ url: string; headers: Record<string, string>; rawBody: string }> = [];
    const fetch: FetchLike = async (url, init) => {
      sent.push({ url, headers: init.headers, rawBody: init.body });
      return { ok: true, status: 200, text: async () => '' };
    };
    return { fetch, sent };
  }

  test('signs the generic webhook body with X-ERNE-Signature when a secret is set', async () => {
    const { fetch, sent } = makeCapturingFetch();
    const delivery = new AlertDelivery({
      fetch,
      sleep: async () => {},
      onError: () => {},
      webhookSigningSecret: SECRET,
    });
    const rule = makeRule({ channels: ['webhook:https://example.com/erne'] });
    const results = await delivery.deliverAll(rule, makeFiring());
    expect(results[0]?.ok).toBe(true);
    expect(sent).toHaveLength(1);
    const header = sent[0]?.headers[X_ERNE_SIGNATURE_HEADER];
    expect(header).toMatch(/^sha256=[0-9a-f]{64}$/);
    // The receiver re-derives + verifies over the exact bytes we sent.
    expect(verifySignature(SECRET, sent[0]!.rawBody, header)).toBe(true);
    // A different secret must NOT verify.
    expect(verifySignature('other', sent[0]!.rawBody, header)).toBe(false);
  });

  test('does NOT sign when no secret is configured', async () => {
    const { fetch, sent } = makeCapturingFetch();
    const delivery = new AlertDelivery({ fetch, sleep: async () => {}, onError: () => {} });
    const rule = makeRule({ channels: ['webhook:https://example.com/erne'] });
    await delivery.deliverAll(rule, makeFiring());
    expect(sent[0]?.headers[X_ERNE_SIGNATURE_HEADER]).toBeUndefined();
  });

  test('does NOT sign Slack / Discord channels even when a secret is set', async () => {
    const { fetch, sent } = makeCapturingFetch();
    const delivery = new AlertDelivery({
      fetch,
      sleep: async () => {},
      onError: () => {},
      webhookSigningSecret: SECRET,
    });
    const rule = makeRule({
      channels: ['slack:https://hooks.slack.com/x', 'discord:https://discord.com/api/webhooks/1/x'],
    });
    await delivery.deliverAll(rule, makeFiring());
    for (const req of sent) {
      expect(req.headers[X_ERNE_SIGNATURE_HEADER]).toBeUndefined();
    }
  });
});
