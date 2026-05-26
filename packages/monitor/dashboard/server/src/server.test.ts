import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createDashboardServer, type DashboardServerHandle } from './server.js';
import { DashboardStore } from './storage/sqliteStore.js';

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

describe('server alert rule endpoints', () => {
  let ctx: Awaited<ReturnType<typeof openServer>>;

  beforeEach(async () => {
    ctx = await openServer();
  });

  afterEach(async () => {
    await ctx.close();
  });

  test('POST /api/alert-rules creates a new rule and assigns an id if missing', async () => {
    const response = await fetch(`${ctx.url}/api/alert-rules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Crash spike',
        metric: 'crash_count',
        threshold: 5,
        windowSeconds: 300,
        channels: ['slack'],
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      rule: { id: string; name: string; createdAt: number };
    };
    expect(body.rule.id).toMatch(/^rule_/);
    expect(body.rule.name).toBe('Crash spike');
    expect(body.rule.createdAt).toBeGreaterThan(0);

    const list = (await (await fetch(`${ctx.url}/api/alert-rules`)).json()) as {
      rules: Array<{ id: string }>;
    };
    expect(list.rules).toHaveLength(1);
    expect(list.rules[0]?.id).toBe(body.rule.id);
  });

  test('POST with an existing id upserts (preserves createdAt, bumps updatedAt)', async () => {
    const rule = {
      id: 'rule_fixed',
      name: 'Initial',
      metric: 'crash_count',
      threshold: 1,
      windowSeconds: 60,
      channels: [],
      cooldownSeconds: 60,
      enabled: true,
      createdAt: 1_000,
    };
    await fetch(`${ctx.url}/api/alert-rules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(rule),
    });

    const second = await fetch(`${ctx.url}/api/alert-rules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...rule, name: 'Updated' }),
    });
    const body = (await second.json()) as {
      rule: { name: string; createdAt: number; updatedAt: number };
    };
    expect(body.rule.name).toBe('Updated');
    expect(body.rule.createdAt).toBe(1_000);
    expect(body.rule.updatedAt).toBeGreaterThan(1_000);
  });

  test('DELETE /api/alert-rules/:id removes the rule', async () => {
    const created = await fetch(`${ctx.url}/api/alert-rules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'X', metric: 'crash_count', threshold: 1, windowSeconds: 60 }),
    });
    const body = (await created.json()) as { rule: { id: string } };
    const deleteResponse = await fetch(`${ctx.url}/api/alert-rules/${body.rule.id}`, {
      method: 'DELETE',
    });
    expect(deleteResponse.status).toBe(200);
    const list = (await (await fetch(`${ctx.url}/api/alert-rules`)).json()) as {
      rules: unknown[];
    };
    expect(list.rules).toHaveLength(0);
  });

  test('GET /api/alert-history returns firings + honours ruleId filter', async () => {
    ctx.store.insertAlertFiring({
      id: 'fire-1',
      ruleId: 'rule-a',
      firedAt: 100,
      metricValue: 42,
      severity: 'critical',
    });
    ctx.store.insertAlertFiring({
      id: 'fire-2',
      ruleId: 'rule-b',
      firedAt: 200,
      metricValue: 3,
      severity: 'warning',
    });

    const all = (await (await fetch(`${ctx.url}/api/alert-history`)).json()) as {
      firings: Array<{ id: string }>;
    };
    expect(all.firings.map((f) => f.id).sort()).toEqual(['fire-1', 'fire-2']);

    const filtered = (await (await fetch(`${ctx.url}/api/alert-history?ruleId=rule-b`)).json()) as {
      firings: Array<{ id: string }>;
    };
    expect(filtered.firings.map((f) => f.id)).toEqual(['fire-2']);
  });
});

