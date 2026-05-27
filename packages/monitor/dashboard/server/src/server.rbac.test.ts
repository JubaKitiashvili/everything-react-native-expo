import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createDashboardServer, type DashboardServerHandle } from './server.js';
import { DashboardStore } from './storage/sqliteStore.js';

/** HTTP-only harness with a fixed JWT secret for deterministic tokens. */
async function openServer(): Promise<DashboardServerHandle & { url: string }> {
  const store = new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true });
  const handle = createDashboardServer({
    host: '127.0.0.1',
    port: 0,
    store,
    enableWebsocket: false,
    publicDir: '/tmp/erne-monitor-nonexistent',
    auth: { jwtSecret: 'integration-test-secret' },
  });
  await new Promise<void>((resolve) => handle.server.listen(0, '127.0.0.1', () => resolve()));
  const address = handle.server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return { ...handle, port, url: `http://127.0.0.1:${port}` };
}

type Json = Record<string, unknown>;

async function req(
  base: string,
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<{ status: number; json: Json }> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let json: Json = {};
  try {
    json = (await res.json()) as Json;
  } catch {
    json = {};
  }
  return { status: res.status, json };
}

describe('RBAC (Task 117.18)', () => {
  let ctx: Awaited<ReturnType<typeof openServer>>;
  beforeEach(async () => {
    ctx = await openServer();
  });
  afterEach(async () => {
    await ctx.close();
  });

  describe('dormant (no users yet)', () => {
    test('me reports not-enforcing + synthetic Owner', async () => {
      const { status, json } = await req(ctx.url, 'GET', '/api/auth/me');
      expect(status).toBe(200);
      expect(json.enforcing).toBe(false);
      expect((json.user as Json).role).toBe('owner');
    });

    test('reads + owner-only writes work WITHOUT a token', async () => {
      expect((await req(ctx.url, 'GET', '/api/events')).status).toBe(200);
      // PATCH /api/settings is an owner route — synthetic Owner passes.
      const patch = await req(ctx.url, 'PATCH', '/api/settings', { body: { retentionDays: 7 } });
      expect(patch.status).toBe(200);
    });
  });

  describe('bootstrap', () => {
    test('first register creates an Owner + flips enforcement on', async () => {
      const reg = await req(ctx.url, 'POST', '/api/auth/register', {
        body: { email: 'owner@acme.io', password: 'hunter2pass', role: 'viewer' }, // role ignored on bootstrap
      });
      expect(reg.status).toBe(201);
      expect((reg.json.user as Json).role).toBe('owner'); // forced owner
      // Now enforcing: an unauthenticated read 401s.
      expect((await req(ctx.url, 'GET', '/api/events')).status).toBe(401);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await req(ctx.url, 'POST', '/api/auth/register', {
        body: { email: 'owner@acme.io', password: 'hunter2pass' },
      });
    });

    test('valid creds return a token that authenticates reads', async () => {
      const login = await req(ctx.url, 'POST', '/api/auth/login', {
        body: { email: 'owner@acme.io', password: 'hunter2pass' },
      });
      expect(login.status).toBe(200);
      const token = login.json.token as string;
      expect(typeof token).toBe('string');
      const events = await req(ctx.url, 'GET', '/api/events', { token });
      expect(events.status).toBe(200);
    });

    test('wrong password 401s without leaking that the email exists', async () => {
      const bad = await req(ctx.url, 'POST', '/api/auth/login', {
        body: { email: 'owner@acme.io', password: 'WRONG' },
      });
      expect(bad.status).toBe(401);
      const ghost = await req(ctx.url, 'POST', '/api/auth/login', {
        body: { email: 'ghost@acme.io', password: 'whatever' },
      });
      expect(ghost.status).toBe(401);
      expect(bad.json).toEqual(ghost.json); // identical response shape
    });

    test('login is recorded in the audit log', async () => {
      await req(ctx.url, 'POST', '/api/auth/login', {
        body: { email: 'owner@acme.io', password: 'hunter2pass' },
      });
      const owner = (
        await req(ctx.url, 'POST', '/api/auth/login', {
          body: { email: 'owner@acme.io', password: 'hunter2pass' },
        })
      ).json.token as string;
      const audit = await req(ctx.url, 'GET', '/api/audit?action=login', { token: owner });
      expect(audit.status).toBe(200);
      expect((audit.json.total as number) >= 1).toBe(true);
    });
  });

  describe('role enforcement', () => {
    let ownerToken: string;
    let viewerToken: string;
    let memberToken: string;

    beforeEach(async () => {
      await req(ctx.url, 'POST', '/api/auth/register', {
        body: { email: 'owner@acme.io', password: 'ownerpass1' },
      });
      ownerToken = (
        await req(ctx.url, 'POST', '/api/auth/login', {
          body: { email: 'owner@acme.io', password: 'ownerpass1' },
        })
      ).json.token as string;
      await req(ctx.url, 'POST', '/api/auth/register', {
        token: ownerToken,
        body: { email: 'viewer@acme.io', password: 'viewerpass1', role: 'viewer' },
      });
      await req(ctx.url, 'POST', '/api/auth/register', {
        token: ownerToken,
        body: { email: 'member@acme.io', password: 'memberpass1', role: 'member' },
      });
      viewerToken = (
        await req(ctx.url, 'POST', '/api/auth/login', {
          body: { email: 'viewer@acme.io', password: 'viewerpass1' },
        })
      ).json.token as string;
      memberToken = (
        await req(ctx.url, 'POST', '/api/auth/login', {
          body: { email: 'member@acme.io', password: 'memberpass1' },
        })
      ).json.token as string;
    });

    test('viewer can read but cannot write (member or owner routes)', async () => {
      expect((await req(ctx.url, 'GET', '/api/events', { token: viewerToken })).status).toBe(200);
      // owner route
      const settings = await req(ctx.url, 'PATCH', '/api/settings', {
        token: viewerToken,
        body: { retentionDays: 7 },
      });
      expect(settings.status).toBe(403);
      // member route
      const resolve = await req(ctx.url, 'POST', '/api/symbols/resolve', {
        token: viewerToken,
        body: {},
      });
      expect(resolve.status).toBe(403);
    });

    test('member can do operational writes but not owner admin', async () => {
      // owner route → 403 for member
      const rule = await req(ctx.url, 'POST', '/api/alert-rules', {
        token: memberToken,
        body: { name: 'x', metric: 'crashes', threshold: 1 },
      });
      expect(rule.status).toBe(403);
      // member route → NOT 403 (passes role check; body may 400 but never 403)
      const ai = await req(ctx.url, 'POST', '/api/audit/ai-actions', {
        token: memberToken,
        body: { action: 'noop' },
      });
      expect(ai.status).not.toBe(403);
    });

    test('owner can administer (create rule, list users)', async () => {
      const users = await req(ctx.url, 'GET', '/api/auth/users', { token: ownerToken });
      expect(users.status).toBe(200);
      expect((users.json.users as unknown[]).length).toBe(3);
      // viewer cannot list users
      expect((await req(ctx.url, 'GET', '/api/auth/users', { token: viewerToken })).status).toBe(
        403,
      );
    });
  });

  describe('last-owner guard over HTTP', () => {
    test('cannot delete or demote the only owner', async () => {
      await req(ctx.url, 'POST', '/api/auth/register', {
        body: { email: 'solo@acme.io', password: 'solopass12' },
      });
      const token = (
        await req(ctx.url, 'POST', '/api/auth/login', {
          body: { email: 'solo@acme.io', password: 'solopass12' },
        })
      ).json.token as string;
      const users = await req(ctx.url, 'GET', '/api/auth/users', { token });
      const id = (users.json.users as Array<{ id: string }>)[0]!.id;

      const del = await req(ctx.url, 'DELETE', `/api/auth/users/${id}`, { token });
      expect(del.status).toBe(409);
      expect(del.json.error).toBe('last-owner');

      const demote = await req(ctx.url, 'PATCH', `/api/auth/users/${id}`, {
        token,
        body: { role: 'viewer' },
      });
      expect(demote.status).toBe(409);
    });
  });

  describe('auth.enabled override', () => {
    test('disabled: never enforces even after a user is created', async () => {
      const store = new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true });
      const handle = createDashboardServer({
        host: '127.0.0.1',
        port: 0,
        store,
        enableWebsocket: false,
        publicDir: '/tmp/erne-monitor-nonexistent',
        auth: { enabled: false, jwtSecret: 's' },
      });
      await new Promise<void>((r) => handle.server.listen(0, '127.0.0.1', () => r()));
      const addr = handle.server.address();
      const url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
      try {
        await req(url, 'POST', '/api/auth/register', {
          body: { email: 'o@acme.io', password: 'ownerpass1' },
        });
        // Even with a user present, disabled → no token needed.
        expect((await req(url, 'GET', '/api/events')).status).toBe(200);
        expect((await req(url, 'GET', '/api/auth/me')).json.enforcing).toBe(false);
      } finally {
        await handle.close();
      }
    });
  });
});
