import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createDashboardServer, type DashboardServerHandle } from './server.js';
import { DashboardStore } from './storage/sqliteStore.js';

async function openServer(
  auth?: { jwtSecret: string },
): Promise<DashboardServerHandle & { url: string }> {
  const store = new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true });
  const handle = createDashboardServer({
    host: '127.0.0.1',
    port: 0,
    store,
    enableWebsocket: false,
    publicDir: '/tmp/erne-monitor-nonexistent',
    ...(auth ? { auth } : {}),
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

describe('bidirectional bug reports (Task 117.20)', () => {
  let ctx: Awaited<ReturnType<typeof openServer>>;
  beforeEach(async () => {
    ctx = await openServer();
  });
  afterEach(async () => {
    await ctx.close();
  });

  test('full round-trip: SDK creates → operator replies → SDK polls → reporter replies → operator sees thread', async () => {
    // SDK creates a report (ingest path, no keys configured → open).
    const create = await req(ctx.url, 'POST', '/v1/bug-reports', {
      body: { sessionId: 'sess-1', title: 'Crash on save', description: 'taps save → white screen' },
    });
    expect(create.status).toBe(201);
    const reportId = (create.json.report as { id: string }).id;

    // Operator replies (dormant RBAC → synthetic Owner satisfies Member gate).
    const opReply = await req(ctx.url, 'POST', `/api/bug-reports/${reportId}/replies`, {
      body: { body: 'Thanks — can you share your OS version?' },
    });
    expect(opReply.status).toBe(201);
    expect((opReply.json.reply as { authorRole: string }).authorRole).toBe('operator');

    // SDK polls operator replies for the session.
    const poll = await req(ctx.url, 'GET', '/v1/bug-reports/replies?sessionId=sess-1');
    expect(poll.status).toBe(200);
    const polled = poll.json.replies as Array<{ body: string; authorRole: string }>;
    expect(polled).toHaveLength(1);
    expect(polled[0]?.body).toContain('OS version');
    expect(polled[0]?.authorRole).toBe('operator');

    // Reporter (app user) replies back via the SDK.
    const reporterReply = await req(ctx.url, 'POST', `/v1/bug-reports/${reportId}/replies`, {
      body: { body: 'iOS 18.2' },
    });
    expect(reporterReply.status).toBe(201);

    // Operator sees the full thread (both authors, oldest first).
    const thread = await req(ctx.url, 'GET', `/api/bug-reports/${reportId}/replies`);
    expect(thread.status).toBe(200);
    const replies = thread.json.replies as Array<{ authorRole: string; body: string }>;
    expect(replies.map((r) => r.authorRole)).toEqual(['operator', 'reporter']);
    expect(replies[1]?.body).toBe('iOS 18.2');
  });

  test('SDK polling honours ?since (only newer operator replies)', async () => {
    const reportId = (
      await req(ctx.url, 'POST', '/v1/bug-reports', { body: { sessionId: 'sess-2' } })
    ).json.report as { id: string };
    await req(ctx.url, 'POST', `/api/bug-reports/${reportId.id}/replies`, { body: { body: 'first' } });
    // since=now+1 → nothing newer.
    const future = Date.now() + 60_000;
    const poll = await req(ctx.url, 'GET', `/v1/bug-reports/replies?sessionId=sess-2&since=${future}`);
    expect((poll.json.replies as unknown[]).length).toBe(0);
  });

  test('operator reply to an unknown report 404s', async () => {
    const r = await req(ctx.url, 'POST', '/api/bug-reports/nope/replies', { body: { body: 'hi' } });
    expect(r.status).toBe(404);
  });

  test('empty/blank reply body is rejected', async () => {
    const reportId = (
      await req(ctx.url, 'POST', '/v1/bug-reports', { body: { sessionId: 'sess-3' } })
    ).json.report as { id: string };
    const r = await req(ctx.url, 'POST', `/api/bug-reports/${reportId.id}/replies`, {
      body: { body: '   ' },
    });
    expect(r.status).toBe(400);
  });

  test('create requires a sessionId', async () => {
    const r = await req(ctx.url, 'POST', '/v1/bug-reports', { body: { title: 'no session' } });
    expect(r.status).toBe(400);
  });

  describe('RBAC enforcement', () => {
    let authCtx: Awaited<ReturnType<typeof openServer>>;
    beforeEach(async () => {
      authCtx = await openServer({ jwtSecret: 'bug-report-test' });
      await req(authCtx.url, 'POST', '/api/auth/register', {
        body: { email: 'owner@acme.io', password: 'ownerpass1' },
      });
    });
    afterEach(async () => {
      await authCtx.close();
    });

    test('a Viewer cannot post an operator reply (403); reads are allowed', async () => {
      const ownerToken = (
        await req(authCtx.url, 'POST', '/api/auth/login', {
          body: { email: 'owner@acme.io', password: 'ownerpass1' },
        })
      ).json.token as string;
      await req(authCtx.url, 'POST', '/api/auth/register', {
        token: ownerToken,
        body: { email: 'viewer@acme.io', password: 'viewerpass1', role: 'viewer' },
      });
      const viewerToken = (
        await req(authCtx.url, 'POST', '/api/auth/login', {
          body: { email: 'viewer@acme.io', password: 'viewerpass1' },
        })
      ).json.token as string;

      // Seed a report via the ingest path (no operator key needed).
      const reportId = (
        await req(authCtx.url, 'POST', '/v1/bug-reports', { body: { sessionId: 'sess-x' } })
      ).json.report as { id: string };

      // Viewer can read the (empty) thread…
      expect(
        (await req(authCtx.url, 'GET', `/api/bug-reports/${reportId.id}/replies`, { token: viewerToken }))
          .status,
      ).toBe(200);
      // …but cannot post a reply.
      const post = await req(authCtx.url, 'POST', `/api/bug-reports/${reportId.id}/replies`, {
        token: viewerToken,
        body: { body: 'I should not be allowed' },
      });
      expect(post.status).toBe(403);
    });
  });
});
