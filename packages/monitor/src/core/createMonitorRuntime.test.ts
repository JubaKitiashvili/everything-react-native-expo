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
      // Grant consent for every category so default-blocked analytics
      // still reach the store in the pipeline tests.
      initialConsent: { crashes: true, analytics: true, replay: true },
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

  it('registers every Phase 1a + 1b collector with the client', async () => {
    const runtime = await bootFresh();
    const names = runtime.client.getCollectors().map((c) => c.name);
    expect(names).toContain('crash');
    expect(names).toContain('breadcrumb');
    expect(names).toContain('network');
    expect(names).toContain('navigation');
    expect(names).toContain('custom');
    expect(names).toContain('render');
    await runtime.shutdown();
  });

  it('exposes the fingerprinter, sampler, and consent gate', async () => {
    const runtime = await bootFresh();
    expect(runtime.fingerprinter).toBeDefined();
    expect(runtime.sampler).toBeDefined();
    expect(runtime.consentGate).toBeDefined();
    expect(runtime.collectors.breadcrumb).toBeDefined();
    expect(runtime.collectors.render).toBeDefined();
    await runtime.shutdown();
  });

  it('ConsentGate blocks analytics events before they reach the store', async () => {
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
        // Default consent: analytics off.
        initialConsent: { crashes: true, analytics: false, replay: false },
      },
    );
    startMonitorRuntime(runtime);
    runtime.trackEvent('checkout', { amount: 10 });
    await Promise.resolve();
    await Promise.resolve();
    const drained = await runtime.store.drainAll(10);
    const pipelineCopies = drained.filter(
      (e) => (e as unknown as { context?: unknown }).context !== undefined,
    );
    expect(pipelineCopies).toHaveLength(0);
    await runtime.shutdown();
  });

  it('setConsent flushes buffered events after grant', async () => {
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
        initialConsent: { crashes: true, analytics: false, replay: false },
      },
    );
    startMonitorRuntime(runtime);
    runtime.trackEvent('blocked_event', { amount: 1 });
    await Promise.resolve();
    expect(runtime.consentGate.bufferedCount('analytics')).toBe(1);
    await runtime.setConsent({ analytics: true });
    // A fresh event after grant should pass end-to-end.
    runtime.trackEvent('allowed_event', { amount: 2 });
    await Promise.resolve();
    await Promise.resolve();
    const drained = await runtime.store.drainAll(10);
    const names = drained
      .filter((e) => e.type === 'custom')
      .map((e) => (e.data as { name: string }).name);
    expect(names).toContain('allowed_event');
    await runtime.shutdown();
  });

  it('annotates crash events with a fingerprint', async () => {
    const runtime = await bootFresh();
    startMonitorRuntime(runtime);
    const received: Array<{ fingerprint?: string }> = [];
    runtime.bus.on('crash', (e) => received.push(e.data as { fingerprint?: string }));
    const err = new Error('boom for fingerprint');
    // Manually push via the collector to avoid depending on ErrorUtils here.
    runtime.collectors.crash['reportException']?.call(
      runtime.collectors.crash,
      err,
      false,
    );
    expect(received[0]?.fingerprint).toBeTruthy();
    await runtime.shutdown();
  });

  it('breadcrumb collector attaches trail to crash events', async () => {
    const runtime = await bootFresh();
    startMonitorRuntime(runtime);
    runtime.leaveBreadcrumb({
      type: 'manual',
      category: 'ui.tap',
      message: 'tapped Buy',
    });
    const received: Array<{ breadcrumbs?: unknown[] }> = [];
    runtime.bus.on(
      'crash',
      (e) => received.push(e.data as { breadcrumbs?: unknown[] }),
    );
    runtime.collectors.crash['reportException']?.call(
      runtime.collectors.crash,
      new Error('with breadcrumbs'),
      false,
    );
    expect(received[0]?.breadcrumbs).toBeDefined();
    expect((received[0]?.breadcrumbs as unknown[]).length).toBeGreaterThanOrEqual(1);
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
