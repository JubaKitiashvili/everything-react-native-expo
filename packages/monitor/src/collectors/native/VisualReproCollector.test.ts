import { VisualReproCollector } from './VisualReproCollector';
import { SignalBus } from '../../core/SignalBus';
import { SessionManager } from '../../core/SessionManager';
import {
  ErneMonitorNative,
  LazyNativeModuleLoader,
} from '../../native/ErneMonitorNative';
import type { ErneMonitorNativeModule, NativeMetricsSnapshot } from '../../native/types';
import { UNKNOWN_NATIVE_METRICS } from '../../native/types';
import type { MonitorEvent } from '../../types';

// ── helpers ──

function makeFakeModule(): ErneMonitorNativeModule {
  const defaultMetrics: NativeMetricsSnapshot = {
    ...UNKNOWN_NATIVE_METRICS,
    sampledAt: Date.now(),
  };
  return {
    startNativeMonitoring: () => {},
    stopNativeMonitoring: () => {},
    getNativeMetrics: () => defaultMetrics,
    addListener: () => ({ remove: () => {} }),
  };
}

function makeCollector(opts?: {
  captureFrame?: () => string | null;
  hasReplayConsent?: () => boolean;
  maxScreenshots?: number;
  maxBufferBytes?: number;
  useNullModule?: boolean;
}) {
  const bus = new SignalBus();
  const session = new SessionManager({ random: () => 0.5 });
  const native = new ErneMonitorNative(
    new LazyNativeModuleLoader(() => (opts?.useNullModule ? null : makeFakeModule())),
  );

  let frameCounter = 0;
  const defaultCaptureFrame = () => {
    frameCounter++;
    return `frame-data-${frameCounter}`;
  };

  const collector = new VisualReproCollector({
    native,
    signalBus: bus,
    sessionManager: session,
    captureFrame: opts?.captureFrame ?? defaultCaptureFrame,
    hasReplayConsent: opts?.hasReplayConsent,
    maxScreenshots: opts?.maxScreenshots,
    maxBufferBytes: opts?.maxBufferBytes,
  });

  const events: MonitorEvent[] = [];
  bus.onAll((e) => events.push(e));

  return { collector, bus, events, session };
}

function emitNavigation(
  bus: SignalBus,
  screen: string,
  previousScreen: string | null = null,
): void {
  const event: MonitorEvent = {
    type: 'navigation',
    timestamp: Date.now(),
    wallTime: Date.now(),
    sessionId: 'test-session',
    data: { screen, previousScreen, source: 'expo-router', durationMs: 50 },
  };
  bus.emit(event);
}

// ── tests ──

