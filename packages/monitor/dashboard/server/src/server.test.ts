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
    const body = (await response.json()) as { rule: { id: string; name: string; createdAt: number } };
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

    const filtered = (await (
      await fetch(`${ctx.url}/api/alert-history?ruleId=rule-b`)
    ).json()) as { firings: Array<{ id: string }> };
    expect(filtered.firings.map((f) => f.id)).toEqual(['fire-2']);
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
