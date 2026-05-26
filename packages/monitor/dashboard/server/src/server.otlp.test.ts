import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createDashboardServer, type DashboardServerHandle } from './server.js';
import { DashboardStore } from './storage/sqliteStore.js';
import type { EventRecord } from './storage/types.js';

async function openServer(): Promise<DashboardServerHandle & { url: string }> {
  const store = new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true });
  const handle = createDashboardServer({
    host: '127.0.0.1',
    port: 0,
    store,
    enableWebsocket: false,
    publicDir: '/tmp/erne-monitor-nonexistent',
  });
  await new Promise<void>((resolve) => handle.server.listen(0, '127.0.0.1', () => resolve()));
  const address = handle.server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return { ...handle, port, url: `http://127.0.0.1:${port}` };
}

async function listEvents(url: string, type: string): Promise<EventRecord[]> {
  const res = await fetch(`${url}/api/events?type=${type}`);
  const body = (await res.json()) as { events: EventRecord[] };
  return body.events;
}

describe('OTLP/HTTP JSON ingest endpoints', () => {
  let ctx: Awaited<ReturnType<typeof openServer>>;

  beforeEach(async () => {
    ctx = await openServer();
  });

  afterEach(async () => {
    await ctx.close();
  });

  test('POST /v1/traces stores spans and returns the OTLP success shape', async () => {
    const res = await fetch(`${ctx.url}/v1/traces`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        resourceSpans: [
          {
            resource: { attributes: [{ key: 'service.name', value: { stringValue: 'svc' } }] },
            scopeSpans: [
              {
                scope: { name: 'tracer' },
                spans: [
                  {
                    traceId: 't1',
                    spanId: 's1',
                    name: 'GET /x',
                    startTimeUnixNano: '1700000000000000000',
                    endTimeUnixNano: '1700000000250000000',
                    status: { code: 2 },
                  },
                ],
              },
            ],
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { partialSuccess: unknown; accepted: number };
    expect(body.partialSuccess).toEqual({});
    expect(body.accepted).toBe(1);

    const events = await listEvents(ctx.url, 'span');
    expect(events).toHaveLength(1);
    expect(events[0]!.severity).toBe('warning');
    expect(events[0]!.payload).toMatchObject({ name: 'GET /x', traceId: 't1', durationMs: 250 });
  });

  test('POST /v1/logs stores logs', async () => {
    const res = await fetch(`${ctx.url}/v1/logs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        resourceLogs: [
          {
            scopeLogs: [
              {
                logRecords: [
                  {
                    timeUnixNano: '1700000000000000000',
                    severityNumber: 17,
                    body: { stringValue: 'failure' },
                  },
                ],
              },
            ],
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { accepted: number }).accepted).toBe(1);

    const events = await listEvents(ctx.url, 'log');
    expect(events).toHaveLength(1);
    expect(events[0]!.severity).toBe('critical');
    expect(events[0]!.payload.message).toBe('failure');
  });

  test('POST /v1/metrics stores metric data points', async () => {
    const res = await fetch(`${ctx.url}/v1/metrics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        resourceMetrics: [
          {
            scopeMetrics: [
              {
                metrics: [
                  { name: 'rps', gauge: { dataPoints: [{ asDouble: 12.5 }] } },
                  { name: 'count', sum: { dataPoints: [{ asInt: '7' }] } },
                ],
              },
            ],
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { accepted: number }).accepted).toBe(2);

    const events = await listEvents(ctx.url, 'metric');
    expect(events).toHaveLength(2);
    const names = events.map((e) => e.payload.name).sort();
    expect(names).toEqual(['count', 'rps']);
  });

  test('malformed JSON returns a structured 400 without crashing', async () => {
    const res = await fetch(`${ctx.url}/v1/traces`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });
    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toMatchObject({ error: 'invalid_json' });

    // Server still serves subsequent requests.
    const health = await fetch(`${ctx.url}/api/health`);
    expect(health.status).toBe(200);
  });

  test('an empty OTLP body accepts zero events (never crashes)', async () => {
    const res = await fetch(`${ctx.url}/v1/metrics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { accepted: number }).accepted).toBe(0);
  });
});
