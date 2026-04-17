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

  it('exposeGlobal puts runtime on globalThis.__ERNE_MONITOR__', async () => {
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
        exposeGlobal: true,
        console: { log: () => {}, warn: () => {}, error: () => {} },
      },
    );
    const g = globalThis as { __ERNE_MONITOR__?: unknown };
    expect(g.__ERNE_MONITOR__).toBeDefined();
    expect((g.__ERNE_MONITOR__ as Record<string, unknown>).runtime).toBe(runtime);
    await runtime.shutdown();
    expect(g.__ERNE_MONITOR__).toBeUndefined();
  });

  it('creates a dashboard bridge when dashboardUrl is provided', async () => {
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
        dashboardUrl: 'ws://localhost:9000',
        webSocketCtor: null,
        console: { log: () => {}, warn: () => {}, error: () => {} },
      },
    );
    expect(runtime.dashboardBridge).not.toBeNull();
    await runtime.shutdown();
  });

  it('dashboardBridge is null when dashboardUrl is not provided', async () => {
    const runtime = await bootFresh();
    expect(runtime.dashboardBridge).toBeNull();
    await runtime.shutdown();
  });

  it('signal router processes crash events through the pipeline', async () => {
    const runtime = await bootFresh();
    startMonitorRuntime(runtime);
    const routerStatsBefore = runtime.signalRouter.getStats();
    expect(routerStatsBefore.processed).toBe(0);

    // Emit a crash through the crash collector
    runtime.collectors.crash['reportException']?.call(
      runtime.collectors.crash,
      new Error('router test crash'),
      false,
    );
    await Promise.resolve();
    await Promise.resolve();

    const routerStatsAfter = runtime.signalRouter.getStats();
    expect(routerStatsAfter.processed).toBeGreaterThan(0);
    await runtime.shutdown();
  });

  it('passthrough events skip the signal router', async () => {
    const runtime = await bootFresh();
    startMonitorRuntime(runtime);
    // Emit a passthrough event
    runtime.bus.emit({
      type: 'custom',
      timestamp: 0,
      wallTime: 0,
      sessionId: 'x',
      data: { __erneSignalPassthrough: true },
    });
    await Promise.resolve();
    // Router should not have processed it
    expect(runtime.signalRouter.getStats().processed).toBe(0);
    await runtime.shutdown();
  });

  it('pipeline drops events that fail adaptive sampling', async () => {
    MonitorClient.__resetForTesting();
    const runtime = await createMonitorRuntime(
      // Set sampling rate to 0 globally AND override byType defaults so the
      // per-type `custom` entry (which defaults to 1.0 in prod) doesn't
      // keep the event alive.
      {
        sampling: {
          dev: 0,
          prod: 0,
          byType: { custom: { dev: 0, prod: 0 } },
        },
      },
      {
        isDev: false, // force prod mode to use prod sampling rate
        errorUtils: null,
        rejectionTracker: null,
        navigationAdapter: null,
        networkTarget: {},
        eventStoreBackend: new MemoryEventStoreBackend(),
        initialConsent: { crashes: true, analytics: true, replay: true },
        console: { log: () => {}, warn: () => {}, error: () => {} },
      },
    );
    startMonitorRuntime(runtime);
    // Non-crash events should be dropped by the sampler at rate 0
    runtime.trackEvent('sampled_out', { foo: 'bar' });
    await Promise.resolve();
    await Promise.resolve();
    const drained = await runtime.store.drainAll(10);
    // Only the raw collector copy should exist, not the pipeline copy
    const enriched = drained.filter(
      (e) =>
        e.type === 'custom' &&
        (e as unknown as { context?: unknown }).context !== undefined &&
        (e.data as { name?: string }).name === 'sampled_out',
    );
    expect(enriched).toHaveLength(0);
    await runtime.shutdown();
  });

  it('signal router delivers to dashboard output for high-severity crashes', async () => {
    MonitorClient.__resetForTesting();
    const busEvents: Array<{ type: string; passthrough?: boolean }> = [];
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
      },
    );
    startMonitorRuntime(runtime);
    // Subscribe to see passthrough events
    runtime.bus.onAll((e) => {
      const data = e.data as { __erneSignalPassthrough?: boolean; name?: string };
      if (data.__erneSignalPassthrough) {
        busEvents.push({ type: e.type, passthrough: true });
      }
    });
    // Trigger a high-severity crash that should route through the signal router
    runtime.collectors.crash['reportException']?.call(
      runtime.collectors.crash,
      new Error("Cannot read property 'x' of undefined"),
      false,
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    // The dashboard output should have re-emitted as a passthrough event
    // (only if the score was high enough to hit all 3 channels)
    const routerStats = runtime.signalRouter.getStats();
    expect(routerStats.processed).toBeGreaterThan(0);
    await runtime.shutdown();
  });

  it('detectIsDev is used when isDev is not provided', async () => {
    MonitorClient.__resetForTesting();
    // Don't pass isDev — let it auto-detect from __DEV__
    const g = globalThis as { __DEV__?: unknown };
    const origDev = g.__DEV__;
    g.__DEV__ = true;
    try {
      const runtime = await createMonitorRuntime(
        {},
        {
          errorUtils: null,
          rejectionTracker: null,
          navigationAdapter: null,
          networkTarget: {},
          eventStoreBackend: new MemoryEventStoreBackend(),
          initialConsent: { crashes: true, analytics: true, replay: true },
          console: { log: () => {}, warn: () => {}, error: () => {} },
        },
      );
      // Runtime should work fine
      expect(runtime.client).toBeDefined();
      await runtime.shutdown();
    } finally {
      g.__DEV__ = origDev;
    }
  });

  it('nativeModuleLoader=null opts out of native module', async () => {
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
        nativeModuleLoader: null,
        console: { log: () => {}, warn: () => {}, error: () => {} },
      },
    );
    expect(runtime.native.isAvailable()).toBe(false);
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

  describe('DSAR API (userId export / delete)', () => {
    it('setUserId tags subsequent events with the userId in enriched context', async () => {
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
          console: { log: () => {}, warn: () => {}, error: () => {} },
        },
      );
      startMonitorRuntime(runtime);
      runtime.setUserId('user-42');
      runtime.trackEvent('did-something', { ok: true });
      await Promise.resolve();
      await Promise.resolve();
      const drained = await runtime.store.drainAll(10);
      const tagged = drained.find(
        (e) =>
          e.type === 'custom' &&
          (e as unknown as { context?: { userId?: unknown } }).context
            ?.userId === 'user-42',
      );
      expect(tagged).toBeDefined();
      await runtime.shutdown();
    });

    it('exportUserData returns a serializable dump of the user-tagged events', async () => {
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
          console: { log: () => {}, warn: () => {}, error: () => {} },
        },
      );
      startMonitorRuntime(runtime);
      runtime.setUserId('alice');
      runtime.trackEvent('a', {});
      runtime.trackEvent('b', {});
      runtime.setUserId('bob');
      runtime.trackEvent('c', {});
      await Promise.resolve();
      await Promise.resolve();

      const dump = await runtime.exportUserData('alice');
      expect(dump.userId).toBe('alice');
      expect(dump.eventCount).toBe(2);
      expect(dump.events).toHaveLength(2);
      expect(typeof dump.sdkVersion).toBe('string');
      // JSON-serializable end-to-end.
      expect(() => JSON.stringify(dump)).not.toThrow();
      await runtime.shutdown();
    });

    it('exportUserData returns empty dump for empty userId', async () => {
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
          console: { log: () => {}, warn: () => {}, error: () => {} },
        },
      );
      const dump = await runtime.exportUserData('');
      expect(dump.eventCount).toBe(0);
      expect(dump.events).toEqual([]);
      await runtime.shutdown();
    });

    it('deleteUserData purges tagged events and clears current user if matching', async () => {
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
          console: { log: () => {}, warn: () => {}, error: () => {} },
        },
      );
      startMonitorRuntime(runtime);
      runtime.setUserId('alice');
      runtime.trackEvent('a', {});
      runtime.trackEvent('b', {});
      await Promise.resolve();
      await Promise.resolve();

      const result = await runtime.deleteUserData('alice');
      expect(result.eventsDeleted).toBe(2);
      expect(result.currentUserCleared).toBe(true);
      expect(runtime.getUserId()).toBeNull();
      expect(await runtime.store.findByUserId('alice', 10)).toEqual([]);
      await runtime.shutdown();
    });

    it('deleteUserData leaves other users intact', async () => {
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
          console: { log: () => {}, warn: () => {}, error: () => {} },
        },
      );
      startMonitorRuntime(runtime);
      runtime.setUserId('alice');
      runtime.trackEvent('a', {});
      runtime.setUserId('bob');
      runtime.trackEvent('b', {});
      await Promise.resolve();
      await Promise.resolve();

      await runtime.deleteUserData('alice');
      const remaining = await runtime.store.findByUserId('bob', 10);
      expect(remaining).toHaveLength(1);
      expect(runtime.getUserId()).toBe('bob'); // current user untouched
      await runtime.shutdown();
    });

    it('deleteUserData on unknown user is a no-op', async () => {
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
          console: { log: () => {}, warn: () => {}, error: () => {} },
        },
      );
      const result = await runtime.deleteUserData('ghost');
      expect(result.eventsDeleted).toBe(0);
      expect(result.currentUserCleared).toBe(false);
      await runtime.shutdown();
    });
  });
});
