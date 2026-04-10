import {
  createMonitorRuntime,
  startMonitorRuntime,
} from './createMonitorRuntime';
import { MonitorClient } from './MonitorClient';
import { MemoryEventStoreBackend } from '../storage/EventStore';

async function bootFresh() {
  MonitorClient.__resetForTesting();
  return createMonitorRuntime(
    {},
    {
      isDev: true,
      errorUtils: null,
      rejectionTracker: null,
      navigationAdapter: null,
      networkTarget: {}, // no fetch patching
      eventStoreBackend: new MemoryEventStoreBackend(),
      appState: undefined,
      console: {
        log: () => {},
        warn: () => {},
        error: () => {},
      },
    },
  );
}

describe('createMonitorRuntime', () => {
  afterEach(() => {
    MonitorClient.__resetForTesting();
  });

  it('builds a runtime with every Phase 1a component wired up', async () => {
    const runtime = await bootFresh();
    expect(runtime.client).toBeDefined();
    expect(runtime.bus).toBeDefined();
    expect(runtime.store).toBeDefined();
    expect(runtime.session).toBeDefined();
    expect(runtime.platformBridge).toBeDefined();
    expect(runtime.sanitizer).toBeDefined();
    expect(runtime.enricher).toBeDefined();
    expect(runtime.collectors.crash).toBeDefined();
    expect(runtime.collectors.network).toBeDefined();
    expect(runtime.collectors.navigation).toBeDefined();
    expect(runtime.collectors.custom).toBeDefined();
    expect(runtime.terminalReporter).toBeDefined();
    await runtime.shutdown();
  });

  it('does not start the client until startMonitorRuntime is called', async () => {
    const runtime = await bootFresh();
    expect(runtime.client.isRunning()).toBe(false);
    startMonitorRuntime(runtime);
    expect(runtime.client.isRunning()).toBe(true);
    expect(runtime.terminalReporter.isRunning()).toBe(true);
    await runtime.shutdown();
  });

  it('registers all four collectors with the client', async () => {
    const runtime = await bootFresh();
    const names = runtime.client.getCollectors().map((c) => c.name);
    expect(names).toContain('crash');
    expect(names).toContain('network');
    expect(names).toContain('navigation');
    expect(names).toContain('custom');
    await runtime.shutdown();
  });

  it('pipeline routes events through sanitizer + enricher into the store', async () => {
    const runtime = await bootFresh();
    startMonitorRuntime(runtime);
    runtime.trackEvent('checkout', { email: 'leak@example.com' });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const drained = await runtime.store.drainAll(10);
    // Phase 1a writes two copies per event: the raw collector copy (low
    // priority) and the sanitized+enriched pipeline copy (normal). Phase
    // 1b will route everything through the pipeline. For now we only
    // assert the pipeline copy is redacted and carries the context.
    const customEvents = drained.filter((e) => e.type === 'custom');
    expect(customEvents.length).toBeGreaterThanOrEqual(1);
    const enrichedCopy = customEvents.find(
      (e) => (e as unknown as { context?: unknown }).context !== undefined,
    );
    expect(enrichedCopy).toBeDefined();
    const attrs = (enrichedCopy!.data as {
      attributes: Record<string, unknown>;
    }).attributes;
    expect(attrs.email).toBe('[REDACTED]');
    await runtime.shutdown();
  });

  it('trackScreenView proxies to NavigationCollector', async () => {
    const runtime = await bootFresh();
    startMonitorRuntime(runtime);
    const seen: string[] = [];
    runtime.bus.on('navigation', (e) =>
      seen.push((e.data as { screen: string }).screen),
    );
    runtime.trackScreenView('/hello');
    expect(seen).toEqual(['/hello']);
    await runtime.shutdown();
  });

  it('shutdown stops client, reporter, session, and store', async () => {
    const runtime = await bootFresh();
    startMonitorRuntime(runtime);
    await runtime.shutdown();
    expect(runtime.client.isRunning()).toBe(false);
    expect(runtime.terminalReporter.isRunning()).toBe(false);
    // Store is closed — re-use should fail.
    await expect(runtime.store.insert(
      {
        type: 'custom',
        timestamp: 0,
        wallTime: 0,
        sessionId: 'x',
        data: {},
      },
      'normal',
    )).rejects.toThrow();
  });
});
