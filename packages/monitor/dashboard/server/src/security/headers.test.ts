// Task 117.66 — security headers unit + integration tests.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { createDashboardServer, type DashboardServerHandle } from '../server.js';
import { DashboardStore } from '../storage/sqliteStore.js';
import {
  DEFAULT_CSP,
  BASE_SECURITY_HEADERS,
  resolveCsp,
} from './headers.js';

describe('security headers module', () => {
  test('DEFAULT_CSP locks down framing, plugins, and base URI while allowing the SPA + WS', () => {
    expect(DEFAULT_CSP).toContain("default-src 'self'");
    expect(DEFAULT_CSP).toContain("frame-ancestors 'none'");
    expect(DEFAULT_CSP).toContain("object-src 'none'");
    expect(DEFAULT_CSP).toContain("base-uri 'self'");
    // The live dashboard feed runs over a WebSocket.
    expect(DEFAULT_CSP).toContain("connect-src 'self' ws: wss:");
  });

  test('BASE_SECURITY_HEADERS carries HSTS, frame-deny, nosniff, referrer-policy', () => {
    expect(BASE_SECURITY_HEADERS['strict-transport-security']).toContain('max-age=31536000');
    expect(BASE_SECURITY_HEADERS['x-frame-options']).toBe('DENY');
    expect(BASE_SECURITY_HEADERS['x-content-type-options']).toBe('nosniff');
    expect(BASE_SECURITY_HEADERS['referrer-policy']).toBe('no-referrer');
  });

  test('resolveCsp: undefined → default, null → null, string → verbatim', () => {
    expect(resolveCsp(undefined)).toBe(DEFAULT_CSP);
    expect(resolveCsp(null)).toBeNull();
    expect(resolveCsp("default-src 'none'")).toBe("default-src 'none'");
  });
});

describe('security headers on responses', () => {
  let publicDir: string;
  let handle: DashboardServerHandle;
  let url: string;

  // Force the server to close each connection so `server.close()` in
  // afterEach returns promptly instead of waiting on undici's keep-alive
  // socket pool (Node global fetch reuses idle sockets by default).
  const NO_KEEPALIVE = { headers: { connection: 'close' } } as const;

  async function start(options: Parameters<typeof createDashboardServer>[0] = {}): Promise<void> {
    publicDir = mkdtempSync(join(tmpdir(), 'erne-sec-'));
    writeFileSync(join(publicDir, 'index.html'), '<!doctype html><title>ERNE</title>');
    writeFileSync(join(publicDir, 'app.js'), 'console.log("hi");');
    handle = createDashboardServer({
      host: '127.0.0.1',
      port: 0,
      store: new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true }),
      enableWebsocket: false,
      publicDir,
      ...options,
    });
    await new Promise<void>((resolve) => handle.server.listen(0, '127.0.0.1', () => resolve()));
    const address = handle.server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    url = `http://127.0.0.1:${port}`;
  }

  afterEach(async () => {
    await handle.close();
    rmSync(publicDir, { recursive: true, force: true });
  });

  test('HTML shell carries the default CSP + base security headers', async () => {
    await start();
    const res = await fetch(`${url}/`, NO_KEEPALIVE);
    await res.text(); // drain the body so the socket releases before close()
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toBe(DEFAULT_CSP);
    expect(res.headers.get('strict-transport-security')).toContain('max-age=31536000');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });

  test('non-HTML static assets get base headers but NOT a CSP', async () => {
    await start();
    const res = await fetch(`${url}/app.js`, NO_KEEPALIVE);
    await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toBeNull();
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  test('JSON API responses get base headers but NOT a CSP', async () => {
    await start();
    const res = await fetch(`${url}/api/health`, NO_KEEPALIVE);
    await res.text();
    expect(res.headers.get('content-security-policy')).toBeNull();
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  test('csp option overrides the policy on the HTML shell', async () => {
    await start({ csp: "default-src 'none'" });
    const res = await fetch(`${url}/`, NO_KEEPALIVE);
    await res.text();
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'");
  });

  test('csp: null omits the CSP header but keeps base headers', async () => {
    await start({ csp: null });
    const res = await fetch(`${url}/`, NO_KEEPALIVE);
    await res.text();
    expect(res.headers.get('content-security-policy')).toBeNull();
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });
});
