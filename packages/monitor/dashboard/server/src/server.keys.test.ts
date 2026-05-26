import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { WebSocket } from 'ws';
import { createDashboardServer, type DashboardServerHandle } from './server.js';
import { DashboardStore } from './storage/sqliteStore.js';
import { INGEST_PATH } from './ingest/wsHandler.js';

/** HTTP-only harness (no WS) — mirrors server.config.test.ts. */
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

interface KeySummary {
  id: string;
  status: 'active' | 'grace' | 'expired' | 'revoked';
  createdAt: number;
  retiredAt?: number;
  revokedAt?: number;
  label?: string;
}

interface KeysEnvelope {
  keys: KeySummary[];
  enforcing: boolean;
  key?: { id: string; token: string; createdAt: number };
}

interface AuditEnvelope {
  rows: Array<{
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  }>;
  total: number;
}

describe('managed ingest-key endpoints (Task 117.62)', () => {
  let ctx: Awaited<ReturnType<typeof openServer>>;

  beforeEach(async () => {
    ctx = await openServer();
  });
  afterEach(async () => {
    await ctx.close();
  });

  test('GET /api/keys is empty + non-enforcing before any key is created', async () => {
    const res = await fetch(`${ctx.url}/api/keys`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as KeysEnvelope;
    expect(body.keys).toEqual([]);
    expect(body.enforcing).toBe(false);
  });

  test('POST /api/keys issues a key (raw token once), lists it, and writes an audit row', async () => {
    const res = await fetch(`${ctx.url}/api/keys`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'ios-prod' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as KeysEnvelope;
    expect(body.key?.token).toBeTruthy();
    expect(body.key?.id).toMatch(/^key_/);
    expect(body.enforcing).toBe(true);
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0]?.status).toBe('active');
    expect(body.keys[0]?.label).toBe('ios-prod');

    // Listing never re-exposes the raw token or any hash.
    const list = (await (await fetch(`${ctx.url}/api/keys`)).json()) as KeysEnvelope;
    expect(JSON.stringify(list)).not.toContain(body.key!.token);
    expect(JSON.stringify(list)).not.toMatch(/hash/);

    // Audit row recorded — config-change against ingest-key, token absent.
    const audit = (await (
      await fetch(`${ctx.url}/api/audit?action=config-change`)
    ).json()) as AuditEnvelope;
    const row = audit.rows.find((r) => r.targetType === 'ingest-key');
    expect(row).toBeDefined();
    expect(row?.targetId).toBe(body.key!.id);
    expect(row?.metadata).toMatchObject({ created: true, label: 'ios-prod' });
    expect(JSON.stringify(audit)).not.toContain(body.key!.token);
  });

  test('POST /api/keys/rotate mints a new key, retires the old into grace, and audits', async () => {
    // Seed one key.
    const first = (await (
      await fetch(`${ctx.url}/api/keys`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
    ).json()) as KeysEnvelope;

    const rotated = (await (
      await fetch(`${ctx.url}/api/keys/rotate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
    ).json()) as KeysEnvelope;

    expect(rotated.key?.token).toBeTruthy();
    expect(rotated.key?.token).not.toBe(first.key?.token);

    // One active (the new) + one grace (the old).
    const statuses = rotated.keys.map((k) => k.status).sort();
    expect(statuses).toEqual(['active', 'grace']);

    // Audit row for rotation records retiredCount + graceMs (no token).
    const audit = (await (
      await fetch(`${ctx.url}/api/audit?action=config-change`)
    ).json()) as AuditEnvelope;
    const rotateRow = audit.rows.find(
      (r) => r.targetType === 'ingest-key' && r.metadata?.rotated === true,
    );
    expect(rotateRow).toBeDefined();
    expect(rotateRow?.metadata).toMatchObject({ rotated: true, retiredCount: 1 });
  });

  test('POST /api/keys/:id/revoke kills the key, removes it from listings, and audits', async () => {
    const created = (await (
      await fetch(`${ctx.url}/api/keys`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
    ).json()) as KeysEnvelope;
    const id = created.key!.id;

    const revokeRes = await fetch(`${ctx.url}/api/keys/${encodeURIComponent(id)}/revoke`, {
      method: 'POST',
    });
    expect(revokeRes.status).toBe(200);
    const body = (await revokeRes.json()) as KeysEnvelope & { ok: boolean };
    expect(body.ok).toBe(true);
    const revoked = body.keys.find((k) => k.id === id);
    expect(revoked?.status).toBe('revoked');

    // Audit row for revocation.
    const audit = (await (
      await fetch(`${ctx.url}/api/audit?action=config-change`)
    ).json()) as AuditEnvelope;
    const revokeRow = audit.rows.find(
      (r) => r.targetType === 'ingest-key' && r.metadata?.revoked === true,
    );
    expect(revokeRow).toBeDefined();
    expect(revokeRow?.targetId).toBe(id);
  });

  test('revoke of an unknown id returns 404 and writes no audit row', async () => {
    const res = await fetch(`${ctx.url}/api/keys/key_nope/revoke`, { method: 'POST' });
    expect(res.status).toBe(404);
    const audit = (await (
      await fetch(`${ctx.url}/api/audit?action=config-change`)
    ).json()) as AuditEnvelope;
    expect(audit.rows.some((r) => r.targetType === 'ingest-key')).toBe(false);
  });
});

// ── Ingest authorization integration (real WS through createDashboardServer)

function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
}

function awaitHttpReject(ws: WebSocket): Promise<number> {
  return new Promise((resolve, reject) => {
    ws.once('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
    ws.once('open', () => reject(new Error('expected reject, got open')));
    ws.once('error', () => {
      /* ignore — unexpected-response already resolved */
    });
  });
}

async function openWsServer(): Promise<{
  store: DashboardStore;
  port: number;
  url: string;
  close: () => Promise<void>;
}> {
  const store = new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true });
  const handle = createDashboardServer({
    host: '127.0.0.1',
    port: 0,
    store,
    enableWebsocket: true,
    publicDir: '/tmp/erne-monitor-nonexistent',
  });
  await new Promise<void>((resolve) => handle.server.listen(0, '127.0.0.1', () => resolve()));
  const address = handle.server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return {
    store,
    port,
    url: `http://127.0.0.1:${port}`,
    close: () => handle.close(),
  };
}

describe('ingest authorization wired to the managed key set (Task 117.62)', () => {
  let ctx: Awaited<ReturnType<typeof openWsServer>>;

  beforeEach(async () => {
    ctx = await openWsServer();
  });
  afterEach(async () => {
    await ctx.close();
  });

  test('no managed keys → ingest is ungated (existing SDK behaviour preserved)', async () => {
    const sdk = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}`);
    await waitOpen(sdk);
    sdk.close();
  });

  test('after a key is created, ingest WITHOUT a token is rejected with 401', async () => {
    await fetch(`${ctx.url}/api/keys`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const sdk = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}`);
    const status = await awaitHttpReject(sdk);
    expect(status).toBe(401);
  });

  test('a valid created token connects via query param and via Bearer header', async () => {
    const created = (await (
      await fetch(`${ctx.url}/api/keys`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
    ).json()) as KeysEnvelope;
    const token = created.key!.token;

    const byQuery = new WebSocket(
      `ws://127.0.0.1:${ctx.port}${INGEST_PATH}?apiKey=${encodeURIComponent(token)}`,
    );
    await waitOpen(byQuery);
    byQuery.close();

    const byHeader = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    await waitOpen(byHeader);
    byHeader.close();
  });

  test('rotate → the new token connects and the old token still connects during grace', async () => {
    const first = (await (
      await fetch(`${ctx.url}/api/keys`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
    ).json()) as KeysEnvelope;
    const oldToken = first.key!.token;

    const rotated = (await (
      await fetch(`${ctx.url}/api/keys/rotate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Large grace so the old token is comfortably valid during the test.
        body: JSON.stringify({ graceMs: 3_600_000 }),
      })
    ).json()) as KeysEnvelope;
    const newToken = rotated.key!.token;

    const withNew = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}?apiKey=${newToken}`);
    await waitOpen(withNew);
    withNew.close();

    const withOld = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}?apiKey=${oldToken}`);
    await waitOpen(withOld);
    withOld.close();
  });

  test('revoke → the revoked token is rejected with 401 immediately', async () => {
    const created = (await (
      await fetch(`${ctx.url}/api/keys`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
    ).json()) as KeysEnvelope;
    const token = created.key!.token;
    const id = created.key!.id;

    // Valid before revocation.
    const before = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}?apiKey=${token}`);
    await waitOpen(before);
    before.close();

    await fetch(`${ctx.url}/api/keys/${encodeURIComponent(id)}/revoke`, { method: 'POST' });

    const after = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}?apiKey=${token}`);
    const status = await awaitHttpReject(after);
    expect(status).toBe(401);
  });

  test('legacy ws_auth_token is accepted as a valid ingest token while managed keys enforce', async () => {
    // Set the legacy token directly, then enforce via a managed key.
    ctx.store.setSetting('ws_auth_token', 'legacy-raw-token-123');
    await fetch(`${ctx.url}/api/keys`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    const legacy = new WebSocket(
      `ws://127.0.0.1:${ctx.port}${INGEST_PATH}?ws_auth_token=legacy-raw-token-123`,
    );
    await waitOpen(legacy);
    legacy.close();
  });
});
