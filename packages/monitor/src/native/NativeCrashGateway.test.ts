import { NativeCrashGateway } from './NativeCrashGateway';
import type { PersistedCrash } from './NativeCrashGateway';
import { ErneMonitorNative, LazyNativeModuleLoader } from './ErneMonitorNative';
import type { ErneMonitorNativeModule, NativeCrashReport, NativeSubscription } from './types';
import { SignalBus } from '../core/SignalBus';
import { EventStore, MemoryEventStoreBackend } from '../storage/EventStore';
import type { MonitorEvent } from '../types';

function makeCrashReport(overrides: Partial<NativeCrashReport> = {}): NativeCrashReport {
  return {
    signal: 'SIGSEGV',
    signalCode: 11,
    faultAddress: '0xdeadbeef',
    backtrace: [
      '0   MyApp        0x0000000100123abc -[MyVC viewDidLoad]',
      '1   MyApp        0x0000000100456def -[UIViewController loadView]',
    ],
    threadName: 'main',
    timestamp: 1700000000,
    appVersion: '1.2.3',
    osVersion: '17.0',
    deviceModel: 'iPhone16,1',
    breadcrumbs: [],
    ...overrides,
  };
}

interface FakeNativeOptions {
  liveEvents?: NativeCrashReport[];
  drainImpl?: () => Promise<readonly PersistedCrash[]>;
}

function makeFakeNative(options: FakeNativeOptions = {}): {
  native: ErneMonitorNative;
  emit: (report: NativeCrashReport) => void;
  module: ErneMonitorNativeModule;
  acks: string[];
  subRemoved: { count: number };
} {
  const listeners: ((report: NativeCrashReport) => void)[] = [];
  const subRemoved = { count: 0 };
  const acks: string[] = [];

  const module: ErneMonitorNativeModule = {
    startNativeMonitoring: () => {},
    stopNativeMonitoring: () => {},
    getNativeMetrics: () => ({
      cpuUsagePercent: null,
      memoryUsedBytes: null,
      memoryAvailableBytes: null,
      memoryTotalBytes: null,
      thermalState: 'unknown',
      batteryLevel: null,
      batteryCharging: null,
      diskAvailableBytes: null,
      diskTotalBytes: null,
      sampledAt: 0,
    }),
    addListener: (eventName, listener) => {
      const typed = listener as (report: NativeCrashReport) => void;
      if (eventName === 'onNativeCrash') {
        listeners.push(typed);
      }
      const sub: NativeSubscription = {
        remove: () => {
          subRemoved.count += 1;
          const idx = listeners.indexOf(typed);
          if (idx >= 0) listeners.splice(idx, 1);
        },
      };
      return sub;
    },
  };

  const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));

  // Replay any pre-queued live events once start() subscribes.
  const emit = (report: NativeCrashReport) => {
    for (const l of listeners) l(report);
  };

  if (options.liveEvents && options.liveEvents.length > 0) {
    // Defer to allow subscribe-then-emit ordering in the test
    setTimeout(() => {
      for (const r of options.liveEvents!) emit(r);
    }, 0);
  }

  return { native, emit, module, acks, subRemoved };
}

function makeStubSession(id: string = 'session-test') {
  return {
    getCurrentSessionId: () => id,
    getCurrent: () => ({ id, startedAt: 0 }),
    fireChange: () => {},
    handleAppStateChange: () => {},
    onChange: () => () => {},
    dispose: () => {},
  } as unknown as import('../core/SessionManager').SessionManager;
}

async function makeRig(opts: FakeNativeOptions = {}): Promise<{
  gateway: NativeCrashGateway;
  emit: (r: NativeCrashReport) => void;
  bus: SignalBus;
  store: EventStore;
  acks: string[];
  subRemoved: { count: number };
}> {
  const fake = makeFakeNative(opts);
  const bus = new SignalBus();
  const backend = new MemoryEventStoreBackend();
  const store = new EventStore({ backend });
  await store.init();
  const acks: string[] = [];
  const session = makeStubSession();
  const gateway = new NativeCrashGateway({
    native: fake.native,
    signalBus: bus,
    eventStore: store,
    sessionManager: session,
    now: () => 1234,
    wallNow: () => 5678,
    acknowledgePersistedCrash: (id) => acks.push(id),
    drainPersistedCrashes: opts.drainImpl,
  });
  return {
    gateway,
    emit: fake.emit,
    bus,
    store,
    acks,
    subRemoved: fake.subRemoved,
  };
}

