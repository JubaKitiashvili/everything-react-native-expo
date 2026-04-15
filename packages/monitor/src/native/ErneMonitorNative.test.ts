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

describe('ErneMonitorNative — replay methods', () => {
  test('captureLayoutSnapshot returns null when module absent', async () => {
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => null));
    expect(await native.captureLayoutSnapshot()).toBeNull();
  });

  test('captureLayoutSnapshot returns null when method not on module', async () => {
    const { module } = makeFakeModule();
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    // module has no captureLayoutSnapshot
    expect(await native.captureLayoutSnapshot()).toBeNull();
  });

  test('captureLayoutSnapshot delegates when available', async () => {
    const snapshot = { root: { type: 'View', children: [] } };
    const { module } = makeFakeModule({
      captureLayoutSnapshot: async () => snapshot,
    });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    expect(await native.captureLayoutSnapshot(20)).toEqual(snapshot);
  });

  test('captureLayoutSnapshot swallows errors', async () => {
    const { module } = makeFakeModule({
      captureLayoutSnapshot: async () => {
        throw new Error('native error');
      },
    });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    expect(await native.captureLayoutSnapshot()).toBeNull();
  });

  test('startReplayCapture no-ops when module absent', () => {
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => null));
    expect(() => native.startReplayCapture(1000, [])).not.toThrow();
  });

  test('startReplayCapture delegates when available', () => {
    const startReplayCapture = jest.fn();
    const { module } = makeFakeModule({ startReplayCapture });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    native.startReplayCapture(500, [{ x: 0, y: 0 }]);
    expect(startReplayCapture).toHaveBeenCalledWith(500, [{ x: 0, y: 0 }]);
  });

  test('stopReplayCapture no-ops when module absent', () => {
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => null));
    expect(() => native.stopReplayCapture()).not.toThrow();
  });

  test('stopReplayCapture delegates when available', () => {
    const stopReplayCapture = jest.fn();
    const { module } = makeFakeModule({ stopReplayCapture });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    native.stopReplayCapture();
    expect(stopReplayCapture).toHaveBeenCalledTimes(1);
  });

  test('updateReplayMaskRegions no-ops when module absent', () => {
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => null));
    expect(() => native.updateReplayMaskRegions([])).not.toThrow();
  });

  test('updateReplayMaskRegions delegates when available', () => {
    const updateReplayMaskRegions = jest.fn();
    const { module } = makeFakeModule({ updateReplayMaskRegions });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    native.updateReplayMaskRegions([{ x: 10 }]);
    expect(updateReplayMaskRegions).toHaveBeenCalledWith([{ x: 10 }]);
  });

  test('recordReplayTouch no-ops when module absent', () => {
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => null));
    expect(() => native.recordReplayTouch(10, 20, 'began')).not.toThrow();
  });

  test('recordReplayTouch delegates when available', () => {
    const recordReplayTouch = jest.fn();
    const { module } = makeFakeModule({ recordReplayTouch });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    native.recordReplayTouch(10, 20, 'ended');
    expect(recordReplayTouch).toHaveBeenCalledWith(10, 20, 'ended');
  });

  test('onReplayFrame subscribes to event', () => {
    const { module, calls } = makeFakeModule();
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    const listener = jest.fn();
    native.onReplayFrame(listener);
    expect(calls.addListener.some((c) => c.eventName === 'onReplayFrame')).toBe(true);
  });

  test('onDualThreadFPS subscribes to event', () => {
    const { module, calls } = makeFakeModule();
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    const listener = jest.fn();
    native.onDualThreadFPS(listener);
    expect(calls.addListener.some((c) => c.eventName === 'onDualThreadFPS')).toBe(true);
  });

  test('onFabricCommit subscribes to event', () => {
    const { module, calls } = makeFakeModule();
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    const listener = jest.fn();
    native.onFabricCommit(listener);
    expect(calls.addListener.some((c) => c.eventName === 'onFabricCommit')).toBe(true);
  });
});

