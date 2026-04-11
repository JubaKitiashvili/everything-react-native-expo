import {
  ActivityCollector,
  type ActivityEventData,
} from './ActivityCollector';
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
    get pending() {
      return fn;
    },
  };
}

function setup() {
  const bus = new SignalBus();
  const sch = makeScheduler();
  const c = new ActivityCollector({
    signalBus: bus,
    scheduler: sch.scheduler,
    now: () => 0,
  });
  c.start();
  const received: MonitorEvent[] = [];
  bus.on('custom', (e) => received.push(e));
  return { bus, c, received, sch };
}

function events(received: MonitorEvent[]): ActivityEventData[] {
  return received
    .filter((e) => (e.data as { name?: string }).name === 'activity')
    .map((e) => (e.data as { attributes: ActivityEventData }).attributes);
}

describe('ActivityCollector', () => {
  it('emits an event when renders happen while hidden', () => {
    const w = setup();
    w.c.markMode('Panel', 'hidden');
    w.c.markRender('Panel');
    w.c.markRender('Panel');
    w.c.markRender('Panel');
    w.sch.fire();
    const list = events(w.received);
    expect(list).toHaveLength(1);
    expect(list[0]?.wastedRenderCount).toBe(3);
    expect(list[0]?.totalRenderCount).toBe(3);
    expect(list[0]?.mode).toBe('hidden');
  });

  it('is silent when all renders happen while visible', () => {
    const w = setup();
    w.c.markMode('Panel', 'visible');
    w.c.markRender('Panel');
    w.c.markRender('Panel');
    w.sch.fire();
    expect(events(w.received)).toHaveLength(0);
  });

  it('reports wasted count per component independently', () => {
    const w = setup();
    w.c.markMode('A', 'hidden');
    w.c.markMode('B', 'visible');
    w.c.markRender('A');
    w.c.markRender('B');
    w.c.markRender('A');
    w.sch.fire();
    const list = events(w.received);
    // Only A is wasted, B is quiet.
    expect(list).toHaveLength(1);
    expect(list[0]?.componentName).toBe('A');
    expect(list[0]?.wastedRenderCount).toBe(2);
  });

  it('flushNow bypasses debounce', () => {
    const w = setup();
    w.c.markMode('Panel', 'hidden');
    w.c.markRender('Panel');
    w.c.flushNow();
    expect(events(w.received)).toHaveLength(1);
    expect(w.sch.pending).toBeNull();
  });

  it('stop() clears buckets and mode map', () => {
    const w = setup();
    w.c.markMode('Panel', 'hidden');
    w.c.markRender('Panel');
    w.c.stop();
    w.sch.fire();
    expect(events(w.received)).toHaveLength(0);
  });
});
