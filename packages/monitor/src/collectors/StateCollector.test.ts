import { StateCollector, type StateEventData } from './StateCollector';
import { SignalBus } from '../core/SignalBus';
import type { MonitorEvent } from '../types';

function setup(opts?: { maxPerSecond?: number; now?: () => number }) {
  const bus = new SignalBus();
  const c = new StateCollector({
    signalBus: bus,
    maxPerSecond: opts?.maxPerSecond,
    now: opts?.now ?? (() => 0),
    wallNow: () => 0,
  });
  c.start();
  const received: MonitorEvent[] = [];
  bus.on('custom', (e) => received.push(e));
  return { bus, c, received };
}

function stateEvents(received: MonitorEvent[]): StateEventData[] {
  return received
    .filter((e) => (e.data as { name?: string }).name === 'state')
    .map((e) => (e.data as { attributes: StateEventData }).attributes);
}

describe('StateCollector', () => {
  it('records a state event with changed keys', () => {
    const w = setup();
    w.c.record({
      source: 'zustand',
      action: 'set',
      changedKeys: ['count'],
      store: 'counter',
    });
    const events = stateEvents(w.received);
    expect(events).toHaveLength(1);
    expect(events[0]?.changedKeys).toEqual(['count']);
    expect(events[0]?.store).toBe('counter');
  });

  it('does not record anything when stopped', () => {
    const w = setup();
    w.c.stop();
    w.c.record({ source: 'zustand', action: 'set', changedKeys: ['x'] });
    expect(stateEvents(w.received)).toHaveLength(0);
  });

  it('rate-limits to maxPerSecond', () => {
    let t = 0;
    const w = setup({ maxPerSecond: 3, now: () => t });
    for (let i = 0; i < 5; i++) {
      w.c.record({ source: 'zustand', action: 'set', changedKeys: ['x'] });
    }
    expect(stateEvents(w.received)).toHaveLength(3);
    // Advance past the window → counter resets.
    t = 1100;
    w.c.record({ source: 'zustand', action: 'set', changedKeys: ['x'] });
    expect(stateEvents(w.received)).toHaveLength(4);
  });

  describe('zustand middleware', () => {
    // Minimal real-Zustand-like set/get where state is an immutable
    // snapshot replaced on every update.
    function makeZustandLike<T extends Record<string, unknown>>(initial: T) {
      let state: T = { ...initial };
      const getState = () => state;
      const setState = (updater: unknown) => {
        const patch =
          typeof updater === 'function'
            ? (updater as (s: T) => Partial<T>)(state)
            : (updater as Partial<T>);
        state = { ...state, ...patch };
      };
      return { getState, setState };
    }

    it('wraps set() and emits shallow-diff events', () => {
      const w = setup();
      const { getState, setState } = makeZustandLike({ count: 0, name: 'a' });
      const creator = (set: typeof setState) => ({
        increment: () => set({ count: getState().count + 1 }),
      });
      const wrapped = w.c.zustandMiddleware('counter')(creator);
      const api = wrapped(setState, getState, {});
      api.increment();
      api.increment();
      const events = stateEvents(w.received);
      expect(events).toHaveLength(2);
      expect(events[0]?.changedKeys).toEqual(['count']);
      expect(events[0]?.store).toBe('counter');
    });

    it('does not emit when state is unchanged', () => {
      const w = setup();
      const { getState, setState } = makeZustandLike({ count: 5 });
      const creator = (set: typeof setState) => ({
        noop: () => set({ count: 5 }),
      });
      const wrapped = w.c.zustandMiddleware('same')(creator);
      const api = wrapped(setState, getState, {});
      api.noop();
      expect(stateEvents(w.received)).toHaveLength(0);
    });
  });

  describe('redux middleware', () => {
    it('captures action type and diff', () => {
      const w = setup();
      let state: { count: number; name: string } = { count: 0, name: 'a' };
      const api = { getState: () => state };
      const next = (a: { type: string }) => {
        if (a.type === 'inc') state = { ...state, count: state.count + 1 };
        if (a.type === 'rename') state = { ...state, name: 'b' };
        return a;
      };
      const mw = w.c.reduxMiddleware('app')(api)(next);
      mw({ type: 'inc' });
      mw({ type: 'rename' });
      const events = stateEvents(w.received);
      expect(events).toHaveLength(2);
      expect(events[0]?.action).toBe('inc');
      expect(events[0]?.changedKeys).toEqual(['count']);
      expect(events[1]?.action).toBe('rename');
      expect(events[1]?.changedKeys).toEqual(['name']);
    });
  });
});
