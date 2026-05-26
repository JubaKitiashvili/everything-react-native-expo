import {
  RemoteConfigClient,
  deriveConfigUrl,
  DEFAULT_POLL_INTERVAL_MS,
  type RemoteConfigTimer,
} from './RemoteConfigClient';
import { DEFAULT_REMOTE_CONFIG, type RemoteConfig } from './RemoteConfig';

// ── helpers ─────────────────────────────────────────────────────────

/** A minimal fetch Response stub. */
function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** A controllable fake timer — `tick()` runs the registered interval. */
function makeFakeTimer(): RemoteConfigTimer & { tick: () => void; cleared: boolean } {
  let handler: (() => void) | null = null;
  return {
    setInterval(h: () => void) {
      handler = h;
      return 1;
    },
    clearInterval() {
      handler = null;
      this.cleared = true;
    },
    tick() {
      handler?.();
    },
    cleared: false,
  };
}

// ── deriveConfigUrl ─────────────────────────────────────────────────

describe('deriveConfigUrl', () => {
  it('normalises ws/wss schemes to http/https', () => {
    expect(deriveConfigUrl('ws://localhost:9999/runtime')).toBe(
      'http://localhost:9999/v1/config',
    );
    expect(deriveConfigUrl('wss://example.com/x')).toBe(
      'https://example.com/v1/config',
    );
  });

  it('preserves http/https origins and strips the path', () => {
    expect(deriveConfigUrl('http://1.2.3.4:8080/ignored?q=1')).toBe(
      'http://1.2.3.4:8080/v1/config',
    );
    expect(deriveConfigUrl('https://host')).toBe('https://host/v1/config');
  });

  it('falls back for non-URL bases', () => {
    expect(deriveConfigUrl('localhost:1234')).toBe('http://localhost:1234/v1/config');
  });
});

// ── RemoteConfigClient ──────────────────────────────────────────────

