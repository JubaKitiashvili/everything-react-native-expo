import { LayoutSnapshotCollector } from './LayoutSnapshotCollector';
import { SignalBus } from '../../core/SignalBus';
import { SessionManager } from '../../core/SessionManager';
import {
  ErneMonitorNative,
  LazyNativeModuleLoader,
} from '../../native/ErneMonitorNative';
import type {
  ErneMonitorNativeModule,
  NativeMetricsSnapshot,
  NativeSubscription,
} from '../../native/types';
import { UNKNOWN_NATIVE_METRICS } from '../../native/types';
import type { MonitorEvent } from '../../types';

function makeFakeModule(
  snapshot: Record<string, unknown> | null = null,
): {
  module: ErneMonitorNativeModule;
  capturedMaxDepth: number[];
} {
  const capturedMaxDepth: number[] = [];
  const defaultMetrics: NativeMetricsSnapshot = {
    ...UNKNOWN_NATIVE_METRICS,
    sampledAt: Date.now(),
  };
  const module: ErneMonitorNativeModule = {
    startNativeMonitoring: () => {},
    stopNativeMonitoring: () => {},
    getNativeMetrics: () => defaultMetrics,
    addListener: (_e, _l) => ({ remove: () => {} }) as NativeSubscription,
    captureLayoutSnapshot: async (maxDepth: number) => {
      capturedMaxDepth.push(maxDepth);
      return snapshot;
    },
  };
  return { module, capturedMaxDepth };
}

function makeCollector(
  fakeModule: ErneMonitorNativeModule,
  opts?: { maxDepth?: number },
) {
  const bus = new SignalBus();
  const session = new SessionManager({ random: () => 0.5 });
  const native = new ErneMonitorNative(
    new LazyNativeModuleLoader(() => fakeModule),
  );
  const collector = new LayoutSnapshotCollector({
    native,
    signalBus: bus,
    sessionManager: session,
    maxDepth: opts?.maxDepth,
  });
  const events: MonitorEvent[] = [];
  bus.onAll((e) => events.push(e));
  return { collector, events };
}

describe('LayoutSnapshotCollector', () => {
  test('captures layout snapshot from native module', async () => {
    const snapshot = {
      type: 'UIWindow',
      frame: { x: 0, y: 0, w: 390, h: 844 },
      children: [
        {
          type: 'RCTRootView',
          frame: { x: 0, y: 0, w: 390, h: 844 },
          children: [],
        },
      ],
    };
    const { module, capturedMaxDepth } = makeFakeModule(snapshot);
    const { collector, events } = makeCollector(module);
    collector.start();
    expect(collector.isRunning()).toBe(true);

    const result = await collector.capture();
    expect(result).not.toBeNull();
    expect(result!.type).toBe('UIWindow');
    expect(capturedMaxDepth).toEqual([50]); // default maxDepth
    expect(events).toHaveLength(1);
    expect(events[0]!.data).toMatchObject({
      name: 'layout_snapshot',
      nodeCount: 2,
    });
  });

  test('respects custom maxDepth', async () => {
    const { module, capturedMaxDepth } = makeFakeModule({ type: 'View', frame: { x: 0, y: 0, w: 100, h: 100 } });
    const { collector } = makeCollector(module, { maxDepth: 10 });
    collector.start();
    await collector.capture();
    expect(capturedMaxDepth).toEqual([10]);
  });

  test('returns null when native module is absent', async () => {
    const bus = new SignalBus();
    const session = new SessionManager({ random: () => 0.5 });
    const native = new ErneMonitorNative(
      new LazyNativeModuleLoader(() => null),
    );
    const collector = new LayoutSnapshotCollector({
      native,
      signalBus: bus,
      sessionManager: session,
    });
    collector.start();
    expect(collector.isRunning()).toBe(false);
    const result = await collector.capture();
    expect(result).toBeNull();
  });

  test('returns null when native returns null', async () => {
    const { module } = makeFakeModule(null);
    const { collector, events } = makeCollector(module);
    collector.start();
    const result = await collector.capture();
    expect(result).toBeNull();
    expect(events).toHaveLength(0);
  });

  test('returns null after stop', async () => {
    const snapshot = { type: 'View', frame: { x: 0, y: 0, w: 100, h: 100 } };
    const { module } = makeFakeModule(snapshot);
    const { collector } = makeCollector(module);
    collector.start();
    collector.stop();
    const result = await collector.capture();
    expect(result).toBeNull();
  });

  test('counts nested nodes correctly', async () => {
    const snapshot = {
      type: 'Root',
      frame: { x: 0, y: 0, w: 100, h: 100 },
      children: [
        {
          type: 'A',
          frame: { x: 0, y: 0, w: 50, h: 50 },
          children: [
            { type: 'B', frame: { x: 0, y: 0, w: 25, h: 25 } },
            { type: 'C', frame: { x: 25, y: 0, w: 25, h: 25 } },
          ],
        },
        { type: 'D', frame: { x: 50, y: 0, w: 50, h: 50 } },
      ],
    };
    const { module } = makeFakeModule(snapshot);
    const { collector, events } = makeCollector(module);
    collector.start();
    await collector.capture();
    expect(events[0]!.data).toMatchObject({ nodeCount: 5 });
  });
});