describe('ErneMonitorNative — span methods', () => {
  test('startSpan no-ops when module absent', () => {
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => null));
    expect(() => native.startSpan('id', 'name', 'internal', null, 1000)).not.toThrow();
  });

  test('startSpan delegates when available', () => {
    const startSpan = jest.fn();
    const { module } = makeFakeModule({ startSpan });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    native.startSpan('s1', 'http.request', 'client', 'p1', 12345);
    expect(startSpan).toHaveBeenCalledWith('s1', 'http.request', 'client', 'p1', 12345);
  });

  test('startSpan swallows errors', () => {
    const { module } = makeFakeModule({
      startSpan: () => {
        throw new Error('native error');
      },
    });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    expect(() => native.startSpan('id', 'n', 'k', null, 0)).not.toThrow();
  });

  test('endSpan no-ops when module absent', () => {
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => null));
    expect(() => native.endSpan('id', 1000)).not.toThrow();
  });

  test('endSpan delegates when available', () => {
    const endSpan = jest.fn();
    const { module } = makeFakeModule({ endSpan });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    native.endSpan('s1', 5000);
    expect(endSpan).toHaveBeenCalledWith('s1', 5000);
  });

  test('endSpan swallows errors', () => {
    const { module } = makeFakeModule({
      endSpan: () => {
        throw new Error('boom');
      },
    });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    expect(() => native.endSpan('id', 0)).not.toThrow();
  });

  test('updateSpan no-ops when module absent', () => {
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => null));
    expect(() => native.updateSpan('id', 'key', 'value')).not.toThrow();
  });

  test('updateSpan delegates when available', () => {
    const updateSpan = jest.fn();
    const { module } = makeFakeModule({ updateSpan });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    native.updateSpan('s1', 'http.status', '200');
    expect(updateSpan).toHaveBeenCalledWith('s1', 'http.status', '200');
  });

  test('updateSpan swallows errors', () => {
    const { module } = makeFakeModule({
      updateSpan: () => {
        throw new Error('boom');
      },
    });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    expect(() => native.updateSpan('id', 'k', 'v')).not.toThrow();
  });

  test('drainInterruptedSpans returns empty when module absent', async () => {
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => null));
    expect(await native.drainInterruptedSpans()).toEqual([]);
  });

  test('drainInterruptedSpans returns empty when method not on module', async () => {
    const { module } = makeFakeModule();
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    expect(await native.drainInterruptedSpans()).toEqual([]);
  });

  test('drainInterruptedSpans delegates when available', async () => {
    const spans = [{ id: 's1', name: 'test', kind: 'internal' }];
    const { module } = makeFakeModule({
      drainInterruptedSpans: async () => spans,
    });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    expect(await native.drainInterruptedSpans()).toEqual(spans);
  });

  test('drainInterruptedSpans swallows errors', async () => {
    const { module } = makeFakeModule({
      drainInterruptedSpans: async () => {
        throw new Error('boom');
      },
    });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    expect(await native.drainInterruptedSpans()).toEqual([]);
  });
});

describe('ErneMonitorNative — persisted crashes', () => {
  test('drainPersistedCrashes returns empty when module absent', async () => {
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => null));
    expect(await native.drainPersistedCrashes()).toEqual([]);
  });

  test('drainPersistedCrashes returns empty when method not on module', async () => {
    const { module } = makeFakeModule();
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    expect(await native.drainPersistedCrashes()).toEqual([]);
  });

  test('drainPersistedCrashes delegates when available', async () => {
    const crashes = [{ id: 'c1', report: { signal: 'SIGSEGV' } }];
    const { module } = makeFakeModule({
      drainPersistedCrashes: async () => crashes as never,
    });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    const result = await native.drainPersistedCrashes();
    expect(result).toEqual(crashes);
  });

  test('drainPersistedCrashes swallows errors', async () => {
    const { module } = makeFakeModule({
      drainPersistedCrashes: async () => {
        throw new Error('disk error');
      },
    });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    expect(await native.drainPersistedCrashes()).toEqual([]);
  });

  test('acknowledgePersistedCrash no-ops when module absent', () => {
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => null));
    expect(() => native.acknowledgePersistedCrash('c1')).not.toThrow();
  });

  test('acknowledgePersistedCrash delegates when available', () => {
    const acknowledgePersistedCrash = jest.fn();
    const { module } = makeFakeModule({ acknowledgePersistedCrash });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    native.acknowledgePersistedCrash('c1');
    expect(acknowledgePersistedCrash).toHaveBeenCalledWith('c1');
  });

  test('acknowledgePersistedCrash swallows errors', () => {
    const { module } = makeFakeModule({
      acknowledgePersistedCrash: () => {
        throw new Error('delete failed');
      },
    });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    expect(() => native.acknowledgePersistedCrash('c1')).not.toThrow();
  });
});

