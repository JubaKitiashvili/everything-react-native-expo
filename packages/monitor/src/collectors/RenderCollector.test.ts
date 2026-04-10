import { RenderCollector, type RenderEventData } from './RenderCollector';
import { SignalBus } from '../core/SignalBus';
import type { MonitorEvent } from '../types';

function makeScheduler() {
  let pending: (() => void) | null = null;
  return {
    scheduler: {
      set: (fn: () => void) => {
        pending = fn;
        return 1;
      },
      clear: () => {
        pending = null;
      },
    },
    fire: () => {
      const fn = pending;
      pending = null;
      fn?.();
    },
    get pending() {
      return pending;
    },
  };
}

describe('RenderCollector', () => {
  it('aggregates samples per component and emits on flush', () => {
    const bus = new SignalBus();
    const sch = makeScheduler();
    const c = new RenderCollector({
      signalBus: bus,
      scheduler: sch.scheduler,
      now: () => 0,
    });
    c.start();
    const received: MonitorEvent[] = [];
    bus.on('render', (e) => received.push(e));
    c.recordSample('Profile', 4);
    c.recordSample('Profile', 6);
    c.recordSample('Settings', 2);
    sch.fire();
    expect(received).toHaveLength(2);
    const profile = received.find(
      (e) => (e.data as RenderEventData).componentName === 'Profile',
    );
    const pd = profile?.data as RenderEventData;
    expect(pd.renderCount).toBe(2);
    expect(pd.totalDurationMs).toBe(10);
    expect(pd.maxDurationMs).toBe(6);
  });

  it('marks a component as isUnnecessary once it crosses threshold', () => {
    const bus = new SignalBus();
    const sch = makeScheduler();
    const c = new RenderCollector({
      signalBus: bus,
      scheduler: sch.scheduler,
      unnecessaryThreshold: 3,
    });
    c.start();
    const received: MonitorEvent[] = [];
    bus.on('render', (e) => received.push(e));
    for (let i = 0; i < 4; i++) c.recordSample('Chatty', 1);
    sch.fire();
    expect((received[0]?.data as RenderEventData).isUnnecessary).toBe(true);
  });

  it('does not re-emit the same bucket after flush', () => {
    const bus = new SignalBus();
    const sch = makeScheduler();
    const c = new RenderCollector({
      signalBus: bus,
      scheduler: sch.scheduler,
    });
    c.start();
    const received: MonitorEvent[] = [];
    bus.on('render', (e) => received.push(e));
    c.recordSample('A', 1);
    sch.fire();
    sch.fire();
    expect(received).toHaveLength(1);
  });

  it('is inactive when stopped', () => {
    const bus = new SignalBus();
    const sch = makeScheduler();
    const c = new RenderCollector({
      signalBus: bus,
      scheduler: sch.scheduler,
    });
    c.start();
    c.stop();
    const received: MonitorEvent[] = [];
    bus.on('render', (e) => received.push(e));
    c.recordSample('A', 1);
    sch.fire();
    expect(received).toHaveLength(0);
  });

  it('flushNow bypasses the debounce', () => {
    const bus = new SignalBus();
    const sch = makeScheduler();
    const c = new RenderCollector({
      signalBus: bus,
      scheduler: sch.scheduler,
    });
    c.start();
    const received: MonitorEvent[] = [];
    bus.on('render', (e) => received.push(e));
    c.recordSample('A', 1);
    c.flushNow();
    expect(received).toHaveLength(1);
    expect(sch.pending).toBeNull();
  });
});