describe('VisualReproCollector', () => {
  test('captures screenshot on navigation event', () => {
    const { collector, bus } = makeCollector();
    collector.start();

    emitNavigation(bus, 'HomeScreen', null);

    expect(collector.getBuffer()).toHaveLength(1);
    expect(collector.getBuffer()[0]!.screen).toBe('HomeScreen');
    expect(collector.getBuffer()[0]!.previousScreen).toBeNull();
    expect(collector.getBuffer()[0]!.frameBase64).toContain('frame-data');
  });

  test('emits visual_repro_capture event to SignalBus', () => {
    const { collector, bus, events } = makeCollector();
    collector.start();

    emitNavigation(bus, 'SettingsScreen', 'HomeScreen');

    // Find the visual_repro_capture event (not the navigation event)
    const reproEvents = events.filter(
      (e) => e.type === 'custom' && (e.data as Record<string, unknown>).name === 'visual_repro_capture',
    );
    expect(reproEvents).toHaveLength(1);
    expect(reproEvents[0]!.data).toMatchObject({
      name: 'visual_repro_capture',
      screen: 'SettingsScreen',
      previousScreen: 'HomeScreen',
      bufferCount: 1,
    });
  });

  test('ring buffer evicts oldest when maxScreenshots exceeded', () => {
    const { collector, bus } = makeCollector({ maxScreenshots: 3 });
    collector.start();

    for (let i = 0; i < 5; i++) {
      emitNavigation(bus, `Screen-${i}`);
    }

    expect(collector.getBuffer()).toHaveLength(3);
    expect(collector.getBuffer()[0]!.screen).toBe('Screen-2');
    expect(collector.getBuffer()[2]!.screen).toBe('Screen-4');
  });

  test('respects maxBufferBytes limit', () => {
    // Each "frame-data-N" is ~12 bytes. Set buffer to ~30 bytes max.
    const { collector, bus } = makeCollector({
      maxBufferBytes: 36,
      maxScreenshots: 100, // high count, byte limit should kick in first
    });
    collector.start();

    for (let i = 0; i < 10; i++) {
      emitNavigation(bus, `Screen-${i}`);
    }

    // Should have evicted old screenshots to stay under byte limit
    expect(collector.getBufferSizeBytes()).toBeLessThanOrEqual(36);
    expect(collector.getBuffer().length).toBeGreaterThan(0);
    expect(collector.getBuffer().length).toBeLessThan(10);
  });

  test('does not capture when replay consent is denied', () => {
    const { collector, bus } = makeCollector({
      hasReplayConsent: () => false,
    });
    collector.start();
    expect(collector.isRunning()).toBe(false);

    emitNavigation(bus, 'HomeScreen');
    expect(collector.getBuffer()).toHaveLength(0);
  });

  test('does not capture when captureFrame returns null', () => {
    const { collector, bus } = makeCollector({
      captureFrame: () => null,
    });
    collector.start();

    emitNavigation(bus, 'HomeScreen');
    expect(collector.getBuffer()).toHaveLength(0);
  });

  test('does not capture after stop', () => {
    const { collector, bus } = makeCollector();
    collector.start();

    emitNavigation(bus, 'Screen-1');
    expect(collector.getBuffer()).toHaveLength(1);

    collector.stop();

    emitNavigation(bus, 'Screen-2');
    expect(collector.getBuffer()).toHaveLength(1); // no new captures
  });

  test('clearBuffer empties the buffer and resets byte count', () => {
    const { collector, bus } = makeCollector();
    collector.start();

    emitNavigation(bus, 'HomeScreen');
    expect(collector.getBuffer()).toHaveLength(1);
    expect(collector.getBufferSizeBytes()).toBeGreaterThan(0);

    collector.clearBuffer();
    expect(collector.getBuffer()).toHaveLength(0);
    expect(collector.getBufferSizeBytes()).toBe(0);
  });

  test('dispose stops and clears buffer', () => {
    const { collector, bus } = makeCollector();
    collector.start();

    emitNavigation(bus, 'HomeScreen');
    collector.dispose();

    expect(collector.isRunning()).toBe(false);
    expect(collector.getBuffer()).toHaveLength(0);
    expect(collector.getBufferSizeBytes()).toBe(0);
  });

  test('skips screenshots that exceed the entire buffer size', () => {
    const { collector, bus } = makeCollector({
      captureFrame: () => 'x'.repeat(100), // 100 byte screenshot
      maxBufferBytes: 50, // buffer too small for even one screenshot
    });
    collector.start();

    emitNavigation(bus, 'HomeScreen');
    expect(collector.getBuffer()).toHaveLength(0);
  });

  test('handles navigation event with missing data gracefully', () => {
    const { collector, bus } = makeCollector();
    collector.start();

    // Emit navigation with no screen data
    const event: MonitorEvent = {
      type: 'navigation',
      timestamp: Date.now(),
      wallTime: Date.now(),
      sessionId: 'test-session',
      data: {},
    };
    bus.emit(event);

    expect(collector.getBuffer()).toHaveLength(1);
    expect(collector.getBuffer()[0]!.screen).toBe('unknown');
  });

  test('only listens to navigation events', () => {
    const { collector, bus } = makeCollector();
    collector.start();

    // Emit a non-navigation event
    const event: MonitorEvent = {
      type: 'network',
      timestamp: Date.now(),
      wallTime: Date.now(),
      sessionId: 'test-session',
      data: { url: 'https://example.com' },
    };
    bus.emit(event);

    expect(collector.getBuffer()).toHaveLength(0);
  });

  test('tracks buffer size bytes correctly across add and evict', () => {
    let frameIndex = 0;
    const frames = ['aaa', 'bbbbb', 'cc', 'dddddddd'];
    const { collector, bus } = makeCollector({
      captureFrame: () => frames[frameIndex++] ?? null,
      maxScreenshots: 2,
    });
    collector.start();

    emitNavigation(bus, 'A'); // 'aaa' = 3 bytes
    expect(collector.getBufferSizeBytes()).toBe(3);

    emitNavigation(bus, 'B'); // 'bbbbb' = 5 bytes
    expect(collector.getBufferSizeBytes()).toBe(8);

    emitNavigation(bus, 'C'); // 'cc' = 2 bytes, evicts 'aaa'
    expect(collector.getBufferSizeBytes()).toBe(7); // 5 + 2
    expect(collector.getBuffer()).toHaveLength(2);
  });
});
