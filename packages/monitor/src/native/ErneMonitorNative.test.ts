import { ErneMonitorNative, LazyNativeModuleLoader } from './ErneMonitorNative';
import type {
  ErneMonitorNativeModule,
  NativeANRReport,
  NativeCrashReport,
  NativeEventName,
  NativeMetricsSnapshot,
  NativeSubscription,
  NativeThermalEvent,
} from './types';
import { UNKNOWN_NATIVE_METRICS } from './types';

interface FakeListenerRegistration {
  eventName: NativeEventName;
  listener: (payload: unknown) => void;
}

function makeFakeModule(
  overrides: Partial<ErneMonitorNativeModule> = {},
): {
  module: ErneMonitorNativeModule;
  calls: {
    start: number;
    stop: number;
    getMetrics: number;
    addListener: FakeListenerRegistration[];
    removed: number;
  };
} {
  const calls = {
    start: 0,
    stop: 0,
    getMetrics: 0,
    addListener: [] as FakeListenerRegistration[],
    removed: 0,
  };
  const defaultMetrics: NativeMetricsSnapshot = {
    ...UNKNOWN_NATIVE_METRICS,
    cpuUsagePercent: 5.5,
    memoryUsedBytes: 123,
    sampledAt: 1234,
  };
  const module: ErneMonitorNativeModule = {
    startNativeMonitoring: () => {
      calls.start += 1;
    },
    stopNativeMonitoring: () => {
      calls.stop += 1;
    },
    getNativeMetrics: () => {
      calls.getMetrics += 1;
      return defaultMetrics;
    },
    addListener: (eventName, listener) => {
      calls.addListener.push({
        eventName,
        listener: listener as (payload: unknown) => void,
      });
      const sub: NativeSubscription = {
        remove: () => {
          calls.removed += 1;
        },
      };
      return sub;
    },
    ...overrides,
  };
  return { module, calls };
}

describe('LazyNativeModuleLoader', () => {
  test('caches a successful load and calls impl only once', () => {
    let impls = 0;
    const fake = makeFakeModule().module;
    const loader = new LazyNativeModuleLoader(() => {
      impls += 1;
      return fake;
    });
    expect(loader.load()).toBe(fake);
    expect(loader.load()).toBe(fake);
    expect(loader.load()).toBe(fake);
    expect(impls).toBe(1);
  });

  test('caches a null resolution and calls impl only once', () => {
    let impls = 0;
    const loader = new LazyNativeModuleLoader(() => {
      impls += 1;
      return null;
    });
    expect(loader.load()).toBeNull();
    expect(loader.load()).toBeNull();
    expect(impls).toBe(1);
  });

  test('swallows exceptions and caches null', () => {
    let impls = 0;
    const loader = new LazyNativeModuleLoader(() => {
      impls += 1;
      throw new Error('module missing');
    });
    expect(loader.load()).toBeNull();
    expect(loader.load()).toBeNull();
    expect(impls).toBe(1);
  });

  test('treats undefined impl return as null', () => {
    const loader = new LazyNativeModuleLoader(() => undefined);
    expect(loader.load()).toBeNull();
  });

  test('__reset forgets the cached result', () => {
    let impls = 0;
    const loader = new LazyNativeModuleLoader(() => {
      impls += 1;
      return null;
    });
    loader.load();
    loader.load();
    expect(impls).toBe(1);
    loader.__reset();
    loader.load();
    expect(impls).toBe(2);
  });
});

describe('ErneMonitorNative — graceful fallback (no native module)', () => {
  const loader = new LazyNativeModuleLoader(() => null);
  const native = new ErneMonitorNative(loader);

  test('isAvailable reports false', () => {
    expect(native.isAvailable()).toBe(false);
  });

  test('start/stop are silent no-ops and keep state idle', () => {
    native.startNativeMonitoring();
    expect(native.getState()).toBe('idle');
    native.stopNativeMonitoring();
    expect(native.getState()).toBe('idle');
  });

  test('getNativeMetrics returns the unknown snapshot', () => {
    expect(native.getNativeMetrics()).toBe(UNKNOWN_NATIVE_METRICS);
  });

  test('event subscribers return a no-op subscription', () => {
    const sub1 = native.onNativeCrash(() => {});
    const sub2 = native.onANRDetected(() => {});
    const sub3 = native.onThermalStateChange(() => {});
    expect(typeof sub1.remove).toBe('function');
    expect(typeof sub2.remove).toBe('function');
    expect(typeof sub3.remove).toBe('function');
    // remove() must not throw even though nothing is attached
    expect(() => sub1.remove()).not.toThrow();
    expect(() => sub2.remove()).not.toThrow();
    expect(() => sub3.remove()).not.toThrow();
  });
});

