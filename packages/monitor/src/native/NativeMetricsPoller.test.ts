import { NativeMetricsPoller } from './NativeMetricsPoller';
import { ErneMonitorNative, LazyNativeModuleLoader } from './ErneMonitorNative';
import type {
  ErneMonitorNativeModule,
  NativeMetricsSnapshot,
  NativeSubscription,
  NativeThermalEvent,
} from './types';
import { SignalBus } from '../core/SignalBus';
import type { MonitorEvent } from '../types';

function makeFake(initialMetrics?: Partial<NativeMetricsSnapshot>) {
  const metrics: NativeMetricsSnapshot = {
    cpuUsagePercent: 12.5,
    memoryUsedBytes: 100 * 1024 * 1024,
    memoryAvailableBytes: 500 * 1024 * 1024,
    memoryTotalBytes: 4 * 1024 * 1024 * 1024,
    thermalState: 'nominal',
    batteryLevel: 0.85,
    batteryCharging: false,
    diskAvailableBytes: 10 * 1024 * 1024 * 1024,
    diskTotalBytes: 64 * 1024 * 1024 * 1024,
    sampledAt: 1700000000,
    ...initialMetrics,
  };
  let current = metrics;
  const thermalListeners: ((e: NativeThermalEvent) => void)[] = [];
  const subRemoved = { count: 0 };
  let getCalls = 0;
  const module: ErneMonitorNativeModule = {
    startNativeMonitoring: () => {},
    stopNativeMonitoring: () => {},
    getNativeMetrics: () => {
      getCalls += 1;
      return current;
    },
    addListener: (eventName, listener) => {
      if (eventName === 'onThermalStateChange') {
        thermalListeners.push(listener as (e: NativeThermalEvent) => void);
      }
      const sub: NativeSubscription = {
        remove: () => {
          subRemoved.count += 1;
        },
      };
      return sub;
    },
  };
  const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
  return {
    native,
    setMetrics: (m: NativeMetricsSnapshot) => {
      current = m;
    },
    emitThermal: (state: NativeThermalEvent['state']) => {
      for (const l of thermalListeners) {
        l({ state, timestamp: Date.now() });
      }
    },
    subRemoved,
    getGetCalls: () => getCalls,
  };
}

function makeStubSession() {
  return {
    getCurrentSessionId: () => 'session-metrics',
  } as unknown as import('../core/SessionManager').SessionManager;
}

describe('NativeMetricsPoller', () => {
  test('start fires an immediate snapshot and schedules an interval', () => {
    const fake = makeFake();
    const bus = new SignalBus();
    const intervals: { ms: number; cb: () => void }[] = [];
    const handles = new Set<unknown>();
    const poller = new NativeMetricsPoller({
      native: fake.native,
      signalBus: bus,
      sessionManager: makeStubSession(),
      now: () => 1,
      wallNow: () => 2,
      intervalMs: 5000,
      setInterval: (cb, ms) => {
        const handle = { id: intervals.length };
        intervals.push({ ms, cb });
        handles.add(handle);
        return handle;
      },
      clearInterval: (h) => {
        handles.delete(h);
      },
    });
    const events: MonitorEvent[] = [];
    bus.on('custom', (e) => events.push(e));
    poller.start();
    expect(intervals).toHaveLength(1);
    expect(intervals[0]!.ms).toBe(5000);
    expect(events).toHaveLength(1);
    expect((events[0]!.data as { name: string }).name).toBe('native_metrics');
    poller.stop();
    expect(handles.size).toBe(0);
  });

  test('snapshot attributes mirror the native getNativeMetrics result', () => {
    const fake = makeFake({ cpuUsagePercent: 99.5, memoryUsedBytes: 12345 });
    const bus = new SignalBus();
    const poller = new NativeMetricsPoller({
      native: fake.native,
      signalBus: bus,
      sessionManager: makeStubSession(),
      intervalMs: 0, // disable scheduling, drive manually
    });
    const events: MonitorEvent[] = [];
    bus.on('custom', (e) => events.push(e));
    poller.pollOnce();
    const data = events[0]!.data as {
      name: string;
      attributes: { cpuUsagePercent: number; memoryUsedBytes: number };
    };
    expect(data.attributes.cpuUsagePercent).toBe(99.5);
    expect(data.attributes.memoryUsedBytes).toBe(12345);
  });

  test('thermal state changes are forwarded only when they actually change', () => {
    const fake = makeFake();
    const bus = new SignalBus();
    const poller = new NativeMetricsPoller({
      native: fake.native,
      signalBus: bus,
      sessionManager: makeStubSession(),
      intervalMs: 0,
    });
    poller.start();
    const events: MonitorEvent[] = [];
    bus.on('custom', (e) => {
      const d = e.data as { name: string };
      if (d.name === 'native_thermal') events.push(e);
    });
    fake.emitThermal('serious');
    fake.emitThermal('serious'); // duplicate, should be deduped
    fake.emitThermal('critical');
    expect(events).toHaveLength(2);
    expect((events[0]!.data as { attributes: { state: string } }).attributes.state).toBe('serious');
    expect((events[1]!.data as { attributes: { state: string } }).attributes.state).toBe('critical');
    poller.stop();
  });

  test('absent native module → safe defaults, no crashes', () => {
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => null));
    const bus = new SignalBus();
    const poller = new NativeMetricsPoller({
      native,
      signalBus: bus,
      sessionManager: makeStubSession(),
      intervalMs: 0,
    });
    expect(() => poller.start()).not.toThrow();
    poller.pollOnce();
    expect(poller.getSnapshotCount()).toBe(1);
    const snap = poller.getLastSnapshot();
    expect(snap?.thermalState).toBe('unknown');
    expect(snap?.cpuUsagePercent).toBeNull();
    poller.stop();
  });

  test('start is idempotent', () => {
    const fake = makeFake();
    const bus = new SignalBus();
    let intervalCount = 0;
    const poller = new NativeMetricsPoller({
      native: fake.native,
      signalBus: bus,
      sessionManager: makeStubSession(),
      intervalMs: 1000,
      setInterval: () => {
        intervalCount += 1;
        return {};
      },
      clearInterval: () => {},
    });
    poller.start();
    poller.start();
    poller.start();
    expect(intervalCount).toBe(1);
  });
});