describe('alert evaluator wiring (Task 117.99)', () => {
  test('POST /api/alert-rules/:id/test-fire dispatches via stub fetch and persists firing', async () => {
    const fetchCalls: Array<{ url: string; body: unknown }> = [];
    const stubFetch: typeof fetch = (async (input, init) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      const body =
        init && typeof init === 'object' && 'body' in init && typeof (init as { body?: unknown }).body === 'string'
          ? JSON.parse((init as { body: string }).body)
          : null;
      fetchCalls.push({ url, body });
      return new Response('', { status: 200 });
    }) as typeof fetch;

    const store = new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true });
    const handle = createDashboardServer({
      host: '127.0.0.1',
      port: 0,
      store,
      enableWebsocket: false,
      publicDir: '/tmp/erne-monitor-nonexistent',
      alerts: { delivery: { fetch: stubFetch as never } },
    });
    await new Promise<void>((resolve) => handle.server.listen(0, '127.0.0.1', () => resolve()));
    const address = handle.server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const url = `http://127.0.0.1:${port}`;

    const created = await fetch(`${url}/api/alert-rules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Crash spike',
        metric: 'crash_count',
        threshold: 3,
        windowSeconds: 60,
        channels: ['webhook:https://example.com/erne'],
        cooldownSeconds: 60,
      }),
    });
    const ruleId = ((await created.json()) as { rule: { id: string } }).rule.id;

    const fired = await fetch(`${url}/api/alert-rules/${ruleId}/test-fire`, { method: 'POST' });
    expect(fired.status).toBe(200);
    const body = (await fired.json()) as {
      ok: boolean;
      firing: { id: string; ruleId: string };
      results: Array<{ ok: boolean; type: string; status: number }>;
    };
    expect(body.ok).toBe(true);
    expect(body.firing.ruleId).toBe(ruleId);
    expect(body.results).toHaveLength(1);
    expect(body.results[0]?.ok).toBe(true);
    expect(body.results[0]?.type).toBe('webhook');
    expect(fetchCalls).toHaveLength(1);
    const persisted = store.listAlertHistory();
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.payload).toEqual({ test: true, message: 'Test fire from dashboard' });

    await handle.close();
  });

  test('POST /api/alert-rules/:id/test-fire returns 404 for unknown rule', async () => {
    const handle = createDashboardServer({
      host: '127.0.0.1',
      port: 0,
      store: new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true }),
      enableWebsocket: false,
      publicDir: '/tmp/erne-monitor-nonexistent',
    });
    await new Promise<void>((resolve) => handle.server.listen(0, '127.0.0.1', () => resolve()));
    const address = handle.server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const url = `http://127.0.0.1:${port}`;

    const fired = await fetch(`${url}/api/alert-rules/nope/test-fire`, { method: 'POST' });
    expect(fired.status).toBe(404);

    await handle.close();
  });

  test('alerts: false disables evaluator + returns 503 on test-fire', async () => {
    const handle = createDashboardServer({
      host: '127.0.0.1',
      port: 0,
      store: new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true }),
      enableWebsocket: false,
      publicDir: '/tmp/erne-monitor-nonexistent',
      alerts: false,
    });
    await new Promise<void>((resolve) => handle.server.listen(0, '127.0.0.1', () => resolve()));
    const address = handle.server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const url = `http://127.0.0.1:${port}`;

    expect(handle.alertEvaluator).toBeNull();

    await fetch(`${url}/api/alert-rules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'noop',
        metric: 'crash_count',
        threshold: 1,
        windowSeconds: 60,
        channels: [],
      }),
    });
    const list = (await (await fetch(`${url}/api/alert-rules`)).json()) as {
      rules: Array<{ id: string }>;
    };
    const ruleId = list.rules[0]!.id;

    const fired = await fetch(`${url}/api/alert-rules/${ruleId}/test-fire`, { method: 'POST' });
    expect(fired.status).toBe(503);

    await handle.close();
  });

  test('rule mutation reloads evaluator (new rule fires next test-fire request)', async () => {
    const fetchCalls: string[] = [];
    const stubFetch: typeof fetch = (async (input) => {
      const u = typeof input === 'string' ? input : (input as URL).toString();
      fetchCalls.push(u);
      return new Response('', { status: 200 });
    }) as typeof fetch;
    const handle = createDashboardServer({
      host: '127.0.0.1',
      port: 0,
      store: new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true }),
      enableWebsocket: false,
      publicDir: '/tmp/erne-monitor-nonexistent',
      alerts: { delivery: { fetch: stubFetch as never } },
    });
    await new Promise<void>((resolve) => handle.server.listen(0, '127.0.0.1', () => resolve()));
    const address = handle.server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const url = `http://127.0.0.1:${port}`;

    expect(handle.alertEvaluator?.ruleCount).toBe(0);

    await fetch(`${url}/api/alert-rules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'webhook-rule',
        metric: 'crash_count',
        threshold: 1,
        windowSeconds: 60,
        channels: ['webhook:https://example.com/erne'],
      }),
    });
    expect(handle.alertEvaluator?.ruleCount).toBe(1);
    const ruleId = (
      (await (await fetch(`${url}/api/alert-rules`)).json()) as { rules: Array<{ id: string }> }
    ).rules[0]!.id;

    await fetch(`${url}/api/alert-rules/${ruleId}/test-fire`, { method: 'POST' });
    expect(fetchCalls).toHaveLength(1);

    // Delete drops the in-memory rule; subsequent test-fire 404s.
    await fetch(`${url}/api/alert-rules/${ruleId}`, { method: 'DELETE' });
    expect(handle.alertEvaluator?.ruleCount).toBe(0);
    const after = await fetch(`${url}/api/alert-rules/${ruleId}/test-fire`, { method: 'POST' });
    expect(after.status).toBe(404);

    await handle.close();
  });

  test('persisted ingest event triggers evaluator and fires when threshold crossed', async () => {
    const fetchCalls: Array<{ url: string }> = [];
    const stubFetch: typeof fetch = (async (input) => {
      const u = typeof input === 'string' ? input : (input as URL).toString();
      fetchCalls.push({ url: u });
      return new Response('', { status: 200 });
    }) as typeof fetch;
    const store = new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true });
    store.upsertSession({ id: 's1', startedAt: 0, eventCount: 0, crashCount: 0 });
    store.saveAlertRule({
      id: 'rule-x',
      name: 'Threshold',
      metric: 'crash_count',
      threshold: 2,
      windowSeconds: 60,
      channels: ['webhook:https://example.com/erne'],
      cooldownSeconds: 60,
      enabled: true,
      createdAt: 0,
      updatedAt: 0,
    });
    // Pin both the evaluator clock and the event timestamps to the
    // same instant so the rolling window never prunes the events
    // before the threshold is checked.
    const FROZEN = 1_770_000_000_000;
    const handle = createDashboardServer({
      host: '127.0.0.1',
      port: 0,
      store,
      enableWebsocket: false,
      publicDir: '/tmp/erne-monitor-nonexistent',
      alerts: { delivery: { fetch: stubFetch as never }, now: () => FROZEN },
    });
    await new Promise<void>((resolve) => handle.server.listen(0, '127.0.0.1', () => resolve()));

    expect(handle.alertEvaluator?.ruleCount).toBe(1);

    // Drive the evaluator directly — the WS handler is disabled in this
    // harness, but the ingest hook flows through the same code path.
    await handle.alertEvaluator!.onEvent({
      id: 'e1',
      type: 'crash',
      severity: 'critical',
      sessionId: 's1',
      timestamp: FROZEN,
      receivedAt: FROZEN,
      payload: { message: 'boom' },
    });
    expect(fetchCalls).toHaveLength(0);
    await handle.alertEvaluator!.onEvent({
      id: 'e2',
      type: 'crash',
      severity: 'critical',
      sessionId: 's1',
      timestamp: FROZEN,
      receivedAt: FROZEN,
      payload: { message: 'boom' },
    });
    expect(fetchCalls).toHaveLength(1);
    expect(store.listAlertHistory()).toHaveLength(1);

    await handle.close();
  });
});

describe('server bug report endpoints', () => {
  let ctx: Awaited<ReturnType<typeof openServer>>;

  beforeEach(async () => {
    ctx = await openServer();
  });

  afterEach(async () => {
    await ctx.close();
  });

  test('PATCH /api/bug-reports/:id updates status + assignee and returns the fresh row', async () => {
    ctx.store.insertBugReport({
      id: 'bug-1',
      sessionId: 's1',
      submittedAt: 100,
      title: 'Shaky UI',
      status: 'new',
    });

    const response = await fetch(`${ctx.url}/api/bug-reports/bug-1`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'assigned', assignee: 'juba' }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      report: { id: string; status: string; assignee: string };
    };
    expect(body.report.status).toBe('assigned');
    expect(body.report.assignee).toBe('juba');

    const list = (await (await fetch(`${ctx.url}/api/bug-reports`)).json()) as {
      reports: Array<{ id: string; status: string; assignee: string }>;
    };
    expect(list.reports[0]?.status).toBe('assigned');
    expect(list.reports[0]?.assignee).toBe('juba');
  });

  test('PATCH with invalid status ignores the field rather than corrupting the row', async () => {
    ctx.store.insertBugReport({
      id: 'bug-2',
      sessionId: 's1',
      submittedAt: 200,
      title: 'Initial',
      status: 'new',
    });
    await fetch(`${ctx.url}/api/bug-reports/bug-2`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'bogus', title: 'Edited title' }),
    });
    const list = (await (await fetch(`${ctx.url}/api/bug-reports`)).json()) as {
      reports: Array<{ id: string; status: string; title: string }>;
    };
    expect(list.reports[0]?.status).toBe('new');
    expect(list.reports[0]?.title).toBe('Edited title');
  });
});

describe('operational probes (Task 117.67 + 117.100)', () => {
  let ctx: Awaited<ReturnType<typeof openServer>>;

  beforeEach(async () => {
    ctx = await openServer();
  });

  afterEach(async () => {
    await ctx.close();
  });

  test('GET /api/health returns 200 with store selfCheck + uptime', async () => {
    const response = await fetch(`${ctx.url}/api/health`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      tables: string[];
      uptimeSeconds: number;
      ingest: unknown;
    };
    expect(body.ok).toBe(true);
    expect(body.tables).toContain('events');
    expect(body.tables).toContain('sessions');
    expect(typeof body.uptimeSeconds).toBe('number');
    // enableWebsocket:false in the harness, so ingest should be null.
    expect(body.ingest).toBeNull();
  });

  test('GET /api/ready returns 200 with readyCheck report when migrations are applied', async () => {
    const response = await fetch(`${ctx.url}/api/ready`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ready: boolean;
      reason?: string;
      migrationsApplied: number;
    };
    expect(body.ready).toBe(true);
    expect(body.migrationsApplied).toBe(4);
    expect(body.reason).toBeUndefined();
  });

  test('GET /api/ready returns 503 when migrations are pending', async () => {
    // Close the shared harness store, then spin up a new server with a
    // store that has had its _migrations rows wiped underneath it — that
    // simulates "migrations pending" without our having to run the server
    // with zero migrations (which would violate the schema).
    await ctx.close();
    const store = new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true });
    // Manually delete rows from _migrations to simulate a partially-applied
    // migration state. `readyCheck` compares against DEFAULT_MIGRATIONS.length.
    store.raw.prepare('DELETE FROM _migrations').run();
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
    const url = `http://127.0.0.1:${port}`;

    const response = await fetch(`${url}/api/ready`);
    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      ready: boolean;
      reason?: string;
      migrationsApplied: number;
    };
    expect(body.ready).toBe(false);
    expect(body.reason).toMatch(/migrations pending/i);
    expect(body.migrationsApplied).toBe(0);
    await handle.close();
  });
});

