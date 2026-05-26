import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createDashboardServer, type DashboardServerHandle } from './server.js';
import { DashboardStore } from './storage/sqliteStore.js';
import type { RemoteConfig } from './config/remoteConfig.js';

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

interface ConfigEnvelope {
  config: RemoteConfig;
}

describe('remote adaptive config endpoints (Task 117.17)', () => {
  let ctx: Awaited<ReturnType<typeof openServer>>;

  beforeEach(async () => {
    ctx = await openServer();
  });
  afterEach(async () => {
    await ctx.close();
  });

  test('GET /api/config returns defaults before any write', async () => {
    const res = await fetch(`${ctx.url}/api/config`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ConfigEnvelope;
    expect(body.config.sampling).toEqual({});
    expect(body.config.piiRules).toEqual([]);
    expect(body.config.featureFlags).toEqual({});
    expect(body.config.updatedAt).toBe(0);
  });

  test('GET /v1/config (SDK poll path) also returns defaults initially', async () => {
    const res = await fetch(`${ctx.url}/v1/config`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ConfigEnvelope;
    expect(body.config.sampling).toEqual({});
    expect(body.config.featureFlags).toEqual({});
  });

  test('PUT /api/config persists a valid config and GET reflects it + writes an audit row', async () => {
    const put = await fetch(`${ctx.url}/api/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sampling: { default: 0.5, crash: 1, log: 1.5 }, // 1.5 clamps to 1
        piiRules: ['email', 'authorization'],
        featureFlags: { newPipeline: true },
      }),
    });
    expect(put.status).toBe(200);
    const putBody = (await put.json()) as ConfigEnvelope;
    expect(putBody.config.sampling).toEqual({ default: 0.5, crash: 1, log: 1 });
    expect(putBody.config.piiRules).toEqual(['email', 'authorization']);
    expect(putBody.config.featureFlags).toEqual({ newPipeline: true });
    expect(putBody.config.updatedAt).toBeGreaterThan(0);

    // GET reflects the stored config (both surfaces).
    const apiGet = (await (await fetch(`${ctx.url}/api/config`)).json()) as ConfigEnvelope;
    expect(apiGet.config.sampling).toEqual({ default: 0.5, crash: 1, log: 1 });
    const v1Get = (await (await fetch(`${ctx.url}/v1/config`)).json()) as ConfigEnvelope;
    expect(v1Get.config.featureFlags).toEqual({ newPipeline: true });

    // An audit row was written with action=config-change for remote_config.
    const audit = await fetch(`${ctx.url}/api/audit?action=config-change`);
    const auditBody = (await audit.json()) as {
      rows: Array<{
        action: string;
        targetType: string;
        targetId: string;
        metadata?: { merge?: boolean; samplingKeys?: number; piiRules?: number; featureFlags?: number };
      }>;
      total: number;
    };
    expect(auditBody.total).toBe(1);
    expect(auditBody.rows[0]?.action).toBe('config-change');
    expect(auditBody.rows[0]?.targetType).toBe('settings');
    expect(auditBody.rows[0]?.targetId).toBe('remote_config');
    expect(auditBody.rows[0]?.metadata).toMatchObject({
      merge: false,
      samplingKeys: 3,
      piiRules: 2,
      featureFlags: 1,
    });
    // The audit metadata records shape stats, never PII rule contents.
    expect(JSON.stringify(auditBody.rows[0]?.metadata)).not.toContain('email');
  });

  test('PUT with invalid config returns 400 and leaves the config unchanged', async () => {
    // First store a valid config.
    await fetch(`${ctx.url}/api/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ featureFlags: { a: true } }),
    });

    // Invalid: unknown key + bad sampling.
    const bad = await fetch(`${ctx.url}/api/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bogus: 1, sampling: { x: 'nope' } }),
    });
    expect(bad.status).toBe(400);
    const badBody = (await bad.json()) as { error: string; errors: string[] };
    expect(badBody.error).toBe('invalid_config');
    expect(Array.isArray(badBody.errors)).toBe(true);
    expect(badBody.errors.length).toBeGreaterThan(0);

    // Config is unchanged — the earlier valid one is still there.
    const get = (await (await fetch(`${ctx.url}/api/config`)).json()) as ConfigEnvelope;
    expect(get.config.featureFlags).toEqual({ a: true });

    // Exactly one config-change audit row (from the first valid PUT only).
    const audit = await fetch(`${ctx.url}/api/audit?action=config-change`);
    const auditBody = (await audit.json()) as { total: number };
    expect(auditBody.total).toBe(1);
  });

  test('PUT with malformed JSON returns a structured 400 without crashing', async () => {
    const res = await fetch(`${ctx.url}/api/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });
    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toMatchObject({ error: 'invalid_json' });

    // Server still serves subsequent requests.
    const health = await fetch(`${ctx.url}/api/health`);
    expect(health.status).toBe(200);
  });

  test('PUT?merge=1 updates only the supplied sections', async () => {
    // Seed a full config.
    await fetch(`${ctx.url}/api/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sampling: { default: 0.3 },
        piiRules: ['ssn'],
        featureFlags: { a: true },
      }),
    });

    // Merge in only featureFlags.
    const merged = await fetch(`${ctx.url}/api/config?merge=1`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ featureFlags: { b: false } }),
    });
    expect(merged.status).toBe(200);
    const body = (await merged.json()) as ConfigEnvelope;
    expect(body.config.sampling).toEqual({ default: 0.3 }); // kept
    expect(body.config.piiRules).toEqual(['ssn']); // kept
    expect(body.config.featureFlags).toEqual({ b: false }); // replaced
  });

  test('PUT without ?merge replaces the whole config', async () => {
    await fetch(`${ctx.url}/api/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sampling: { default: 0.3 }, piiRules: ['ssn'] }),
    });
    const replaced = await fetch(`${ctx.url}/api/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ featureFlags: { b: true } }),
    });
    const body = (await replaced.json()) as ConfigEnvelope;
    expect(body.config.sampling).toEqual({}); // wiped on full replace
    expect(body.config.piiRules).toEqual([]); // wiped
    expect(body.config.featureFlags).toEqual({ b: true });
  });
});
