import {
  createMonitorRuntime,
  startMonitorRuntime,
  type MonitorRuntimeDeps,
} from './createMonitorRuntime';
import { MonitorClient } from './MonitorClient';
import { MemoryEventStoreBackend } from '../storage/EventStore';
import type { RemoteConfigTimer } from '../remote-config/RemoteConfigClient';

// A controllable timer so the runtime's poller never schedules real intervals.
function makeFakeTimer(): RemoteConfigTimer {
  return {
    setInterval: () => 1,
    clearInterval: () => undefined,
  };
}

function jsonResponse(config: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ config }),
  } as unknown as Response;
}

async function bootWithRemoteConfig(
  config: unknown,
  random: () => number,
): Promise<{
  runtime: Awaited<ReturnType<typeof createMonitorRuntime>>;
  fetchImpl: jest.Mock;
}> {
  MonitorClient.__resetForTesting();
  const fetchImpl = jest.fn(async () => jsonResponse(config));
  const deps: MonitorRuntimeDeps = {
    isDev: true,
    errorUtils: null,
    rejectionTracker: null,
    navigationAdapter: null,
    networkTarget: {},
    eventStoreBackend: new MemoryEventStoreBackend(),
    initialConsent: { crashes: true, analytics: true, replay: true },
    console: { log: () => {}, warn: () => {}, error: () => {} },
    remoteConfig: {
      enabled: true,
      url: 'http://localhost:9999/v1/config',
      fetchImpl,
      timer: makeFakeTimer(),
      random,
    },
  };
  const runtime = await createMonitorRuntime({}, deps);
  return { runtime, fetchImpl };
}

/** Count enriched (pipeline) copies of a custom event by name in the store. */
async function pipelineCustomNames(
  runtime: Awaited<ReturnType<typeof createMonitorRuntime>>,
): Promise<string[]> {
  const drained = await runtime.store.drainAll(100);
  return drained
    .filter(
      (e) =>
        e.type === 'custom' &&
        (e as unknown as { context?: unknown }).context !== undefined,
    )
    .map((e) => (e.data as { name?: string }).name ?? '');
}

