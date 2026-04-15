import { ReplayCollector } from './ReplayCollector';
import { ReplayMasker } from '../../processors/ReplayMasker';
import { SignalBus } from '../../core/SignalBus';
import { SessionManager } from '../../core/SessionManager';
import {
  ErneMonitorNative,
  LazyNativeModuleLoader,
} from '../../native/ErneMonitorNative';
import type {
  ErneMonitorNativeModule,
  NativeMetricsSnapshot,
  NativeReplayFrame,
  NativeSubscription,
} from '../../native/types';
import { UNKNOWN_NATIVE_METRICS } from '../../native/types';
import type { MonitorEvent } from '../../types';

// ── helpers ──

type FrameListener = (frame: NativeReplayFrame) => void;

function makeFakeModule(): {
  module: ErneMonitorNativeModule;
  fireFrame: (frame: NativeReplayFrame) => void;
  calls: {
    startReplay: number;
    stopReplay: number;
    recordTouch: Array<{ x: number; y: number; phase: string }>;
    updateMasks: number;
  };
} {
  let frameListener: FrameListener | null = null;
  const calls = {
    startReplay: 0,
    stopReplay: 0,
    recordTouch: [] as Array<{ x: number; y: number; phase: string }>,
    updateMasks: 0,
  };
  const defaultMetrics: NativeMetricsSnapshot = {
    ...UNKNOWN_NATIVE_METRICS,
    sampledAt: Date.now(),
  };
  const module: ErneMonitorNativeModule = {
    startNativeMonitoring: () => {},
    stopNativeMonitoring: () => {},
    getNativeMetrics: () => defaultMetrics,
    addListener: (eventName, listener) => {
      if (eventName === 'onReplayFrame') {
        frameListener = listener as unknown as FrameListener;
      }
      const sub: NativeSubscription = {
        remove: () => {
          if (eventName === 'onReplayFrame') frameListener = null;
        },
      };
      return sub;
    },
    startReplayCapture: () => {
      calls.startReplay++;
    },
    stopReplayCapture: () => {
      calls.stopReplay++;
    },
    updateReplayMaskRegions: () => {
      calls.updateMasks++;
    },
    recordReplayTouch: (x: number, y: number, phase: string) => {
      calls.recordTouch.push({ x, y, phase });
    },
  };
  return {
    module,
    fireFrame: (frame) => frameListener?.(frame),
    calls,
  };
}

function makeCollector(
  fakeModule: ErneMonitorNativeModule,
  calls: ReturnType<typeof makeFakeModule>['calls'],
  opts?: {
    captureIntervalMs?: number;
    maxBufferSeconds?: number;
    hasReplayConsent?: () => boolean;
  },
) {
  const bus = new SignalBus();
  const session = new SessionManager({ random: () => 0.5 });
  const native = new ErneMonitorNative(
    new LazyNativeModuleLoader(() => fakeModule),
  );
  const masker = new ReplayMasker();
  const collector = new ReplayCollector({
    native,
    signalBus: bus,
    sessionManager: session,
    masker,
    captureIntervalMs: opts?.captureIntervalMs,
    maxBufferSeconds: opts?.maxBufferSeconds,
    hasReplayConsent: opts?.hasReplayConsent,
  });
  const events: MonitorEvent[] = [];
  bus.onAll((e) => events.push(e));
  return { collector, events, bus, session, calls };
}

// ── tests ──