describe('API-key auth gate (Task 117.61)', () => {
  async function openGuarded(apiKey: string): Promise<{
    handle: DashboardServerHandle;
    url: string;
    close: () => Promise<void>;
  }> {
    const store = new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true });
    const handle = createDashboardServer({
      host: '127.0.0.1',
      port: 0,
      store,
      enableWebsocket: false,
      publicDir: '/tmp/erne-monitor-nonexistent',
      apiKey,
    });
    await new Promise<void>((resolve) => handle.server.listen(0, '127.0.0.1', () => resolve()));
    const address = handle.server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    return {
      handle,
      url: `http://127.0.0.1:${port}`,
      close: () => handle.close(),
    };
  }

  test('without a key, API endpoints remain open (dev default)', async () => {
    const ctx = await openServer();
    try {
      const response = await fetch(`${ctx.url}/api/alert-rules`);
      expect(response.status).toBe(200);
    } finally {
      await ctx.close();
    }
  });

  test('with a key, /api/alert-rules requires auth', async () => {
    const ctx = await openGuarded('secret-abc-123');
    try {
      const noAuth = await fetch(`${ctx.url}/api/alert-rules`);
      expect(noAuth.status).toBe(401);
      expect(((await noAuth.json()) as { error: string }).error).toBe('missing_auth');

      const wrong = await fetch(`${ctx.url}/api/alert-rules`, {
        headers: { authorization: 'Bearer wrong-key' },
      });
      expect(wrong.status).toBe(401);
      expect(((await wrong.json()) as { error: string }).error).toBe('unauthorized');

      const ok = await fetch(`${ctx.url}/api/alert-rules`, {
        headers: { authorization: 'Bearer secret-abc-123' },
      });
      expect(ok.status).toBe(200);
    } finally {
      await ctx.close();
    }
  });

  test('query param apiKey is accepted as a fallback', async () => {
    const ctx = await openGuarded('secret-xyz');
    try {
      const ok = await fetch(`${ctx.url}/api/alert-rules?apiKey=secret-xyz`);
      expect(ok.status).toBe(200);
    } finally {
      await ctx.close();
    }
  });

  test('health + ready stay public even with a key configured', async () => {
    const ctx = await openGuarded('secret-xyz');
    try {
      const health = await fetch(`${ctx.url}/api/health`);
      expect(health.status).toBe(200);
      const ready = await fetch(`${ctx.url}/api/ready`);
      expect(ready.status).toBe(200);
    } finally {
      await ctx.close();
    }
  });
});

