import { RSCCollector, type RSCEventData } from './RSCCollector';
import { SignalBus } from '../core/SignalBus';
import { DEFAULT_MONITOR_CONFIG } from '../core/Config';
import type { MonitorEvent } from '../types';

describe('RSCCollector', () => {
  function setup(rscEnabled = true) {
    const bus = new SignalBus();
    const events: MonitorEvent[] = [];
    bus.onAll((e) => events.push(e));

    const collector = new RSCCollector({
      signalBus: bus,
      isRSCEnabled: () => rscEnabled,
      now: () => 1000,
    });

    collector.init(DEFAULT_MONITOR_CONFIG);
    return { collector, events };
  }

  test('starts and stops', () => {
    const { collector } = setup();
    collector.start();
    expect(collector.isRunning()).toBe(true);
    collector.stop();
    expect(collector.isRunning()).toBe(false);
  });

  test('is active when RSC enabled', () => {
    const { collector } = setup(true);
    expect(collector.isActive()).toBe(true);
  });

  test('is inactive when RSC disabled', () => {
    const { collector } = setup(false);
    expect(collector.isActive()).toBe(false);
  });

  test('no-op when RSC disabled', () => {
    const { collector, events } = setup(false);
    collector.start();

    collector.recordServerRender('/home', 100);
    collector.recordPayload('/home', 5000);
    collector.recordStreamingChunk('/home', 0, 3);
    collector.recordCacheStatus('/home', true);
    collector.recordReload('/home', 200);

    expect(events).toHaveLength(0);
  });

  test('no-op when not running', () => {
    const { collector, events } = setup(true);
    // Don't call start()

    collector.recordServerRender('/home', 100);
    expect(events).toHaveLength(0);
  });

  test('records server render', () => {
    const { collector, events } = setup(true);
    collector.start();

    collector.recordServerRender('/home', 150, 'corr-1');

    expect(events).toHaveLength(1);
    const data = events[0]!.data as { name: string; attributes: RSCEventData };
    expect(data.name).toBe('rsc');
    expect(data.attributes.kind).toBe('server-render');
    expect(data.attributes.routePath).toBe('/home');
    expect(data.attributes.serverRenderTimeMs).toBe(150);
    expect(data.attributes.correlationId).toBe('corr-1');
  });

  test('records payload', () => {
    const { collector, events } = setup(true);
    collector.start();

    collector.recordPayload('/details', 8192);

    expect(events).toHaveLength(1);
    const data = events[0]!.data as { name: string; attributes: RSCEventData };
    expect(data.attributes.kind).toBe('payload');
    expect(data.attributes.payloadSizeBytes).toBe(8192);
  });

  test('records streaming chunk', () => {
    const { collector, events } = setup(true);
    collector.start();

    collector.recordStreamingChunk('/feed', 2, 5);

    expect(events).toHaveLength(1);
    const data = events[0]!.data as { name: string; attributes: RSCEventData };
    expect(data.attributes.kind).toBe('streaming-chunk');
    expect(data.attributes.chunkIndex).toBe(2);
    expect(data.attributes.chunkCount).toBe(5);
  });

  test('records cache status', () => {
    const { collector, events } = setup(true);
    collector.start();

    collector.recordCacheStatus('/cached', true);

    expect(events).toHaveLength(1);
    const data = events[0]!.data as { name: string; attributes: RSCEventData };
    expect(data.attributes.kind).toBe('cache-status');
    expect(data.attributes.cacheHit).toBe(true);
  });

  test('records reload timing', () => {
    const { collector, events } = setup(true);
    collector.start();

    collector.recordReload('/refresh', 250, 'reload-1');

    expect(events).toHaveLength(1);
    const data = events[0]!.data as { name: string; attributes: RSCEventData };
    expect(data.attributes.kind).toBe('reload');
    expect(data.attributes.reloadDurationMs).toBe(250);
    expect(data.attributes.correlationId).toBe('reload-1');
  });

  test('emits events with correct type and timestamp', () => {
    const { collector, events } = setup(true);
    collector.start();

    collector.recordServerRender('/test', 100);

    expect(events[0]!.type).toBe('custom');
    expect(events[0]!.timestamp).toBe(1000);
  });

  test('dispose stops the collector', () => {
    const { collector, events } = setup(true);
    collector.start();
    collector.dispose();

    collector.recordServerRender('/home', 100);
    expect(events).toHaveLength(0);
    expect(collector.isRunning()).toBe(false);
  });

  test('has correct name and priority', () => {
    const { collector } = setup();
    expect(collector.name).toBe('rsc');
    expect(collector.priority).toBe(35);
  });
});