describe('ReplayCollector', () => {
  test('starts native capture and subscribes to frames', () => {
    const { module, fireFrame, calls } = makeFakeModule();
    const { collector } = makeCollector(module, calls);
    collector.start();
    expect(collector.isRunning()).toBe(true);
    expect(calls.startReplay).toBe(1);

    fireFrame({
      frameBase64: 'abc123',
      touchEvents: [],
      timestamp: 1000,
    });

    expect(collector.getBuffer()).toHaveLength(1);
    expect(collector.getBuffer()[0]!.frameBase64).toBe('abc123');
  });

  test('emits replay_frame events to SignalBus', () => {
    const { module, fireFrame, calls } = makeFakeModule();
    const { collector, events } = makeCollector(module, calls);
    collector.start();

    fireFrame({ frameBase64: 'x', touchEvents: [], timestamp: 2000 });

    expect(events).toHaveLength(1);
    expect(events[0]!.data).toMatchObject({
      name: 'replay_frame',
      frameCount: 1,
    });
  });

  test('ring buffer evicts old frames when maxBufferSeconds exceeded', () => {
    const { module, fireFrame, calls } = makeFakeModule();
    const { collector } = makeCollector(module, calls, {
      captureIntervalMs: 1000,
      maxBufferSeconds: 3, // max 3 frames at 1fps
    });
    collector.start();

    for (let i = 0; i < 5; i++) {
      fireFrame({
        frameBase64: `frame-${i}`,
        touchEvents: [],
        timestamp: 1000 + i * 1000,
      });
    }

    expect(collector.getBuffer()).toHaveLength(3);
    expect(collector.getBuffer()[0]!.frameBase64).toBe('frame-2');
    expect(collector.getBuffer()[2]!.frameBase64).toBe('frame-4');
  });

  test('records touch events via native bridge', () => {
    const { module, calls, fireFrame: _ff } = makeFakeModule();
    const { collector } = makeCollector(module, calls);
    collector.start();
    collector.recordTouch(100, 200, 'began');
    collector.recordTouch(110, 210, 'moved');

    expect(calls.recordTouch).toHaveLength(2);
    expect(calls.recordTouch[0]).toEqual({ x: 100, y: 200, phase: 'began' });
  });

  test('does not start when replay consent is denied', () => {
    const { module, calls } = makeFakeModule();
    const { collector } = makeCollector(module, calls, {
      hasReplayConsent: () => false,
    });
    collector.start();
    expect(collector.isRunning()).toBe(false);
    expect(calls.startReplay).toBe(0);
  });

  test('stops native capture and clears subscription', () => {
    const { module, fireFrame, calls } = makeFakeModule();
    const { collector, events } = makeCollector(module, calls);
    collector.start();
    collector.stop();
    expect(collector.isRunning()).toBe(false);
    expect(calls.stopReplay).toBe(1);

    fireFrame({ frameBase64: 'late', touchEvents: [], timestamp: 5000 });
    expect(events).toHaveLength(0); // no events after stop
  });

  test('clearBuffer empties the frame buffer', () => {
    const { module, fireFrame, calls } = makeFakeModule();
    const { collector } = makeCollector(module, calls);
    collector.start();
    fireFrame({ frameBase64: 'a', touchEvents: [], timestamp: 1000 });
    expect(collector.getBuffer()).toHaveLength(1);
    collector.clearBuffer();
    expect(collector.getBuffer()).toHaveLength(0);
  });

  test('is a silent no-op when native module is absent', () => {
    const bus = new SignalBus();
    const session = new SessionManager({ random: () => 0.5 });
    const native = new ErneMonitorNative(
      new LazyNativeModuleLoader(() => null),
    );
    const masker = new ReplayMasker();
    const collector = new ReplayCollector({
      native,
      signalBus: bus,
      sessionManager: session,
      masker,
    });
    collector.start();
    expect(collector.isRunning()).toBe(false);
  });

  test('dispose stops and clears buffer', () => {
    const { module, fireFrame, calls } = makeFakeModule();
    const { collector } = makeCollector(module, calls);
    collector.start();
    fireFrame({ frameBase64: 'a', touchEvents: [], timestamp: 1000 });
    collector.dispose();
    expect(collector.isRunning()).toBe(false);
    expect(collector.getBuffer()).toHaveLength(0);
  });

  test('refreshMasks calls updateReplayMaskRegions on native', () => {
    const { module, calls } = makeFakeModule();
    const { collector } = makeCollector(module, calls);
    collector.start();
    collector.refreshMasks();
    expect(calls.updateMasks).toBe(1);
  });

  test('preserves touch events in frames', () => {
    const { module, fireFrame, calls } = makeFakeModule();
    const { collector } = makeCollector(module, calls);
    collector.start();

    fireFrame({
      frameBase64: 'img',
      touchEvents: [{ x: 50, y: 60, phase: 'began', timestamp: 1001 }],
      timestamp: 1000,
    });

    const frame = collector.getBuffer()[0]!;
    expect(frame.touchEvents).toHaveLength(1);
    expect(frame.touchEvents[0]!.x).toBe(50);
  });
});