describe('queue observability (Task 117.5)', () => {
  test('GET /api/queue/stats returns null when WS is disabled', async () => {
    const ctx = await openServer();
    try {
      const response = await fetch(`${ctx.url}/api/queue/stats`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { queue: unknown };
      expect(body.queue).toBeNull();
    } finally {
      await ctx.close();
    }
  });

  test('GET /api/queue/stats returns a QueueStats shape when WS is enabled', async () => {
    const store = new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true });
    const handle = createDashboardServer({
      host: '127.0.0.1',
      port: 0,
      store,
      publicDir: '/tmp/erne-monitor-nonexistent',
      // enableWebsocket defaults true — exercise the real path.
      retention: false,
    });
    await new Promise<void>((resolve) => handle.server.listen(0, '127.0.0.1', () => resolve()));
    const address = handle.server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const url = `http://127.0.0.1:${port}`;
    try {
      const response = await fetch(`${url}/api/queue/stats`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        queue: {
          enqueued: number;
          processed: number;
          failed: number;
          retried: number;
          backpressured: number;
          currentSize: number;
          inFlight: number;
          highWaterMark: number;
        } | null;
      };
      expect(body.queue).toMatchObject({
        enqueued: expect.any(Number),
        processed: expect.any(Number),
        failed: expect.any(Number),
        retried: expect.any(Number),
        backpressured: expect.any(Number),
        currentSize: expect.any(Number),
        inFlight: expect.any(Number),
        highWaterMark: expect.any(Number),
      });
    } finally {
      await handle.close();
    }
  });
});

