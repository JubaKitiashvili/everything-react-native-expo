import { afterEach, describe, expect, test, vi } from 'vitest';
import { createDashboardServer, type DashboardServerHandle } from './server.js';
import { DashboardStore } from './storage/sqliteStore.js';
import type { AiProvider } from './ai/provider.js';

async function openServer(
  opts: { provider?: AiProvider | null; auth?: { jwtSecret: string } } = {},
): Promise<DashboardServerHandle & { url: string }> {
  const store = new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true });
  const handle = createDashboardServer({
    host: '127.0.0.1',
    port: 0,
    store,
    enableWebsocket: false,
    publicDir: '/tmp/erne-monitor-nonexistent',
    ...(opts.provider !== undefined ? { ai: { provider: opts.provider } } : {}),
    ...(opts.auth ? { auth: opts.auth } : {}),
  });
  await new Promise<void>((r) => handle.server.listen(0, '127.0.0.1', () => r()));
  const addr = handle.server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { ...handle, port, url: `http://127.0.0.1:${port}` };
}

type Json = Record<string, unknown>;
async function post(base: string, path: string, body: unknown, token?: string) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  let json: Json = {};
  try {
    json = (await res.json()) as Json;
  } catch {
    json = {};
  }
  return { status: res.status, json };
}

describe('POST /api/ai/complete (Task 117.9)', () => {
  let ctx: Awaited<ReturnType<typeof openServer>>;
  afterEach(async () => {
    await ctx.close();
  });

  test('501 when no provider is configured', async () => {
    ctx = await openServer({ provider: null });
    const r = await post(ctx.url, '/api/ai/complete', { prompt: 'hi' });
    expect(r.status).toBe(501);
    expect(r.json.error).toBe('ai_not_configured');
  });

  test('200 + text from the configured provider', async () => {
    const provider: AiProvider = { complete: vi.fn(async () => 'A null-pointer crash on login.') };
    ctx = await openServer({ provider });
    const r = await post(ctx.url, '/api/ai/complete', { prompt: 'summarize this crash', maxTokens: 200 });
    expect(r.status).toBe(200);
    expect(r.json.text).toBe('A null-pointer crash on login.');
    expect(provider.complete).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'summarize this crash', maxTokens: 200 }),
    );
  });

  test('400 on an empty prompt', async () => {
    ctx = await openServer({ provider: { complete: vi.fn(async () => 'x') } });
    const r = await post(ctx.url, '/api/ai/complete', { prompt: '   ' });
    expect(r.status).toBe(400);
  });

  test('502 when the provider throws', async () => {
    const provider: AiProvider = {
      complete: vi.fn(async () => {
        throw new Error('rate limited');
      }),
    };
    ctx = await openServer({ provider });
    const r = await post(ctx.url, '/api/ai/complete', { prompt: 'x' });
    expect(r.status).toBe(502);
    expect(r.json.error).toBe('ai_provider_error');
  });

  describe('RBAC', () => {
    test('a Viewer is forbidden (403)', async () => {
      ctx = await openServer({
        provider: { complete: vi.fn(async () => 'x') },
        auth: { jwtSecret: 'ai-test' },
      });
      await post(ctx.url, '/api/auth/register', { email: 'owner@acme.io', password: 'ownerpass1' });
      const ownerToken = (
        await post(ctx.url, '/api/auth/login', { email: 'owner@acme.io', password: 'ownerpass1' })
      ).json.token as string;
      await post(
        ctx.url,
        '/api/auth/register',
        { email: 'viewer@acme.io', password: 'viewerpass1', role: 'viewer' },
        ownerToken,
      );
      const viewerToken = (
        await post(ctx.url, '/api/auth/login', { email: 'viewer@acme.io', password: 'viewerpass1' })
      ).json.token as string;

      const r = await post(ctx.url, '/api/ai/complete', { prompt: 'x' }, viewerToken);
      expect(r.status).toBe(403);
    });
  });
});
