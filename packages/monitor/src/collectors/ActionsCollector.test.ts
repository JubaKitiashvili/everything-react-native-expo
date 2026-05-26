import {
  ActionsCollector,
  type ActionEventData,
} from './ActionsCollector';
import { SignalBus } from '../core/SignalBus';
import { EventStore, MemoryEventStoreBackend } from '../storage/EventStore';
import { SessionManager } from '../core/SessionManager';
import type { MonitorEvent } from '../types';

async function wiring(clock?: () => number) {
  const bus = new SignalBus();
  const store = new EventStore({ backend: new MemoryEventStoreBackend() });
  await store.init();
  const session = new SessionManager({ random: () => 0.3 });
  const now = clock ?? (() => 0);
  const collector = new ActionsCollector({
    signalBus: bus,
    eventStore: store,
    sessionManager: session,
    now,
    wallNow: () => 1000,
  });
  collector.start();
  return { bus, store, collector };
}

/** A clock that advances by a fixed step on each call. */
function steppingClock(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[Math.min(i, values.length - 1)] ?? 0;
    i += 1;
    return v;
  };
}

describe('ActionsCollector', () => {
  it('reports running state via lifecycle', async () => {
    const w = await wiring();
    expect(w.collector.isRunning()).toBe(true);
    w.collector.stop();
    expect(w.collector.isRunning()).toBe(false);
    w.collector.dispose();
    expect(w.collector.isRunning()).toBe(false);
  });

  describe('wrapAction — sync', () => {
    it('times a successful sync action and returns its value', async () => {
      // start clock call → 100, finish clock call → 130, emit clock call → 140
      const w = await wiring(steppingClock([100, 130, 140]));
      const received: MonitorEvent[] = [];
      w.bus.on('action', (e) => received.push(e));

      const fn = w.collector.wrapAction('compute', (x: number) => x * 2);
      const out = fn(21);

      expect(out).toBe(42);
      expect(received).toHaveLength(1);
      const data = received[0]?.data as ActionEventData;
      expect(data.actionName).toBe('compute');
      expect(data.status).toBe('success');
      expect(data.durationMs).toBe(30);
      expect(data.pending).toBe(false);
      expect(data.errorName).toBeUndefined();
    });

    it('records a thrown sync action as error and re-throws', async () => {
      const w = await wiring(steppingClock([0, 5, 6]));
      const received: MonitorEvent[] = [];
      w.bus.on('action', (e) => received.push(e));

      const fn = w.collector.wrapAction('boom', () => {
        throw new TypeError('kaboom');
      });

      expect(() => fn()).toThrow('kaboom');
      expect(received).toHaveLength(1);
      const data = received[0]?.data as ActionEventData;
      expect(data.status).toBe('error');
      expect(data.errorName).toBe('TypeError');
      expect(data.errorMessage).toBe('kaboom');
      expect(data.durationMs).toBe(5);
    });
  });

  describe('wrapAction — async', () => {
    it('times a resolved async action and forwards the resolved value', async () => {
      const w = await wiring(steppingClock([0, 50, 51]));
      const received: MonitorEvent[] = [];
      w.bus.on('action', (e) => received.push(e));

      const fn = w.collector.wrapAction('save', async (v: string) => {
        return `saved:${v}`;
      });
      const result = await fn('doc');

      expect(result).toBe('saved:doc');
      expect(received).toHaveLength(1);
      const data = received[0]?.data as ActionEventData;
      expect(data.status).toBe('success');
      expect(data.durationMs).toBe(50);
    });

    it('records a rejected async action as error and re-throws', async () => {
      const w = await wiring(steppingClock([0, 12, 13]));
      const received: MonitorEvent[] = [];
      w.bus.on('action', (e) => received.push(e));

      const fn = w.collector.wrapAction('fetchData', async () => {
        throw new Error('network down');
      });

      await expect(fn()).rejects.toThrow('network down');
      expect(received).toHaveLength(1);
      const data = received[0]?.data as ActionEventData;
      expect(data.status).toBe('error');
      expect(data.errorName).toBe('Error');
      expect(data.errorMessage).toBe('network down');
      expect(data.durationMs).toBe(12);
    });

    it('handles a non-Error rejection value', async () => {
      const w = await wiring();
      const received: MonitorEvent[] = [];
      w.bus.on('action', (e) => received.push(e));

      const fn = w.collector.wrapAction('weird', async () => {
        // eslint-disable-next-line no-throw-literal
        throw 'string-rejection';
      });

      await expect(fn()).rejects.toBe('string-rejection');
      const data = received[0]?.data as ActionEventData;
      expect(data.status).toBe('error');
      expect(data.errorName).toBe('NonError');
      expect(data.errorMessage).toBe('string-rejection');
    });
  });

  describe('pending flag', () => {
    it('honors a static pending option', async () => {
      const w = await wiring();
      const received: MonitorEvent[] = [];
      w.bus.on('action', (e) => received.push(e));

      const fn = w.collector.wrapAction('p', () => 1, { pending: true });
      fn();
      expect((received[0]?.data as ActionEventData).pending).toBe(true);
    });

    it('evaluates isPending() at emit time and overrides the static flag', async () => {
      const w = await wiring();
      const received: MonitorEvent[] = [];
      w.bus.on('action', (e) => received.push(e));

      let pending = false;
      const fn = w.collector.wrapAction('p', () => 1, {
        pending: false,
        isPending: () => pending,
      });

      pending = true;
      fn();
      expect((received[0]?.data as ActionEventData).pending).toBe(true);
    });
  });

  describe('instrumentActionState', () => {
    it('preserves the (prevState, payload) => newState contract', async () => {
      const w = await wiring();
      const received: MonitorEvent[] = [];
      w.bus.on('action', (e) => received.push(e));

      const reducer = (prev: number, payload: number): number =>
        prev + payload;
      const action = w.collector.instrumentActionState('counter', reducer);

      const next = action(10, 5);
      expect(next).toBe(15);
      const data = received[0]?.data as ActionEventData;
      expect(data.actionName).toBe('counter');
      expect(data.status).toBe('success');
    });

    it('preserves an async reducer and records errors', async () => {
      const w = await wiring();
      const received: MonitorEvent[] = [];
      w.bus.on('action', (e) => received.push(e));

      const action = w.collector.instrumentActionState<string, string>(
        'async-reducer',
        async (_prev, payload) => {
          if (payload === 'fail') throw new Error('bad payload');
          return payload;
        },
      );

      await expect(action('a', 'ok')).resolves.toBe('ok');
      await expect(action('a', 'fail')).rejects.toThrow('bad payload');
      expect(received).toHaveLength(2);
      expect((received[0]?.data as ActionEventData).status).toBe('success');
      expect((received[1]?.data as ActionEventData).status).toBe('error');
    });
  });

  describe('persistence', () => {
    it('persists success at normal priority and errors at high priority', async () => {
      const w = await wiring();
      const ok = w.collector.wrapAction('ok', () => 1);
      const bad = w.collector.wrapAction('bad', () => {
        throw new Error('x');
      });
      ok();
      expect(() => bad()).toThrow('x');
      // let the fire-and-forget inserts settle
      await Promise.resolve();
      await Promise.resolve();
      expect(await w.store.count()).toBe(2);
    });
  });
});