describe('ErneMonitorNative — with a fake native module', () => {
  test('start/stop transitions through states', () => {
    const { module, calls } = makeFakeModule();
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    expect(native.getState()).toBe('idle');
    native.startNativeMonitoring();
    expect(native.getState()).toBe('running');
    expect(calls.start).toBe(1);
    native.stopNativeMonitoring();
    expect(native.getState()).toBe('stopped');
    expect(calls.stop).toBe(1);
  });

  test('getNativeMetrics delegates to the native module', () => {
    const { module, calls } = makeFakeModule();
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    const snap = native.getNativeMetrics();
    expect(snap.cpuUsagePercent).toBe(5.5);
    expect(snap.memoryUsedBytes).toBe(123);
    expect(calls.getMetrics).toBe(1);
  });

  test('event subscribers are forwarded to addListener and can be removed', () => {
    const { module, calls } = makeFakeModule();
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    const crashListener = jest.fn<void, [NativeCrashReport]>();
    const anrListener = jest.fn<void, [NativeANRReport]>();
    const thermalListener = jest.fn<void, [NativeThermalEvent]>();
    const sub1 = native.onNativeCrash(crashListener);
    const sub2 = native.onANRDetected(anrListener);
    const sub3 = native.onThermalStateChange(thermalListener);

    expect(calls.addListener.map((c) => c.eventName)).toEqual([
      'onNativeCrash',
      'onANRDetected',
      'onThermalStateChange',
    ]);

    // Simulate native emitting events
    const crashReport: NativeCrashReport = {
      signal: 'SIGSEGV',
      signalCode: 11,
      faultAddress: '0x0',
      backtrace: ['frame0', 'frame1'],
      threadName: 'main',
      timestamp: 1,
      appVersion: '1.0',
      osVersion: '17.0',
      deviceModel: 'iPhone',
      breadcrumbs: [],
    };
    (
      calls.addListener[0]!.listener as (r: NativeCrashReport) => void
    )(crashReport);
    expect(crashListener).toHaveBeenCalledWith(crashReport);

    const anrReport: NativeANRReport = {
      durationMs: 5200,
      mainThreadStack: ['frameA'],
      screen: 'Home',
      timestamp: 2,
    };
    (
      calls.addListener[1]!.listener as (r: NativeANRReport) => void
    )(anrReport);
    expect(anrListener).toHaveBeenCalledWith(anrReport);

    const thermalEvent: NativeThermalEvent = {
      state: 'serious',
      timestamp: 3,
    };
    (
      calls.addListener[2]!.listener as (r: NativeThermalEvent) => void
    )(thermalEvent);
    expect(thermalListener).toHaveBeenCalledWith(thermalEvent);

    sub1.remove();
    sub2.remove();
    sub3.remove();
    expect(calls.removed).toBe(3);
  });
});

describe('ErneMonitorNative — errors thrown by the native module', () => {
  test('startNativeMonitoring that throws leaves state idle', () => {
    const { module } = makeFakeModule({
      startNativeMonitoring: () => {
        throw new Error('boom');
      },
    });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    expect(() => native.startNativeMonitoring()).not.toThrow();
    expect(native.getState()).toBe('idle');
  });

  test('stopNativeMonitoring that throws still reports stopped', () => {
    const { module } = makeFakeModule({
      stopNativeMonitoring: () => {
        throw new Error('boom');
      },
    });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    native.startNativeMonitoring();
    native.stopNativeMonitoring();
    expect(native.getState()).toBe('stopped');
  });

  test('getNativeMetrics that throws returns the unknown snapshot', () => {
    const { module } = makeFakeModule({
      getNativeMetrics: () => {
        throw new Error('boom');
      },
    });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    const snap = native.getNativeMetrics();
    expect(snap).toBe(UNKNOWN_NATIVE_METRICS);
  });

  test('addListener that throws returns a no-op subscription', () => {
    const { module } = makeFakeModule({
      addListener: () => {
        throw new Error('boom');
      },
    });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    const sub = native.onNativeCrash(() => {});
    expect(typeof sub.remove).toBe('function');
    expect(() => sub.remove()).not.toThrow();
  });
});
