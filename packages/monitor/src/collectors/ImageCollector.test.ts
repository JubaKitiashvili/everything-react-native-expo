import {
  ImageCollector,
  type ImageEventData,
} from './ImageCollector';
import { SignalBus } from '../core/SignalBus';
import type { MonitorEvent } from '../types';

function makeScheduler() {
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
    fire: () => {
      const f = fn;
      fn = null;
      f?.();
    },
  };
}

function setup() {
  const bus = new SignalBus();
  const sch = makeScheduler();
  const c = new ImageCollector({ signalBus: bus, scheduler: sch.scheduler, now: () => 0 });
  c.start();
  const received: MonitorEvent[] = [];
  bus.on('custom', (e) => received.push(e));
  return { c, bus, received, sch };
}

function entries(received: MonitorEvent[]): ImageEventData[] {
  return received
    .filter((e) => (e.data as { name?: string }).name === 'image')
    .map((e) => (e.data as { attributes: ImageEventData }).attributes);
}

describe('ImageCollector', () => {
  it('aggregates per URI and computes averages', () => {
    const w = setup();
    w.c.record({ uri: 'a.jpg', loadDurationMs: 100, cache: 'memory' });
    w.c.record({ uri: 'a.jpg', loadDurationMs: 300, cache: 'miss' });
    w.c.record({ uri: 'b.jpg', loadDurationMs: 50, cache: 'disk' });
    w.sch.fire();
    const list = entries(w.received);
    expect(list).toHaveLength(2);
    const a = list.find((e) => e.uri === 'a.jpg');
    expect(a?.count).toBe(2);
    expect(a?.avgDurationMs).toBe(200);
    expect(a?.worstDurationMs).toBe(300);
    expect(a?.cacheHits).toBe(1);
    expect(a?.cacheMisses).toBe(1);
  });

  it('flags oversized images when source is much larger than display', () => {
    const w = setup();
    w.c.record({
      uri: 'huge.png',
      loadDurationMs: 120,
      sourceWidth: 4000,
      sourceHeight: 4000,
      displayWidth: 100,
      displayHeight: 100,
    });
    w.sch.fire();
    const [ev] = entries(w.received);
    expect(ev?.oversized).toBe(true);
    expect(ev?.oversizeRatio).toBeGreaterThan(10);
  });

  it('does not flag appropriately sized images', () => {
    const w = setup();
    w.c.record({
      uri: 'ok.png',
      loadDurationMs: 30,
      sourceWidth: 200,
      sourceHeight: 200,
      displayWidth: 150,
      displayHeight: 150,
    });
    w.sch.fire();
    const [ev] = entries(w.received);
    expect(ev?.oversized).toBe(false);
  });

  it('tracks error rate', () => {
    const w = setup();
    w.c.record({ uri: 'x.png', loadDurationMs: 10 });
    w.c.record({ uri: 'x.png', loadDurationMs: 10, error: 'network' });
    w.sch.fire();
    const [ev] = entries(w.received);
    expect(ev?.errorRate).toBe(0.5);
  });

  it('stop() clears state and schedule', () => {
    const w = setup();
    w.c.record({ uri: 'a', loadDurationMs: 1 });
    w.c.stop();
    w.sch.fire();
    expect(entries(w.received)).toHaveLength(0);
  });
});
