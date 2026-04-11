import {
  TouchBoundaryCollector,
  type TouchEventData,
} from './TouchBoundaryCollector';
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

function setup(debounceMs = 100) {
  const bus = new SignalBus();
  const sch = makeScheduler();
  const c = new TouchBoundaryCollector({
    signalBus: bus,
    debounceMs,
    scheduler: sch.scheduler,
    now: () => 1,
    wallNow: () => 2,
  });
  c.start();
  const events: MonitorEvent[] = [];
  bus.on('custom', (e) => events.push(e));
  return { bus, sch, c, events };
}

describe('TouchBoundaryCollector', () => {
  it('emits a single event after debounce window', () => {
    const w = setup();
    w.c.record({ componentName: 'Btn', componentPath: 'App.Btn', x: 10, y: 20 });
    expect(w.events).toHaveLength(0);
    w.sch.fire();
    expect(w.events).toHaveLength(1);
    const attrs = (w.events[0]!.data as {
      attributes: TouchEventData;
    }).attributes;
    expect(attrs.componentName).toBe('Btn');
    expect(attrs.x).toBe(10);
  });

  it('debounces rapid taps on the same target into one event', () => {
    const w = setup();
    w.c.record({ componentName: 'Btn', componentPath: 'App.Btn', x: 1, y: 1 });
    w.c.record({ componentName: 'Btn', componentPath: 'App.Btn', x: 2, y: 2 });
    w.c.record({ componentName: 'Btn', componentPath: 'App.Btn', x: 3, y: 3 });
    w.sch.fire();
    expect(w.events).toHaveLength(1);
    const attrs = (w.events[0]!.data as {
      attributes: TouchEventData;
    }).attributes;
    // Latest coordinates win.
    expect(attrs.x).toBe(3);
  });

  it('flushes the previous target when a new one comes in', () => {
    const w = setup();
    w.c.record({ componentName: 'A', componentPath: 'App.A', x: 0, y: 0 });
    w.c.record({ componentName: 'B', componentPath: 'App.B', x: 9, y: 9 });
    // A flushes immediately on switching; B still pending in debounce.
    expect(w.events).toHaveLength(1);
    expect(
      (w.events[0]!.data as { attributes: TouchEventData }).attributes.componentName,
    ).toBe('A');
    w.sch.fire();
    expect(w.events).toHaveLength(2);
    expect(
      (w.events[1]!.data as { attributes: TouchEventData }).attributes.componentName,
    ).toBe('B');
  });

  it('is inactive when stopped', () => {
    const w = setup();
    w.c.stop();
    w.c.record({ componentName: 'X', componentPath: 'App.X', x: 0, y: 0 });
    expect(w.events).toHaveLength(0);
    expect(w.sch.pending).toBeNull();
  });

  it('flushNow bypasses the debounce', () => {
    const w = setup();
    w.c.record({ componentName: 'X', componentPath: 'App.X', x: 0, y: 0 });
    w.c.flushNow();
    expect(w.events).toHaveLength(1);
    expect(w.sch.pending).toBeNull();
  });

  it('stop() clears pending state without emitting', () => {
    const w = setup();
    w.c.record({ componentName: 'X', componentPath: 'App.X', x: 0, y: 0 });
    w.c.stop();
    w.sch.fire();
    expect(w.events).toHaveLength(0);
  });
});