describe('ErneMonitorNative — replay methods that swallow errors', () => {
  test('startReplayCapture swallows errors', () => {
    const { module } = makeFakeModule({
      startReplayCapture: () => {
        throw new Error('native error');
      },
    });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    expect(() => native.startReplayCapture(100, [])).not.toThrow();
  });

  test('stopReplayCapture swallows errors', () => {
    const { module } = makeFakeModule({
      stopReplayCapture: () => {
        throw new Error('native error');
      },
    });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    expect(() => native.stopReplayCapture()).not.toThrow();
  });

  test('updateReplayMaskRegions swallows errors', () => {
    const { module } = makeFakeModule({
      updateReplayMaskRegions: () => {
        throw new Error('native error');
      },
    });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    expect(() => native.updateReplayMaskRegions([])).not.toThrow();
  });

  test('recordReplayTouch swallows errors', () => {
    const { module } = makeFakeModule({
      recordReplayTouch: () => {
        throw new Error('native error');
      },
    });
    const native = new ErneMonitorNative(new LazyNativeModuleLoader(() => module));
    expect(() => native.recordReplayTouch(0, 0, 'began')).not.toThrow();
  });
});

describe('ErneMonitorNative — diagnostics (dev-only test triggers)', () => {
  test('triggerTestCrash delegates to the native module', () => {
    const triggerTestCrash = jest.fn();
    const { module } = makeFakeModule({ triggerTestCrash });
    const native = new ErneMonitorNative(
      new LazyNativeModuleLoader(() => module),
    );
    native.triggerTestCrash();
    expect(triggerTestCrash).toHaveBeenCalledTimes(1);
  });

  test('triggerTestCrash is silent no-op when native module absent', () => {
    const native = new ErneMonitorNative(
      new LazyNativeModuleLoader(() => null),
    );
    expect(() => native.triggerTestCrash()).not.toThrow();
  });

  test('triggerTestCrash swallows native errors', () => {
    const { module } = makeFakeModule({
      triggerTestCrash: () => {
        throw new Error('boom');
      },
    });
    const native = new ErneMonitorNative(
      new LazyNativeModuleLoader(() => module),
    );
    expect(() => native.triggerTestCrash()).not.toThrow();
  });

  test('triggerTestANR delegates with default 6 seconds', () => {
    const triggerTestANR = jest.fn();
    const { module } = makeFakeModule({ triggerTestANR });
    const native = new ErneMonitorNative(
      new LazyNativeModuleLoader(() => module),
    );
    native.triggerTestANR();
    expect(triggerTestANR).toHaveBeenCalledWith(6);
  });

  test('triggerTestANR accepts custom duration', () => {
    const triggerTestANR = jest.fn();
    const { module } = makeFakeModule({ triggerTestANR });
    const native = new ErneMonitorNative(
      new LazyNativeModuleLoader(() => module),
    );
    native.triggerTestANR(10);
    expect(triggerTestANR).toHaveBeenCalledWith(10);
  });

  test('triggerTestANR is silent no-op when native module absent', () => {
    const native = new ErneMonitorNative(
      new LazyNativeModuleLoader(() => null),
    );
    expect(() => native.triggerTestANR()).not.toThrow();
  });

  test('triggerTestSpanCrash delegates with default span name', () => {
    const triggerTestSpanCrash = jest.fn();
    const { module } = makeFakeModule({ triggerTestSpanCrash });
    const native = new ErneMonitorNative(
      new LazyNativeModuleLoader(() => module),
    );
    native.triggerTestSpanCrash();
    expect(triggerTestSpanCrash).toHaveBeenCalledWith('test-span');
  });

  test('triggerTestSpanCrash accepts custom span name', () => {
    const triggerTestSpanCrash = jest.fn();
    const { module } = makeFakeModule({ triggerTestSpanCrash });
    const native = new ErneMonitorNative(
      new LazyNativeModuleLoader(() => module),
    );
    native.triggerTestSpanCrash('checkout-flow');
    expect(triggerTestSpanCrash).toHaveBeenCalledWith('checkout-flow');
  });

  test('triggerTestSpanCrash is silent no-op when native module absent', () => {
    const native = new ErneMonitorNative(
      new LazyNativeModuleLoader(() => null),
    );
    expect(() => native.triggerTestSpanCrash()).not.toThrow();
  });
});