describe('RemoteConfigClient', () => {
  const url = 'http://localhost:9999/v1/config';

  it('starts with default config before any fetch', () => {
    const client = new RemoteConfigClient({ url, fetchImpl: jest.fn() });
    expect(client.getConfig()).toBe(DEFAULT_REMOTE_CONFIG);
  });

  it('fetches and applies the server { config } envelope', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({
        config: { sampling: { network: 0.5 }, piiRules: ['email'], featureFlags: {}, updatedAt: 10 },
      }),
    );
    const client = new RemoteConfigClient({ url, fetchImpl });
    const cfg = await client.fetchNow();
    expect(fetchImpl).toHaveBeenCalledWith(url, { method: 'GET' });
    expect(cfg.sampling).toEqual({ network: 0.5 });
    expect(cfg.piiRules).toEqual(['email']);
    expect(client.getConfig()).toBe(cfg);
  });

  it('accepts a bare config object (no envelope) for forward-compat', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ sampling: { x: 0.2 }, piiRules: [], featureFlags: {}, updatedAt: 0 }),
    );
    const client = new RemoteConfigClient({ url, fetchImpl });
    const cfg = await client.fetchNow();
    expect(cfg.sampling).toEqual({ x: 0.2 });
  });

  it('fires onChange immediately, then only on real changes', async () => {
    const responses = [
      jsonResponse({ config: { sampling: { a: 0.5 }, piiRules: [], featureFlags: {}, updatedAt: 1 } }),
      // same effective config, different updatedAt → NO change
      jsonResponse({ config: { sampling: { a: 0.5 }, piiRules: [], featureFlags: {}, updatedAt: 2 } }),
      // changed sampling → change
      jsonResponse({ config: { sampling: { a: 0.9 }, piiRules: [], featureFlags: {}, updatedAt: 3 } }),
    ];
    let call = 0;
    const fetchImpl = jest.fn(async () => responses[call++] ?? jsonResponse({ config: {} }));
    const client = new RemoteConfigClient({ url, fetchImpl });

    const seen: RemoteConfig[] = [];
    client.onChange((c) => seen.push(c));
    expect(seen).toHaveLength(1); // immediate default
    expect(seen[0]).toBe(DEFAULT_REMOTE_CONFIG);

    await client.fetchNow(); // a:0.5 → change
    await client.fetchNow(); // same effective → no change
    await client.fetchNow(); // a:0.9 → change

    expect(seen).toHaveLength(3);
    expect(seen[1]!.sampling).toEqual({ a: 0.5 });
    expect(seen[2]!.sampling).toEqual({ a: 0.9 });
  });

  it('survives a network rejection — keeps last-good config', async () => {
    const onError = jest.fn();
    let call = 0;
    const fetchImpl = jest.fn(async () => {
      if (call++ === 0) {
        return jsonResponse({ config: { sampling: { a: 0.4 }, piiRules: [], featureFlags: {}, updatedAt: 1 } });
      }
      throw new Error('network down');
    });
    const client = new RemoteConfigClient({ url, fetchImpl, onError });
    await client.fetchNow(); // good
    expect(client.getConfig().sampling).toEqual({ a: 0.4 });
    const cfg = await client.fetchNow(); // throws → kept
    expect(cfg.sampling).toEqual({ a: 0.4 });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('survives a non-ok HTTP status', async () => {
    const onError = jest.fn();
    const fetchImpl = jest.fn(async () => jsonResponse({}, false, 503));
    const client = new RemoteConfigClient({ url, fetchImpl, onError });
    const cfg = await client.fetchNow();
    expect(cfg).toBe(DEFAULT_REMOTE_CONFIG);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('survives a malformed JSON body — keeps defaults', async () => {
    const onError = jest.fn();
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    }) as unknown as Response);
    const client = new RemoteConfigClient({ url, fetchImpl, onError });
    const cfg = await client.fetchNow();
    expect(cfg).toBe(DEFAULT_REMOTE_CONFIG);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('coerces a malformed-but-parseable body via validate (no throw)', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ config: { sampling: 'not-an-object', piiRules: ['email'] } }),
    );
    const client = new RemoteConfigClient({ url, fetchImpl });
    const cfg = await client.fetchNow();
    expect(cfg.sampling).toEqual({}); // dropped
    expect(cfg.piiRules).toEqual(['email']); // kept
  });

  it('polls on the injected timer and stops cleanly', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ config: { sampling: {}, piiRules: [], featureFlags: {}, updatedAt: 0 } }),
    );
    const timer = makeFakeTimer();
    const client = new RemoteConfigClient({ url, fetchImpl, timer, intervalMs: 1000 });

    client.start();
    expect(client.isRunning()).toBe(true);
    // start() fires one immediate fetch
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    timer.tick();
    timer.tick();
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    client.stop();
    expect(client.isRunning()).toBe(false);
    expect(timer.cleared).toBe(true);
    timer.tick(); // no-op after stop
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('start() is idempotent', () => {
    const timer = makeFakeTimer();
    const setSpy = jest.spyOn(timer, 'setInterval');
    const client = new RemoteConfigClient({ url, fetchImpl: jest.fn(async () => jsonResponse({})), timer });
    client.start();
    client.start();
    expect(setSpy).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when no endpoint resolves', async () => {
    const fetchImpl = jest.fn();
    const client = new RemoteConfigClient({ fetchImpl });
    const cfg = await client.fetchNow();
    expect(cfg).toBe(DEFAULT_REMOTE_CONFIG);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('derives the endpoint from baseUrl (ws → http)', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ config: { sampling: { z: 0.1 } } }));
    const client = new RemoteConfigClient({ baseUrl: 'ws://localhost:7777/runtime', fetchImpl });
    await client.fetchNow();
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:7777/v1/config', { method: 'GET' });
  });

  it('uses the default 5-minute interval when unset', () => {
    expect(DEFAULT_POLL_INTERVAL_MS).toBe(5 * 60_000);
  });
});
