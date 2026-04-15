import { FabricCommitCollector } from './FabricCommitCollector';
import type { FabricCommitEventData } from './FabricCommitCollector';
import { SignalBus } from '../../core/SignalBus';
import { SessionManager } from '../../core/SessionManager';
import {
  ErneMonitorNative,
  LazyNativeModuleLoader,
} from '../../native/ErneMonitorNative';
import type {
  ErneMonitorNativeModule,
  NativeFabricCommitReport,
  NativeMetricsSnapshot,
  NativeSubscription,
} from '../../native/types';
import { UNKNOWN_NATIVE_METRICS } from '../../native/types';
import type { MonitorEvent } from '../../types';

// ── helpers ──

type CommitListener = (report: NativeFabricCommitReport) => void;

function makeFakeModule(): {
  module: ErneMonitorNativeModule;
  fireCommit: (report: NativeFabricCommitReport) => void;
} {
  let listener: CommitListener | null = null;
  const defaultMetrics: NativeMetricsSnapshot = {
    ...UNKNOWN_NATIVE_METRICS,
    sampledAt: Date.now(),
  };
  const module: ErneMonitorNativeModule = {
    startNativeMonitoring: () => {},
    stopNativeMonitoring: () => {},
    getNativeMetrics: () => defaultMetrics,
    addListener: (eventName, cb) => {
      if (eventName === 'onFabricCommit') {
        listener = cb as unknown as CommitListener;
      }
      const sub: NativeSubscription = {
        remove: () => {
          if (eventName === 'onFabricCommit') listener = null;
        },
      };
      return sub;
    },
  };
  return {
    module,
    fireCommit: (report) => listener?.(report),
  };
}

function makeCollector(fakeModule: ErneMonitorNativeModule) {
  const bus = new SignalBus();
  const session = new SessionManager({ random: () => 0.5 });
  const native = new ErneMonitorNative(
    new LazyNativeModuleLoader(() => fakeModule),
  );
  const collector = new FabricCommitCollector({
    native,
    signalBus: bus,
    sessionManager: session,
  });
  const events: MonitorEvent[] = [];
  bus.onAll((e) => events.push(e));
  return { collector, events, bus, session };
}

// ── tests ──

describe('FabricCommitCollector', () => {
  test('emits render events with commit data', () => {
    const { module, fireCommit } = makeFakeModule();
    const { collector, events } = makeCollector(module);
    collector.start();
    expect(collector.isRunning()).toBe(true);

    fireCommit({
      commitCount: 120,
      avgCommitDuration: 8.567,
      maxCommitDuration: 22.345,
      yogaLayoutTime: 45.678,
      isLayoutThrashing: false,
      timestamp: 1000,
    });

    expect(events).toHaveLength(1);
    const data = events[0]!.data as { fabricCommit: FabricCommitEventData };
    expect(data.fabricCommit.commitCount).toBe(120);
    expect(data.fabricCommit.avgCommitDuration).toBe(8.57);
    expect(data.fabricCommit.maxCommitDuration).toBe(22.35);
    expect(data.fabricCommit.yogaLayoutTime).toBe(45.68);
    expect(data.fabricCommit.isLayoutThrashing).toBe(false);
    expect(events[0]!.type).toBe('render');
  });

  test('passes layout thrashing flag through', () => {
    const { module, fireCommit } = makeFakeModule();
    const { collector, events } = makeCollector(module);
    collector.start();

    fireCommit({
      commitCount: 25,
      avgCommitDuration: 12.0,
      maxCommitDuration: 50.0,
      yogaLayoutTime: 300.0,
      isLayoutThrashing: true,
      timestamp: 2000,
    });

    const data = events[0]!.data as { fabricCommit: FabricCommitEventData };
    expect(data.fabricCommit.isLayoutThrashing).toBe(true);
  });

  test('does not emit events after stop', () => {
    const { module, fireCommit } = makeFakeModule();
    const { collector, events } = makeCollector(module);
    collector.start();
    collector.stop();
    expect(collector.isRunning()).toBe(false);

    fireCommit({
      commitCount: 10,
      avgCommitDuration: 5.0,
      maxCommitDuration: 10.0,
      yogaLayoutTime: 20.0,
      isLayoutThrashing: false,
      timestamp: 3000,
    });

    expect(events).toHaveLength(0);
  });

  test('is a silent no-op when native module is absent', () => {
    const bus = new SignalBus();
    const session = new SessionManager({ random: () => 0.5 });
    const native = new ErneMonitorNative(
      new LazyNativeModuleLoader(() => null),
    );
    const collector = new FabricCommitCollector({
      native,
      signalBus: bus,
      sessionManager: session,
    });
    const events: MonitorEvent[] = [];
    bus.onAll((e) => events.push(e));

    collector.start();
    expect(collector.isRunning()).toBe(false);
    expect(events).toHaveLength(0);
  });

  test('rounds durations to 2 decimal places', () => {
    const { module, fireCommit } = makeFakeModule();
    const { collector, events } = makeCollector(module);
    collector.start();

    fireCommit({
      commitCount: 60,
      avgCommitDuration: 8.123456,
      maxCommitDuration: 16.789012,
      yogaLayoutTime: 100.5555,
      isLayoutThrashing: false,
      timestamp: 4000,
    });

    const data = events[0]!.data as { fabricCommit: FabricCommitEventData };
    expect(data.fabricCommit.avgCommitDuration).toBe(8.12);
    expect(data.fabricCommit.maxCommitDuration).toBe(16.79);
    expect(data.fabricCommit.yogaLayoutTime).toBe(100.56);
  });

  test('dispose stops the collector', () => {
    const { module, fireCommit } = makeFakeModule();
    const { collector, events } = makeCollector(module);
    collector.start();
    collector.dispose();

    fireCommit({
      commitCount: 10,
      avgCommitDuration: 5.0,
      maxCommitDuration: 10.0,
      yogaLayoutTime: 20.0,
      isLayoutThrashing: false,
      timestamp: 5000,
    });

    expect(collector.isRunning()).toBe(false);
    expect(events).toHaveLength(0);
  });
});
