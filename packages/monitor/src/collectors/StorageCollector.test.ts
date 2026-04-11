import {
  StorageCollector,
  type AsyncStorageLike,
  type StorageEventData,
} from './StorageCollector';
import { SignalBus } from '../core/SignalBus';
import type { MonitorEvent } from '../types';

function setup(opts?: { warnOpsPerSecond?: number; warnValueSize?: number }) {
  const bus = new SignalBus();
  let t = 0;
  const c = new StorageCollector({
    signalBus: bus,
    warnOpsPerSecond: opts?.warnOpsPerSecond,
    warnValueSize: opts?.warnValueSize,
    now: () => t,
    wallNow: () => t,
  });
  c.start();
  const received: MonitorEvent[] = [];
  bus.on('custom', (e) => received.push(e));
  return {
    bus,
    c,
    received,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

function storageEvents(received: MonitorEvent[]): StorageEventData[] {
  return received
    .filter((e) => (e.data as { name?: string }).name === 'storage')
    .map((e) => (e.data as { attributes: StorageEventData }).attributes);
}

function makeFakeAsyncStorage(): AsyncStorageLike & { store: Record<string, string> } {
  const store: Record<string, string> = {};
  return {
    store,
    async getItem(k) {
      return store[k] ?? null;
    },
    async setItem(k, v) {
      store[k] = v;
    },
    async removeItem(k) {
      delete store[k];
    },
    async clear() {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
}

describe('StorageCollector', () => {
  describe('manual record', () => {
    it('emits backend + op + duration', () => {
      const w = setup();
      w.c.record({
        backend: 'sqlite',
        op: 'exec',
        durationMs: 15,
        keyOrStatement: 'INSERT INTO x ...',
      });
      const [ev] = storageEvents(w.received);
      expect(ev?.backend).toBe('sqlite');
      expect(ev?.op).toBe('exec');
      expect(ev?.durationMs).toBe(15);
    });

    it('warns on oversized value', () => {
      const w = setup({ warnValueSize: 1000 });
      w.c.record({
        backend: 'async-storage',
        op: 'set',
        durationMs: 1,
        keyOrStatement: 'payload',
        valueSize: 5000,
      });
      expect(storageEvents(w.received)[0]?.warning).toContain('value size');
    });

    it('warns when ops-per-second exceeded', () => {
      const w = setup({ warnOpsPerSecond: 2 });
      w.c.record({ backend: 'async-storage', op: 'get', durationMs: 1 });
      w.c.record({ backend: 'async-storage', op: 'get', durationMs: 1 });
      w.c.record({ backend: 'async-storage', op: 'get', durationMs: 1 });
      const events = storageEvents(w.received);
      expect(events[2]?.warning).toContain('ops-per-second');
    });
  });

  describe('AsyncStorage patch', () => {
    it('captures getItem/setItem/removeItem transparently', async () => {
      const w = setup();
      const storage = makeFakeAsyncStorage();
      w.c.patchAsyncStorage(storage);
      await storage.setItem('k', 'hello');
      const v = await storage.getItem('k');
      await storage.removeItem('k');
      expect(v).toBe('hello');
      const ops = storageEvents(w.received).map((e) => e.op);
      expect(ops).toEqual(['set', 'get', 'remove']);
      const setEvent = storageEvents(w.received).find((e) => e.op === 'set');
      expect(setEvent?.valueSize).toBe(5);
    });

    it('unpatches cleanly on stop', async () => {
      const w = setup();
      const storage = makeFakeAsyncStorage();
      const origSet = storage.setItem;
      w.c.patchAsyncStorage(storage);
      expect(storage.setItem).not.toBe(origSet);
      w.c.stop();
      expect(storage.setItem).toBe(origSet);
    });
  });
});