describe('NativeCrashGateway — live native crash dispatch', () => {
  test('start() subscribes and is idempotent', async () => {
    const rig = await makeRig();
    expect(rig.gateway.isRunning()).toBe(false);
    rig.gateway.start();
    expect(rig.gateway.isRunning()).toBe(true);
    rig.gateway.start();
    expect(rig.gateway.isRunning()).toBe(true);
    rig.gateway.stop();
    expect(rig.subRemoved.count).toBe(1);
  });

  test('emitted native crash is forwarded as a fatal MonitorEvent on the SignalBus', async () => {
    const rig = await makeRig();
    const emitted: MonitorEvent[] = [];
    rig.bus.on('crash', (event) => emitted.push(event));
    rig.gateway.start();
    rig.emit(makeCrashReport());
    expect(emitted).toHaveLength(1);
    const event = emitted[0]!;
    expect(event.type).toBe('crash');
    expect(event.timestamp).toBe(1234);
    expect(event.wallTime).toBe(5678);
    expect(event.sessionId).toBe('session-test');
    const data = event.data as { kind: string; isFatal: boolean; message: string; stack: string };
    expect(data.kind).toBe('exception');
    expect(data.isFatal).toBe(true);
    expect(data.message).toContain('SIGSEGV');
    expect(data.message).toContain('0xdeadbeef');
    expect(data.message).toContain('main');
    expect(data.stack).toContain('viewDidLoad');
  });

  test('persists fatal native crash via insertSync', async () => {
    const rig = await makeRig();
    rig.gateway.start();
    rig.emit(makeCrashReport());
    const drained = await rig.store.drain('critical', 10);
    expect(drained.length).toBeGreaterThanOrEqual(1);
    expect(drained[0]!.type).toBe('crash');
  });

  test('handles a crash with empty backtrace and missing fields', async () => {
    const rig = await makeRig();
    const emitted: MonitorEvent[] = [];
    rig.bus.on('crash', (event) => emitted.push(event));
    rig.gateway.start();
    rig.emit(
      makeCrashReport({
        backtrace: [],
        faultAddress: null,
        threadName: null,
      }),
    );
    const data = emitted[0]!.data as { stack: string | null; message: string };
    expect(data.stack).toBeNull();
    expect(data.message).toBe('[native] SIGSEGV');
  });

  test('stop() unsubscribes and prevents further dispatch', async () => {
    const rig = await makeRig();
    const emitted: MonitorEvent[] = [];
    rig.bus.on('crash', (event) => emitted.push(event));
    rig.gateway.start();
    rig.gateway.stop();
    rig.emit(makeCrashReport());
    expect(emitted).toHaveLength(0);
  });

  test('delivered count increments per dispatched crash', async () => {
    const rig = await makeRig();
    rig.gateway.start();
    rig.emit(makeCrashReport());
    rig.emit(makeCrashReport({ signal: 'SIGABRT' }));
    expect(rig.gateway.getDeliveredCount()).toBe(2);
  });
});

describe('NativeCrashGateway — persisted crash replay', () => {
  test('replayPersistedCrashes drains, dispatches, and acknowledges each crash', async () => {
    const persisted: PersistedCrash[] = [
      { id: 'crash-1', report: makeCrashReport({ signal: 'SIGSEGV' }) },
      { id: 'crash-2', report: makeCrashReport({ signal: 'SIGABRT' }) },
    ];
    const rig = await makeRig({
      drainImpl: async () => persisted,
    });
    const emitted: MonitorEvent[] = [];
    rig.bus.on('crash', (event) => emitted.push(event));
    const count = await rig.gateway.replayPersistedCrashes();
    expect(count).toBe(2);
    expect(emitted).toHaveLength(2);
    expect(rig.acks).toEqual(['crash-1', 'crash-2']);
    expect(rig.gateway.getDeliveredCount()).toBe(2);
  });

  test('returns 0 when no drain impl is wired', async () => {
    const rig = await makeRig();
    const count = await rig.gateway.replayPersistedCrashes();
    expect(count).toBe(0);
  });

  test('returns 0 and swallows errors when drain impl throws', async () => {
    const rig = await makeRig({
      drainImpl: async () => {
        throw new Error('native module exploded');
      },
    });
    const count = await rig.gateway.replayPersistedCrashes();
    expect(count).toBe(0);
  });

  test('skips crashes whose dispatch fails but keeps acknowledging the rest', async () => {
    const persisted: PersistedCrash[] = [
      { id: 'crash-1', report: makeCrashReport({ signal: 'SIGSEGV' }) },
      { id: 'crash-2', report: makeCrashReport({ signal: 'SIGABRT' }) },
    ];
    const rig = await makeRig({
      drainImpl: async () => persisted,
    });
    // Force the bus to throw on first emit
    let calls = 0;
    rig.bus.on('crash', () => {
      calls += 1;
      if (calls === 1) throw new Error('listener boom');
    });
    const count = await rig.gateway.replayPersistedCrashes();
    // SignalBus per-handler try/catch isolates listener errors,
    // so dispatch still succeeds and the crash is acknowledged.
    expect(count).toBe(2);
    expect(rig.acks).toEqual(['crash-1', 'crash-2']);
  });
});

describe('NativeCrashGateway — fallback to no native module', () => {
  test('start() against an absent native module is a silent no-op', async () => {
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => null));
    const bus = new SignalBus();
    const backend = new MemoryEventStoreBackend();
    const store = new EventStore({ backend });
    await store.init();
    const session = makeStubSession();
    const gateway = new NativeCrashGateway({
      native,
      signalBus: bus,
      eventStore: store,
      sessionManager: session,
    });
    expect(() => gateway.start()).not.toThrow();
    expect(gateway.isRunning()).toBe(true);
    // No crashes — getDeliveredCount stays at 0
    expect(gateway.getDeliveredCount()).toBe(0);
    gateway.stop();
  });

  test('replayPersistedCrashes returns 0 with no native module', async () => {
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => null));
    const bus = new SignalBus();
    const backend = new MemoryEventStoreBackend();
    const store = new EventStore({ backend });
    await store.init();
    const session = makeStubSession();
    const gateway = new NativeCrashGateway({
      native,
      signalBus: bus,
      eventStore: store,
      sessionManager: session,
    });
    const count = await gateway.replayPersistedCrashes();
    expect(count).toBe(0);
  });
});