describe('AI agent action audit (Task 117.81)', () => {
  let ctx: Awaited<ReturnType<typeof openServer>>;

  beforeEach(async () => {
    ctx = await openServer();
  });
  afterEach(async () => {
    await ctx.close();
  });

  test('POST /api/audit/ai-actions writes a row, GET reads it back', async () => {
    const post = await fetch(`${ctx.url}/api/audit/ai-actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'act-rest-1',
        agent: 'ai-fix-pr',
        action: 'propose-fix',
        outcome: 'proposed',
        fingerprint: 'fp-rest',
        confidence: 75,
        prUrl: 'https://github.com/o/r/pull/1',
        toolsCalled: ['list_crash_groups'],
      }),
    });
    expect(post.status).toBe(200);
    const postBody = (await post.json()) as { ok: boolean; inserted: boolean };
    expect(postBody.ok).toBe(true);
    expect(postBody.inserted).toBe(true);

    const get = await fetch(`${ctx.url}/api/audit/ai-actions?fingerprint=fp-rest`);
    expect(get.status).toBe(200);
    const body = (await get.json()) as {
      rows: Array<{ id: string; prUrl: string }>;
      total: number;
    };
    expect(body.total).toBe(1);
    expect(body.rows[0]?.id).toBe('act-rest-1');
    expect(body.rows[0]?.prUrl).toBe('https://github.com/o/r/pull/1');
  });

  test('POST returns 400 on missing required fields', async () => {
    const res = await fetch(`${ctx.url}/api/audit/ai-actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agent: 'a', action: 'b', outcome: 'c' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('missing-id');
  });

  test('POST is idempotent on id', async () => {
    const payload = JSON.stringify({
      id: 'idempotent-1',
      agent: 'a',
      action: 'b',
      outcome: 'c',
    });
    const a = await fetch(`${ctx.url}/api/audit/ai-actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
    });
    const b = await fetch(`${ctx.url}/api/audit/ai-actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
    });
    const aBody = (await a.json()) as { inserted: boolean };
    const bBody = (await b.json()) as { inserted: boolean };
    expect(aBody.inserted).toBe(true);
    expect(bBody.inserted).toBe(false);
  });

  test('GET supports filter combos (agent, outcome, since, limit)', async () => {
    for (let i = 0; i < 5; i++) {
      await fetch(`${ctx.url}/api/audit/ai-actions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: `combo-${i}`,
          timestamp: 1_770_000_000_000 + i * 1000,
          agent: i < 3 ? 'ai-fix-pr' : 'mcp-tool',
          action: 'invoked',
          outcome: i % 2 === 0 ? 'proposed' : 'errored',
        }),
      });
    }
    const res = await fetch(
      `${ctx.url}/api/audit/ai-actions?agent=ai-fix-pr&outcome=proposed&limit=10`,
    );
    const body = (await res.json()) as { total: number };
    expect(body.total).toBe(2);
  });
});

describe('crash-group status mutation (Task 117.82 follow-up)', () => {
  let ctx: Awaited<ReturnType<typeof openServer>>;

  beforeEach(async () => {
    ctx = await openServer();
    ctx.store.upsertCrashGroup({
      fingerprint: 'fp-status-1',
      message: 'Boom',
      firstSeen: 1,
      lastSeen: 2,
      eventCount: 3,
      sessionCount: 1,
      status: 'new',
    });
  });
  afterEach(async () => {
    await ctx.close();
  });

  test('POST sets a valid status and returns the updated group', async () => {
    const res = await fetch(`${ctx.url}/api/crash-groups/fp-status-1/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'investigating' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; group: { status: string } };
    expect(body.ok).toBe(true);
    expect(body.group.status).toBe('investigating');
    // Persisted.
    expect(ctx.store.listCrashGroups()[0]?.status).toBe('investigating');
  });

  test('rejects an invalid status with 400 + allowed list', async () => {
    const res = await fetch(`${ctx.url}/api/crash-groups/fp-status-1/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'acknowledged' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; allowed: string[] };
    expect(body.error).toBe('invalid_status');
    expect(body.allowed).toContain('investigating');
  });

  test('returns 404 for an unknown fingerprint', async () => {
    const res = await fetch(`${ctx.url}/api/crash-groups/nope/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' }),
    });
    expect(res.status).toBe(404);
  });
});
