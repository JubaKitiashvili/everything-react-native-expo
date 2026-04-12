import { ANRGateway } from './ANRGateway';
import { ErneMonitorNative, LazyNativeModuleLoader } from './ErneMonitorNative';
import type { ErneMonitorNativeModule, NativeANRReport, NativeSubscription } from './types';
import { SignalBus } from '../core/SignalBus';
import { EventStore, MemoryEventStoreBackend } from '../storage/EventStore';
import type { MonitorEvent } from '../types';

function makeANRReport(overrides: Partial<NativeANRReport> = {}): NativeANRReport {
  return {
    durationMs: 5234,
    mainThreadStack: [
      '0  MyApp                            -[HomeViewController viewDidLoad]',
      '1  MyApp                            -[UIViewController loadViewIfRequired]',
      '2  UIKitCore                        -[UIViewController view]',
    ],
    screen: 'Home',
    timestamp: 1700000000,
    ...overrides,
  };
}

function makeFakeNative(): {
  native: ErneMonitorNative;
  emit: (report: NativeANRReport) => void;
  subRemoved: { count: number };
} {
  const listeners: ((report: NativeANRReport) => void)[] = [];
  const subRemoved = { count: 0 };
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
      const typed = listener as (report: NativeANRReport) => void;
      if (eventName === 'onANRDetected') {
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
  return {
    native,
    emit: (r) => {
      for (const l of listeners) l(r);
    },
    subRemoved,
  };
}

function makeStubSession(id: string = 'session-anr') {
  return {
    getCurrentSessionId: () => id,
  } as unknown as import('../core/SessionManager').SessionManager;
}

async function makeRig() {
  const fake = makeFakeNative();
  const bus = new SignalBus();
  const backend = new MemoryEventStoreBackend();
  const store = new EventStore({ backend });
  await store.init();
  const session = makeStubSession();
  const gateway = new ANRGateway({
    native: fake.native,
    signalBus: bus,
    eventStore: store,
    sessionManager: session,
    now: () => 9999,
    wallNow: () => 8888,
  });
  return { gateway, emit: fake.emit, bus, store, subRemoved: fake.subRemoved };
}

describe('ANRGateway', () => {
  test('start subscribes and is idempotent', async () => {
    const rig = await makeRig();
    expect(rig.gateway.isRunning()).toBe(false);
    rig.gateway.start();
    expect(rig.gateway.isRunning()).toBe(true);
    rig.gateway.start();
    expect(rig.gateway.isRunning()).toBe(true);
    rig.gateway.stop();
    expect(rig.subRemoved.count).toBe(1);
  });

  test('emitted ANR is forwarded as a custom MonitorEvent', async () => {
    const rig = await makeRig();
    const emitted: MonitorEvent[] = [];
    rig.bus.on('custom', (event) => emitted.push(event));
    rig.gateway.start();
    rig.emit(makeANRReport());
    expect(emitted).toHaveLength(1);
    const event = emitted[0]!;
    expect(event.type).toBe('custom');
    expect(event.timestamp).toBe(9999);
    expect(event.wallTime).toBe(8888);
    expect(event.sessionId).toBe('session-anr');
    const data = event.data as {
      name: string;
      attributes: { durationMs: number; screen: string; stackHead: string };
      anr: { kind: string; mainThreadStack: string };
    };
    expect(data.name).toBe('native_anr');
    expect(data.attributes.durationMs).toBe(5234);
    expect(data.attributes.screen).toBe('Home');
    expect(data.attributes.stackHead).toContain('HomeViewController');
    expect(data.anr.kind).toBe('anr');
    expect(data.anr.mainThreadStack).toContain('viewDidLoad');
  });

  test('handles ANR with empty stack', async () => {
    const rig = await makeRig();
    const emitted: MonitorEvent[] = [];
    rig.bus.on('custom', (event) => emitted.push(event));
    rig.gateway.start();
    rig.emit(makeANRReport({ mainThreadStack: [], screen: null }));
    const data = emitted[0]!.data as {
      attributes: { screen: string; stackHead: string };
      anr: { mainThreadStack: string | null };
    };
    expect(data.anr.mainThreadStack).toBeNull();
    expect(data.attributes.screen).toBe('unknown');
    expect(data.attributes.stackHead).toBe('unknown');
  });

  test('stop unsubscribes and prevents further dispatch', async () => {
    const rig = await makeRig();
    const emitted: MonitorEvent[] = [];
    rig.bus.on('custom', (event) => emitted.push(event));
    rig.gateway.start();
    rig.gateway.stop();
    rig.emit(makeANRReport());
    expect(emitted).toHaveLength(0);
  });

  test('dispatched count tracks each ANR', async () => {
    const rig = await makeRig();
    rig.gateway.start();
    rig.emit(makeANRReport({ durationMs: 5000 }));
    rig.emit(makeANRReport({ durationMs: 7500 }));
    expect(rig.gateway.getDispatchedCount()).toBe(2);
  });

  test('absent native module → silent no-op', async () => {
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => null));
    const bus = new SignalBus();
    const backend = new MemoryEventStoreBackend();
    const store = new EventStore({ backend });
    await store.init();
    const session = makeStubSession();
    const gateway = new ANRGateway({
      native,
      signalBus: bus,
      eventStore: store,
      sessionManager: session,
    });
    expect(() => gateway.start()).not.toThrow();
    expect(gateway.isRunning()).toBe(true);
    expect(gateway.getDispatchedCount()).toBe(0);
    gateway.stop();
  });
});
