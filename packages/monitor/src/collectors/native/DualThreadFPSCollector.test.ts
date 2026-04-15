import { DualThreadFPSCollector } from './DualThreadFPSCollector';
import type { DualThreadFPSEventData } from './DualThreadFPSCollector';
import { SignalBus } from '../../core/SignalBus';
import { SessionManager } from '../../core/SessionManager';
import {
  ErneMonitorNative,
  LazyNativeModuleLoader,
} from '../../native/ErneMonitorNative';
import type {
  ErneMonitorNativeModule,
  NativeDualThreadFPSReport,
  NativeMetricsSnapshot,
  NativeSubscription,
} from '../../native/types';
import { UNKNOWN_NATIVE_METRICS } from '../../native/types';
import type { MonitorEvent } from '../../types';

// ── helpers ──

type FPSListener = (report: NativeDualThreadFPSReport) => void;

function makeFakeModule(): {
  module: ErneMonitorNativeModule;
  fireFPS: (report: NativeDualThreadFPSReport) => void;
} {
  let fpsListener: FPSListener | null = null;
  const defaultMetrics: NativeMetricsSnapshot = {
    ...UNKNOWN_NATIVE_METRICS,
    sampledAt: Date.now(),
  };
  const module: ErneMonitorNativeModule = {
    startNativeMonitoring: () => {},
    stopNativeMonitoring: () => {},
    getNativeMetrics: () => defaultMetrics,
    addListener: (eventName, listener) => {
      if (eventName === 'onDualThreadFPS') {
        fpsListener = listener as unknown as FPSListener;
      }
      const sub: NativeSubscription = {
        remove: () => {
          if (eventName === 'onDualThreadFPS') fpsListener = null;
        },
      };
      return sub;
    },
  };
  return {
    module,
    fireFPS: (report) => fpsListener?.(report),
  };
}

function makeCollector(
  fakeModule: ErneMonitorNativeModule,
  opts?: { jankThreshold?: number },
) {
  const bus = new SignalBus();
  const session = new SessionManager({
    random: () => 0.5, // deterministic UUID
  });
  const native = new ErneMonitorNative(
    new LazyNativeModuleLoader(() => fakeModule),
  );
  const collector = new DualThreadFPSCollector({
    native,
    signalBus: bus,
    sessionManager: session,
    jankThreshold: opts?.jankThreshold,
  });
  const events: MonitorEvent[] = [];
  bus.onAll((e) => events.push(e));
  return { collector, events, bus, session };
}

// ── tests ──

describe('DualThreadFPSCollector', () => {
  test('emits frameDrop events with dual-thread data on native report', () => {
    const { module, fireFPS } = makeFakeModule();
    const { collector, events } = makeCollector(module);

    collector.start();
    expect(collector.isRunning()).toBe(true);

    fireFPS({ uiFPS: 58.5, jsFPS: 45.2, timestamp: 1000 });

    expect(events).toHaveLength(1);
    const data = events[0]!.data as { dualThreadFPS: DualThreadFPSEventData };
    expect(data.dualThreadFPS.uiFPS).toBe(58.5);
    expect(data.dualThreadFPS.jsFPS).toBe(45.2);
    expect(data.dualThreadFPS.bottleneck).toBe('js');
    expect(events[0]!.type).toBe('render');
    expect(typeof events[0]!.sessionId).toBe('string');
    expect(events[0]!.sessionId.length).toBeGreaterThan(0);
  });

  test('bottleneck is "ui" when only UI thread is janking', () => {
    const { module, fireFPS } = makeFakeModule();
    const { collector, events } = makeCollector(module);
    collector.start();

    fireFPS({ uiFPS: 30, jsFPS: 58, timestamp: 2000 });

    expect(events[0]!.data).toMatchObject({
      dualThreadFPS: { bottleneck: 'ui' },
    });
  });

  test('bottleneck is "both" when both threads are below threshold', () => {
    const { module, fireFPS } = makeFakeModule();
    const { collector, events } = makeCollector(module);
    collector.start();

    fireFPS({ uiFPS: 20, jsFPS: 15, timestamp: 3000 });

    expect(events[0]!.data).toMatchObject({
      dualThreadFPS: { bottleneck: 'both' },
    });
  });

  test('bottleneck is "none" when both threads are healthy', () => {
    const { module, fireFPS } = makeFakeModule();
    const { collector, events } = makeCollector(module);
    collector.start();

    fireFPS({ uiFPS: 60, jsFPS: 58, timestamp: 4000 });

    expect(events[0]!.data).toMatchObject({
      dualThreadFPS: { bottleneck: 'none' },
    });
  });

  test('respects custom jankThreshold', () => {
    const { module, fireFPS } = makeFakeModule();
    const { collector, events } = makeCollector(module, {
      jankThreshold: 55,
    });
    collector.start();

    // 52 FPS is fine with default (50) but jank with threshold=55
    fireFPS({ uiFPS: 60, jsFPS: 52, timestamp: 5000 });

    expect(events[0]!.data).toMatchObject({
      dualThreadFPS: { bottleneck: 'js' },
    });
  });

  test('does not emit events after stop', () => {
    const { module, fireFPS } = makeFakeModule();
    const { collector, events } = makeCollector(module);
    collector.start();
    collector.stop();
    expect(collector.isRunning()).toBe(false);

    fireFPS({ uiFPS: 10, jsFPS: 10, timestamp: 6000 });

    expect(events).toHaveLength(0);
  });

  test('is a silent no-op when native module is absent', () => {
    const bus = new SignalBus();
    const session = new SessionManager({ random: () => 0.5 });
    const native = new ErneMonitorNative(
      new LazyNativeModuleLoader(() => null),
    );
    const collector = new DualThreadFPSCollector({
      native,
      signalBus: bus,
      sessionManager: session,
    });
    const events: MonitorEvent[] = [];
    bus.onAll((e) => events.push(e));

    collector.start();
    // Should not crash, should not be "running" (no native module)
    expect(collector.isRunning()).toBe(false);
    expect(events).toHaveLength(0);
  });

  test('rounds FPS values to one decimal place', () => {
    const { module, fireFPS } = makeFakeModule();
    const { collector, events } = makeCollector(module);
    collector.start();

    fireFPS({ uiFPS: 59.876543, jsFPS: 44.12345, timestamp: 7000 });

    const data = events[0]!.data as { dualThreadFPS: DualThreadFPSEventData };
    expect(data.dualThreadFPS.uiFPS).toBe(59.9);
    expect(data.dualThreadFPS.jsFPS).toBe(44.1);
  });

  test('dispose stops the collector', () => {
    const { module, fireFPS } = makeFakeModule();
    const { collector, events } = makeCollector(module);
    collector.start();
    collector.dispose();

    fireFPS({ uiFPS: 10, jsFPS: 10, timestamp: 8000 });

    expect(collector.isRunning()).toBe(false);
    expect(events).toHaveLength(0);
  });
});
