import { MemoryCollector, type MemoryEventData } from './MemoryCollector';
import { SignalBus } from '../core/SignalBus';
import type { MemoryInfo, MonitorEvent, PlatformBridge } from '../types';

function bridge(memory: MemoryInfo | null): PlatformBridge {
  return {
    getDeviceInfo: () => ({
      platform: 'ios',
      osVersion: '17',
      model: 'x',
      isEmulator: false,
      screenWidth: 0,
      screenHeight: 0,
      locale: 'en',
    }),
    getAppInfo: () => ({ version: '1', buildNumber: '1', bundleId: 'x' }),
    getMemoryUsage: () => memory,
    getConnectionType: () => 'unknown',
    persistCrashData: () => {},
  };
}

function fakeScheduler() {
  let fn: (() => void) | null = null;
  return {
    scheduler: {
      set: (cb: () => void) => {
        fn = cb;
        return 1;
      },
      clear: () => {
        fn = null;
      },
    },
    fire: () => fn?.(),
  };
}

describe('MemoryCollector', () => {
  it('emits a memory event when platform bridge has data', () => {
    const bus = new SignalBus();
    const sch = fakeScheduler();
    const c = new MemoryCollector({
      signalBus: bus,
      platformBridge: bridge({ usedBytes: 80, totalBytes: 100 }),
      scheduler: sch.scheduler,
      warnThreshold: 0.5,
    });
    const received: MonitorEvent[] = [];
    bus.on('custom', (e) => received.push(e));
    c.start();
    sch.fire();
    expect(received).toHaveLength(1);
    const data = (received[0]!.data as { attributes: MemoryEventData })
      .attributes;
    expect(data.usedRatio).toBeCloseTo(0.8);
    expect(data.overThreshold).toBe(true);
  });

  it('is a no-op when the bridge returns null', () => {
    const bus = new SignalBus();
    const sch = fakeScheduler();
    const c = new MemoryCollector({
      signalBus: bus,
      platformBridge: bridge(null),
      scheduler: sch.scheduler,
    });
    const received: MonitorEvent[] = [];
    bus.on('custom', (e) => received.push(e));
    c.start();
    sch.fire();
    expect(received).toHaveLength(0);
  });

  it('pauses and resumes with app state', () => {
    const bus = new SignalBus();
    const sch = fakeScheduler();
    const appState: { listener: ((a: boolean) => void) | null } = {
      listener: null,
    };
    const c = new MemoryCollector({
      signalBus: bus,
      platformBridge: bridge({ usedBytes: 1, totalBytes: 100 }),
      scheduler: sch.scheduler,
      appState: {
        addChangeListener: (cb) => {
          appState.listener = cb;
          return { remove: () => {} };
        },
      },
    });
    c.start();
    appState.listener?.(false);
    const received: MonitorEvent[] = [];
    bus.on('custom', (e) => received.push(e));
    sch.fire(); // scheduler was cleared on pause → no fn
    expect(received).toHaveLength(0);
    appState.listener?.(true);
    sch.fire();
    expect(received).toHaveLength(1);
  });
});