describe('createMonitorRuntime — remote config (Task 117.55)', () => {
  afterEach(() => {
    MonitorClient.__resetForTesting();
  });

  it('is OFF by default — no client, no behaviour change', async () => {
    MonitorClient.__resetForTesting();
    const runtime = await createMonitorRuntime(
      {},
      {
        isDev: true,
        errorUtils: null,
        rejectionTracker: null,
        navigationAdapter: null,
        networkTarget: {},
        eventStoreBackend: new MemoryEventStoreBackend(),
        initialConsent: { crashes: true, analytics: true, replay: true },
      },
    );
    expect(runtime.remoteConfigClient).toBeNull();
    await runtime.shutdown();
  });

  it('constructs the client when enabled', async () => {
    const { runtime } = await bootWithRemoteConfig(
      { sampling: {}, piiRules: [], featureFlags: {}, updatedAt: 0 },
      () => 0.5,
    );
    expect(runtime.remoteConfigClient).not.toBeNull();
    await runtime.shutdown();
  });

  it('applies fetched sampling — rate 0 drops a type end-to-end', async () => {
    // custom rate 0 → every trackEvent dropped before the store.
    const { runtime } = await bootWithRemoteConfig(
      { sampling: { custom: 0 }, piiRules: [], featureFlags: {}, updatedAt: 1 },
      () => 0.5,
    );
    startMonitorRuntime(runtime);
    // Deterministically apply the fetched config before emitting.
    await runtime.remoteConfigClient!.fetchNow();
    expect(runtime.remoteConfigClient!.getConfig().sampling).toEqual({ custom: 0 });

    runtime.trackEvent('should_drop', { x: 1 });
    await Promise.resolve();
    await Promise.resolve();

    expect(await pipelineCustomNames(runtime)).toHaveLength(0);
    await runtime.shutdown();
  });

  it('rate 1 always keeps; rate 0.5 splits via injected RNG', async () => {
    // Alternating RNG: keep, drop, keep, drop...
    const seq = [0.2, 0.8, 0.2, 0.8];
    let i = 0;
    const { runtime } = await bootWithRemoteConfig(
      { sampling: { custom: 0.5 }, piiRules: [], featureFlags: {}, updatedAt: 1 },
      () => seq[i++] ?? 1,
    );
    startMonitorRuntime(runtime);
    await runtime.remoteConfigClient!.fetchNow();

    runtime.trackEvent('e1', {}); // 0.2 < 0.5 → keep
    runtime.trackEvent('e2', {}); // 0.8 → drop
    runtime.trackEvent('e3', {}); // 0.2 → keep
    runtime.trackEvent('e4', {}); // 0.8 → drop
    await Promise.resolve();
    await Promise.resolve();

    const names = await pipelineCustomNames(runtime);
    expect(names.sort()).toEqual(['e1', 'e3']);
    await runtime.shutdown();
  });

  it('crash events bypass remote sampling even at rate 0', async () => {
    const { runtime } = await bootWithRemoteConfig(
      { sampling: { default: 0, crash: 0 }, piiRules: [], featureFlags: {}, updatedAt: 1 },
      () => 0.99,
    );
    startMonitorRuntime(runtime);
    await runtime.remoteConfigClient!.fetchNow();

    const received: unknown[] = [];
    runtime.bus.on('crash', (e) => received.push(e));
    runtime.collectors.crash['reportException']?.call(
      runtime.collectors.crash,
      new Error('must survive sampling'),
      false,
    );
    await Promise.resolve();
    expect(received.length).toBeGreaterThan(0);
    await runtime.shutdown();
  });

  it('applies piiRules — sensitive keys reach the Sanitizer', async () => {
    const { runtime } = await bootWithRemoteConfig(
      { sampling: {}, piiRules: ['nickname'], featureFlags: {}, updatedAt: 1 },
      () => 0.5,
    );
    startMonitorRuntime(runtime);
    await runtime.remoteConfigClient!.fetchNow();

    runtime.trackEvent('profile', { nickname: 'super-secret', keep: 'visible' });
    await Promise.resolve();
    await Promise.resolve();

    const drained = await runtime.store.drainAll(100);
    const stored = drained.find(
      (e) =>
        e.type === 'custom' &&
        (e.data as { name?: string }).name === 'profile' &&
        (e as unknown as { context?: unknown }).context !== undefined,
    );
    const attrs = (stored?.data as { attributes?: Record<string, unknown> }).attributes;
    expect(attrs?.nickname).toBe('[REDACTED]');
    expect(attrs?.keep).toBe('visible');
    await runtime.shutdown();
  });

  it('applies piiRules — regex patterns reach the Sanitizer', async () => {
    const { runtime } = await bootWithRemoteConfig(
      { sampling: {}, piiRules: ['ORDER-\\d{4}'], featureFlags: {}, updatedAt: 1 },
      () => 0.5,
    );
    startMonitorRuntime(runtime);
    await runtime.remoteConfigClient!.fetchNow();

    runtime.trackEvent('order', { note: 'ref ORDER-1234 shipped' });
    await Promise.resolve();
    await Promise.resolve();

    const drained = await runtime.store.drainAll(100);
    const stored = drained.find(
      (e) =>
        e.type === 'custom' &&
        (e.data as { name?: string }).name === 'order' &&
        (e as unknown as { context?: unknown }).context !== undefined,
    );
    const note = (
      (stored?.data as { attributes?: Record<string, unknown> }).attributes ?? {}
    ).note as string;
    expect(note).toContain('[REDACTED]');
    expect(note).not.toContain('ORDER-1234');
    await runtime.shutdown();
  });

  it('applies featureFlags — disables a collector', async () => {
    const { runtime } = await bootWithRemoteConfig(
      { sampling: {}, piiRules: [], featureFlags: { network: false }, updatedAt: 1 },
      () => 0.5,
    );
    startMonitorRuntime(runtime);
    expect(runtime.collectors.network.isRunning()).toBe(true);
    await runtime.remoteConfigClient!.fetchNow();
    expect(runtime.collectors.network.isRunning()).toBe(false);
    await runtime.shutdown();
  });

  it('ignores unknown feature flags without crashing', async () => {
    const { runtime } = await bootWithRemoteConfig(
      { sampling: {}, piiRules: [], featureFlags: { totallyUnknownFlag: true }, updatedAt: 1 },
      () => 0.5,
    );
    startMonitorRuntime(runtime);
    await expect(runtime.remoteConfigClient!.fetchNow()).resolves.toBeDefined();
    await runtime.shutdown();
  });

  it('survives a failing fetch — keeps emitting normally', async () => {
    MonitorClient.__resetForTesting();
    const onError = jest.fn();
    const fetchImpl = jest.fn(async () => {
      throw new Error('config server down');
    });
    const runtime = await createMonitorRuntime(
      {},
      {
        isDev: true,
        errorUtils: null,
        rejectionTracker: null,
        navigationAdapter: null,
        networkTarget: {},
        eventStoreBackend: new MemoryEventStoreBackend(),
        initialConsent: { crashes: true, analytics: true, replay: true },
        console: { log: () => {}, warn: () => {}, error: () => {} },
        remoteConfig: {
          enabled: true,
          url: 'http://localhost:9999/v1/config',
          fetchImpl,
          timer: makeFakeTimer(),
          onError,
        },
      },
    );
    startMonitorRuntime(runtime);
    await runtime.remoteConfigClient!.fetchNow();
    expect(onError).toHaveBeenCalled();

    // Empty/default config → sample everything; the event flows through.
    runtime.trackEvent('still_works', {});
    await Promise.resolve();
    await Promise.resolve();
    expect(await pipelineCustomNames(runtime)).toContain('still_works');
    await runtime.shutdown();
  });

  it('derives the endpoint from dashboardUrl when no url given', async () => {
    MonitorClient.__resetForTesting();
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ sampling: { custom: 0 }, piiRules: [], featureFlags: {}, updatedAt: 1 }),
    );
    const runtime = await createMonitorRuntime(
      {},
      {
        isDev: true,
        errorUtils: null,
        rejectionTracker: null,
        navigationAdapter: null,
        networkTarget: {},
        eventStoreBackend: new MemoryEventStoreBackend(),
        initialConsent: { crashes: true, analytics: true, replay: true },
        dashboardUrl: 'ws://localhost:8888/runtime',
        webSocketCtor: null,
        remoteConfig: {
          enabled: true,
          fetchImpl,
          timer: makeFakeTimer(),
          random: () => 0.5,
        },
      },
    );
    await runtime.remoteConfigClient!.fetchNow();
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:8888/v1/config', {
      method: 'GET',
    });
    await runtime.shutdown();
  });
});
