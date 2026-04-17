import {
  EventStore,
  MemoryEventStoreBackend,
  type EventPriority,
} from './EventStore';
import type { MonitorEvent, MonitorEventType } from '../types';

function makeEvent(
  type: MonitorEventType = 'custom',
  data: unknown = { x: 1 },
): MonitorEvent {
  return {
    type,
    timestamp: 0,
    wallTime: 0,
    sessionId: 'test',
    data,
  };
}

async function freshStore(options?: {
  maxBytes?: number;
  maxAgeMs?: number;
  now?: () => number;
}): Promise<EventStore> {
  const store = new EventStore({
    backend: new MemoryEventStoreBackend(),
    ...options,
  });
  await store.init();
  return store;
}

describe('EventStore', () => {
  describe('lifecycle', () => {
    it('throws if used before init', async () => {
      const store = new EventStore({ backend: new MemoryEventStoreBackend() });
      await expect(store.insert(makeEvent(), 'normal')).rejects.toThrow(
        /before init/,
      );
    });

    it('init is idempotent', async () => {
      const store = await freshStore();
      await expect(store.init()).resolves.toBeUndefined();
    });

    it('close releases state', async () => {
      const store = await freshStore();
      await store.insert(makeEvent(), 'normal');
      await store.close();
      await expect(store.insert(makeEvent(), 'normal')).rejects.toThrow(
        /before init/,
      );
    });
  });

  describe('insert / drain by priority', () => {
    it('drainAll returns highest priority first', async () => {
      const store = await freshStore();
      await store.insert(makeEvent('custom', { tag: 'low' }), 'low');
      await store.insert(makeEvent('navigation', { tag: 'normal' }), 'normal');
      await store.insert(makeEvent('crash', { tag: 'critical' }), 'critical');
      await store.insert(makeEvent('network', { tag: 'high' }), 'high');

      const drained = await store.drainAll(10);
      expect(drained.map((e) => (e.data as { tag: string }).tag)).toEqual([
        'critical',
        'high',
        'normal',
        'low',
      ]);
      expect(await store.count()).toBe(0);
    });

    it('drain for a specific priority only returns that level', async () => {
      const store = await freshStore();
      await store.insert(makeEvent('crash'), 'critical');
      await store.insert(makeEvent('network'), 'high');
      await store.insert(makeEvent('network'), 'high');

      const highs = await store.drain('high', 10);
      expect(highs).toHaveLength(2);
      expect(await store.count()).toBe(1); // the crash remains
    });

    it('drainAll respects the limit', async () => {
      const store = await freshStore();
      for (let i = 0; i < 5; i++) {
        await store.insert(makeEvent('custom', { i }), 'normal');
      }
      const first = await store.drainAll(3);
      expect(first).toHaveLength(3);
      expect(await store.count()).toBe(2);
      const rest = await store.drainAll(10);
      expect(rest).toHaveLength(2);
    });

    it('drain / drainAll with limit <= 0 is a no-op', async () => {
      const store = await freshStore();
      await store.insert(makeEvent(), 'normal');
      expect(await store.drain('normal', 0)).toEqual([]);
      expect(await store.drainAll(0)).toEqual([]);
      expect(await store.count()).toBe(1);
    });
  });

  describe('insertSync', () => {
    it('inserts synchronously without awaiting', async () => {
      const store = await freshStore();
      store.insertSync(makeEvent('crash', { tag: 'sync' }), 'critical');
      expect(await store.count()).toBe(1);
      const drained = await store.drainAll(10);
      expect((drained[0]?.data as { tag: string }).tag).toBe('sync');
    });
  });

  describe('size & enforcement', () => {
    it('tracks approximate byte size', async () => {
      const store = await freshStore();
      expect(await store.size()).toBe(0);
      await store.insert(makeEvent('custom', { payload: 'hello world' }), 'normal');
      expect(await store.size()).toBeGreaterThan(0);
    });

    it('evicts non-critical rows when over maxBytes', async () => {
      // Tiny cap to force eviction on the second insert.
      const store = await freshStore({ maxBytes: 100 });
      await store.insert(
        makeEvent('custom', { big: 'x'.repeat(200) }),
        'normal',
      );
      await store.insert(
        makeEvent('custom', { big: 'y'.repeat(200) }),
        'normal',
      );
      expect(await store.size()).toBeLessThanOrEqual(100);
    });

    it('pruneBySize never evicts critical rows', async () => {
      // Start with a generous cap so inserts do not auto-evict, then call
      // pruneBySize(1) explicitly to force eviction.
      const store = await freshStore({ maxBytes: 10_000 });
      store.insertSync(makeEvent('crash', { fatal: true }), 'critical');
      await store.insert(makeEvent('custom', { x: 'y'.repeat(500) }), 'low');
      await store.insert(makeEvent('custom', { x: 'z'.repeat(500) }), 'normal');
      const beforeCount = await store.count();
      expect(beforeCount).toBe(3);

      const removed = await store.pruneBySize(1);
      expect(removed).toBe(2); // low + normal gone, critical preserved

      const remaining = await store.drainAll(10);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.type).toBe('crash');
    });
  });

  describe('prune (age)', () => {
    it('removes events older than maxAge', async () => {
      let t = 1_000_000;
      const store = await freshStore({
        maxAgeMs: 1000,
        now: () => t,
      });
      await store.insert(makeEvent('custom', { tag: 'old' }), 'normal');
      t += 2000;
      await store.insert(makeEvent('custom', { tag: 'new' }), 'normal');
      const removed = await store.prune();
      expect(removed).toBe(1);
      const rest = await store.drainAll(10);
      expect(rest).toHaveLength(1);
      expect((rest[0]?.data as { tag: string }).tag).toBe('new');
    });

    it('prune with an explicit maxAge overrides default', async () => {
      let t = 1_000_000;
      const store = await freshStore({ maxAgeMs: 10_000, now: () => t });
      await store.insert(makeEvent('custom'), 'normal');
      t += 500;
      const removed = await store.prune(100); // much smaller window
      expect(removed).toBe(1);
    });
  });

  describe('findByUserId / deleteByUserId (DSAR)', () => {
    // Helper — build a raw event then wrap it in the enriched shape the
    // pipeline produces (context.userId is what the DSAR methods key on).
    function enrichedEvent(
      userId: string | null,
      data: unknown = { x: 1 },
    ): MonitorEvent {
      return {
        type: 'custom',
        timestamp: 0,
        wallTime: 0,
        sessionId: 's',
        data,
        // Enricher attaches this field in the real pipeline; we inline it
        // here so the tests don't need to spin the whole runtime.
        ...({ context: { userId } } as unknown as Record<string, unknown>),
      } as MonitorEvent;
    }

    it('findByUserId returns only events tagged with that id', async () => {
      const store = await freshStore();
      await store.insert(enrichedEvent('alice', { n: 1 }), 'normal');
      await store.insert(enrichedEvent('bob', { n: 2 }), 'normal');
      await store.insert(enrichedEvent('alice', { n: 3 }), 'normal');
      await store.insert(enrichedEvent(null, { n: 4 }), 'normal');

      const alice = await store.findByUserId('alice', 10);
      expect(alice).toHaveLength(2);
      expect(alice.map((e) => (e.data as { n: number }).n).sort()).toEqual(
        [1, 3],
      );
    });

    it('findByUserId respects the limit', async () => {
      const store = await freshStore();
      for (let i = 0; i < 5; i++) {
        await store.insert(enrichedEvent('x', { i }), 'normal');
      }
      const out = await store.findByUserId('x', 2);
      expect(out).toHaveLength(2);
    });

    it('findByUserId is non-destructive', async () => {
      const store = await freshStore();
      await store.insert(enrichedEvent('alice'), 'normal');
      await store.findByUserId('alice', 10);
      expect(await store.count()).toBe(1);
    });

    it('findByUserId returns empty for unknown user or empty input', async () => {
      const store = await freshStore();
      await store.insert(enrichedEvent('alice'), 'normal');
      expect(await store.findByUserId('ghost', 10)).toEqual([]);
      expect(await store.findByUserId('', 10)).toEqual([]);
    });

    it('deleteByUserId removes every matching row across priorities', async () => {
      const store = await freshStore();
      await store.insert(enrichedEvent('alice', { n: 1 }), 'critical');
      await store.insert(enrichedEvent('bob', { n: 2 }), 'normal');
      await store.insert(enrichedEvent('alice', { n: 3 }), 'low');

      const removed = await store.deleteByUserId('alice');
      expect(removed).toBe(2);
      expect(await store.count()).toBe(1);
      const rest = await store.drainAll(10);
      expect((rest[0]?.data as { n: number }).n).toBe(2);
    });

    it('deleteByUserId with unknown id returns 0', async () => {
      const store = await freshStore();
      await store.insert(enrichedEvent('alice'), 'normal');
      expect(await store.deleteByUserId('ghost')).toBe(0);
      expect(await store.count()).toBe(1);
    });

    it('deleteByUserId with empty input is a no-op', async () => {
      const store = await freshStore();
      await store.insert(enrichedEvent('alice'), 'normal');
      expect(await store.deleteByUserId('')).toBe(0);
      expect(await store.count()).toBe(1);
    });

    it('sizeBytes drops after deleteByUserId', async () => {
      const store = await freshStore();
      await store.insert(enrichedEvent('alice', { big: 'x'.repeat(100) }), 'normal');
      const before = await store.size();
      expect(before).toBeGreaterThan(0);
      await store.deleteByUserId('alice');
      expect(await store.size()).toBe(0);
    });
  });
});
