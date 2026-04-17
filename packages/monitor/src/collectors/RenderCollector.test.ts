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

describe('RenderCollector — aggregation', () => {
  it('aggregates samples per component and emits on flush for storms', () => {
    const bus = new SignalBus();
    const sch = makeScheduler();
    const c = new RenderCollector({
      signalBus: bus,
      scheduler: sch.scheduler,
      now: () => 0,
      unnecessaryThreshold: 2,
    });
    c.start();
    const received: MonitorEvent[] = [];
    bus.on('render', (e) => received.push(e));
    c.recordSample('Profile', 4);
    c.recordSample('Profile', 6);
    c.recordSample('Settings', 2);
    sch.fire();
    // Only Profile (2 renders, crosses threshold) emits. Settings (1 render,
    // below threshold, not slow) is silently dropped.
    expect(received).toHaveLength(1);
    const pd = received[0]?.data as RenderEventData;
    expect(pd.componentName).toBe('Profile');
    expect(pd.renderCount).toBe(2);
    expect(pd.totalDurationMs).toBe(10);
    expect(pd.maxDurationMs).toBe(6);
    expect(pd.reason).toBe('storm');
    expect(pd.isUnnecessary).toBe(true);
  });

  it('marks a component as a storm once it crosses threshold', () => {
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
    expect(received).toHaveLength(1);
    const d = received[0]?.data as RenderEventData;
    expect(d.isUnnecessary).toBe(true);
    expect(d.reason).toBe('storm');
  });

  it('does not re-emit the same bucket after flush', () => {
    const bus = new SignalBus();
    const sch = makeScheduler();
    const c = new RenderCollector({
      signalBus: bus,
      scheduler: sch.scheduler,
      unnecessaryThreshold: 2,
    });
    c.start();
    const received: MonitorEvent[] = [];
    bus.on('render', (e) => received.push(e));
    c.recordSample('A', 1);
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
      unnecessaryThreshold: 1,
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

describe('RenderCollector — interesting-only gate', () => {
  it('drops non-storm non-slow buckets by default', () => {
    const bus = new SignalBus();
    const sch = makeScheduler();
    const c = new RenderCollector({
      signalBus: bus,
      scheduler: sch.scheduler,
      unnecessaryThreshold: 3,
      slowRenderMs: 16,
    });
    c.start();
    const received: MonitorEvent[] = [];
    bus.on('render', (e) => received.push(e));
    // Two fast renders, no storm → drop
    c.recordSample('Calm', 1);
    c.recordSample('Calm', 2);
    sch.fire();
    expect(received).toHaveLength(0);
  });

  it('emits "informational" for every bucket when emitOnlyInteresting=false', () => {
    const bus = new SignalBus();
    const sch = makeScheduler();
    const c = new RenderCollector({
      signalBus: bus,
      scheduler: sch.scheduler,
      emitOnlyInteresting: false,
    });
    c.start();
    const received: MonitorEvent[] = [];
    bus.on('render', (e) => received.push(e));
    c.recordSample('Quiet', 1);
    sch.fire();
    expect(received).toHaveLength(1);
    const d = received[0]?.data as RenderEventData;
    expect(d.reason).toBe('informational');
    expect(d.isUnnecessary).toBe(false);
  });

  it('emits "slow" for a single slow render above frame budget', () => {
    const bus = new SignalBus();
    const sch = makeScheduler();
    const c = new RenderCollector({
      signalBus: bus,
      scheduler: sch.scheduler,
      slowRenderMs: 16,
    });
    c.start();
    const received: MonitorEvent[] = [];
    bus.on('render', (e) => received.push(e));
    c.recordSample('Heavy', 22); // single slow mount
    sch.fire();
    expect(received).toHaveLength(1);
    const d = received[0]?.data as RenderEventData;
    expect(d.reason).toBe('slow');
    expect(d.isUnnecessary).toBe(false);
  });
});

describe('RenderCollector — justification hints', () => {
  it('does NOT flag storm when hints say props changed', () => {
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
    for (let i = 0; i < 5; i++) {
      c.recordSample('PropsChanging', 1, { propsShallowEqual: false });
    }
    sch.fire();
    // Props changed — justified re-renders, no storm event.
    expect(received).toHaveLength(0);
  });

  it('does NOT flag storm when hints say state changed', () => {
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
    for (let i = 0; i < 5; i++) {
      c.recordSample('StateChanging', 1, { stateChanged: true });
    }
    sch.fire();
    expect(received).toHaveLength(0);
  });

  it('DOES flag storm when hints explicitly contradict (props equal + state unchanged)', () => {
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
    for (let i = 0; i < 4; i++) {
      c.recordSample('Wasteful', 1, {
        propsShallowEqual: true,
        stateChanged: false,
      });
    }
    sch.fire();
    expect(received).toHaveLength(1);
    expect((received[0]?.data as RenderEventData).reason).toBe('storm');
  });

  it('flags storm when threshold crossed and no hints provided at all', () => {
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
    for (let i = 0; i < 4; i++) c.recordSample('NoHints', 1);
    sch.fire();
    // No hints at all — we fall back to the old heuristic (count only).
    expect(received).toHaveLength(1);
    expect((received[0]?.data as RenderEventData).reason).toBe('storm');
  });

  it('still emits slow even when props changed', () => {
    const bus = new SignalBus();
    const sch = makeScheduler();
    const c = new RenderCollector({
      signalBus: bus,
      scheduler: sch.scheduler,
      slowRenderMs: 16,
      unnecessaryThreshold: 99, // make storm path irrelevant
    });
    c.start();
    const received: MonitorEvent[] = [];
    bus.on('render', (e) => received.push(e));
    c.recordSample('SlowAndJustified', 40, { propsShallowEqual: false });
    sch.fire();
    expect(received).toHaveLength(1);
    expect((received[0]?.data as RenderEventData).reason).toBe('slow');
  });

  it('slow classification wins over storm when both apply', () => {
    const bus = new SignalBus();
    const sch = makeScheduler();
    const c = new RenderCollector({
      signalBus: bus,
      scheduler: sch.scheduler,
      slowRenderMs: 16,
      unnecessaryThreshold: 2,
    });
    c.start();
    const received: MonitorEvent[] = [];
    bus.on('render', (e) => received.push(e));
    c.recordSample('SlowStorm', 22);
    c.recordSample('SlowStorm', 8);
    sch.fire();
    expect(received).toHaveLength(1);
    expect((received[0]?.data as RenderEventData).reason).toBe('slow');
  });
});
