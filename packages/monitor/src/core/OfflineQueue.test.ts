import {
  OfflineQueue,
  MemoryOfflineStorage,
  OFFLINE_QUEUE_DEFAULTS,
  type OfflineStorage,
} from './OfflineQueue';

interface Evt {
  id: number;
}

/**
 * Fake storage that records writes/removes and can simulate a corrupt or
 * pre-seeded payload, so we can assert the persistence round-trip without
 * relying on the in-memory default's internals.
 */
class FakeStorage implements OfflineStorage {
  private store: Record<string, string> = {};
  public sets = 0;
  public removes = 0;

  constructor(seed?: Record<string, string>) {
    if (seed) this.store = { ...seed };
  }

  async get(key: string): Promise<string | null> {
    return Object.prototype.hasOwnProperty.call(this.store, key)
      ? (this.store[key] as string)
      : null;
  }

  async set(key: string, value: string): Promise<void> {
    this.sets += 1;
    this.store[key] = value;
  }

  async remove(key: string): Promise<void> {
    this.removes += 1;
    delete this.store[key];
  }

  raw(key: string): string | undefined {
    return this.store[key];
  }
}

const alwaysSend = () => true;

describe('OfflineQueue', () => {
  describe('enqueue + flush ordering', () => {
    it('drains in FIFO order', async () => {
      const q = new OfflineQueue<Evt>();
      await q.enqueue({ id: 1 });
      await q.enqueue({ id: 2 });
      await q.enqueue({ id: 3 });

      const seen: number[] = [];
      const acked = await q.flush((e) => {
        seen.push(e.id);
        return true;
      });

      expect(acked).toBe(3);
      expect(seen).toEqual([1, 2, 3]);
      expect(q.size()).toBe(0);
      expect(q.stats()).toEqual({ buffered: 0, dropped: 0, flushed: 3 });
    });

    it('peek returns oldest-first snapshot without mutating', async () => {
      const q = new OfflineQueue<Evt>();
      await q.enqueue({ id: 1 });
      await q.enqueue({ id: 2 });
      const snap = q.peek();
      expect(snap.map((e) => e.id)).toEqual([1, 2]);
      expect(q.size()).toBe(2);
    });

    it('supports async send', async () => {
      const q = new OfflineQueue<Evt>();
      await q.enqueue({ id: 7 });
      const acked = await q.flush(async (e) => {
        await Promise.resolve();
        return e.id === 7;
      });
      expect(acked).toBe(1);
      expect(q.size()).toBe(0);
    });
  });

  describe('partial-failure resume', () => {
    it('stops at the first undelivered event and keeps the tail', async () => {
      const q = new OfflineQueue<Evt>();
      for (let i = 1; i <= 5; i++) await q.enqueue({ id: i });

      // Deliver 1 and 2, fail on 3.
      const firstPass: number[] = [];
      const acked1 = await q.flush((e) => {
        firstPass.push(e.id);
        return e.id < 3;
      });

      expect(acked1).toBe(2);
      expect(firstPass).toEqual([1, 2, 3]); // 3 was attempted but rejected
      expect(q.peek().map((e) => e.id)).toEqual([3, 4, 5]);
      expect(q.stats().flushed).toBe(2);
      expect(q.stats().buffered).toBe(3);

      // Next attempt resumes from 3.
      const secondPass: number[] = [];
      const acked2 = await q.flush((e) => {
        secondPass.push(e.id);
        return true;
      });
      expect(acked2).toBe(3);
      expect(secondPass).toEqual([3, 4, 5]);
      expect(q.size()).toBe(0);
      expect(q.stats().flushed).toBe(5);
    });

    it('treats a thrown send as a failure and resumes', async () => {
      const q = new OfflineQueue<Evt>();
      await q.enqueue({ id: 1 });
      await q.enqueue({ id: 2 });

      const acked = await q.flush((e) => {
        if (e.id === 2) throw new Error('network down');
        return true;
      });
      expect(acked).toBe(1);
      expect(q.peek().map((e) => e.id)).toEqual([2]);

      // Recover.
      const acked2 = await q.flush(alwaysSend);
      expect(acked2).toBe(1);
      expect(q.size()).toBe(0);
    });

    it('flush on empty buffer is a no-op', async () => {
      const q = new OfflineQueue<Evt>();
      const acked = await q.flush(alwaysSend);
      expect(acked).toBe(0);
      expect(q.stats()).toEqual({ buffered: 0, dropped: 0, flushed: 0 });
    });
  });

  describe('cap + drop-oldest', () => {
    it('drops the oldest event when over capacity and counts drops', async () => {
      const q = new OfflineQueue<Evt>({ maxEvents: 3 });
      await q.enqueue({ id: 1 });
      await q.enqueue({ id: 2 });
      await q.enqueue({ id: 3 });
      await q.enqueue({ id: 4 }); // drops id:1
      await q.enqueue({ id: 5 }); // drops id:2

      expect(q.peek().map((e) => e.id)).toEqual([3, 4, 5]);
      expect(q.stats()).toEqual({ buffered: 3, dropped: 2, flushed: 0 });
    });

    it('coerces maxEvents below 1 up to 1', async () => {
      const q = new OfflineQueue<Evt>({ maxEvents: 0 });
      await q.enqueue({ id: 1 });
      await q.enqueue({ id: 2 });
      expect(q.peek().map((e) => e.id)).toEqual([2]);
      expect(q.stats().dropped).toBe(1);
    });

    it('exposes documented defaults', () => {
      expect(OFFLINE_QUEUE_DEFAULTS.maxEvents).toBe(1000);
      expect(OFFLINE_QUEUE_DEFAULTS.storageKey).toBe('erne.offlineQueue');
    });
  });

  describe('persistence round-trip', () => {
    it('persists on enqueue and rehydrates into a fresh queue', async () => {
      const storage = new FakeStorage();
      const q1 = new OfflineQueue<Evt>({ storage, storageKey: 'k' });
      await q1.enqueue({ id: 10 });
      await q1.enqueue({ id: 11 });

      // A brand-new queue over the same storage sees the persisted buffer.
      const q2 = new OfflineQueue<Evt>({ storage, storageKey: 'k' });
      await q2.hydrate();
      expect(q2.peek().map((e) => e.id)).toEqual([10, 11]);
    });

    it('persists after a successful flush (acked events removed from storage)', async () => {
      const storage = new FakeStorage();
      const q = new OfflineQueue<Evt>({ storage, storageKey: 'k' });
      await q.enqueue({ id: 1 });
      await q.enqueue({ id: 2 });
      await q.flush((e) => e.id === 1); // ack 1, stop at 2

      const q2 = new OfflineQueue<Evt>({ storage, storageKey: 'k' });
      await q2.hydrate();
      expect(q2.peek().map((e) => e.id)).toEqual([2]);
    });

    it('trims an over-cap persisted buffer on hydrate', async () => {
      const seeded = JSON.stringify([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
      const storage = new FakeStorage({ k: seeded });
      const q = new OfflineQueue<Evt>({ storage, storageKey: 'k', maxEvents: 2 });
      await q.hydrate();
      expect(q.peek().map((e) => e.id)).toEqual([3, 4]);
      expect(q.stats().dropped).toBe(2);
    });

    it('discards a corrupt persisted payload without throwing', async () => {
      const storage = new FakeStorage({ k: '{not json' });
      const q = new OfflineQueue<Evt>({ storage, storageKey: 'k' });
      await q.hydrate();
      expect(q.size()).toBe(0);
    });

    it('hydrate is idempotent', async () => {
      const storage = new FakeStorage({ k: JSON.stringify([{ id: 9 }]) });
      const q = new OfflineQueue<Evt>({ storage, storageKey: 'k' });
      await q.hydrate();
      await q.enqueue({ id: 10 });
      await q.hydrate(); // must not re-read and clobber the in-memory buffer
      expect(q.peek().map((e) => e.id)).toEqual([9, 10]);
    });

    it('clear empties the buffer and removes it from storage', async () => {
      const storage = new FakeStorage();
      const q = new OfflineQueue<Evt>({ storage, storageKey: 'k' });
      await q.enqueue({ id: 1 });
      await q.clear();
      expect(q.size()).toBe(0);
      expect(storage.raw('k')).toBeUndefined();
      expect(storage.removes).toBe(1);

      // Lifetime counters preserved unless resetStats requested.
      await q.enqueue({ id: 2 });
      await q.flush(alwaysSend);
      expect(q.stats().flushed).toBe(1);
      await q.clear(true);
      expect(q.stats()).toEqual({ buffered: 0, dropped: 0, flushed: 0 });
    });

    it('survives a storage that throws on set', async () => {
      const throwing: OfflineStorage = {
        async get() {
          return null;
        },
        async set() {
          throw new Error('disk full');
        },
        async remove() {
          /* noop */
        },
      };
      const q = new OfflineQueue<Evt>({ storage: throwing });
      await expect(q.enqueue({ id: 1 })).resolves.toBeUndefined();
      // In-memory buffer remains authoritative.
      expect(q.size()).toBe(1);
    });
  });

  describe('MemoryOfflineStorage', () => {
    it('round-trips set/get/remove', async () => {
      const s = new MemoryOfflineStorage();
      expect(await s.get('a')).toBeNull();
      await s.set('a', 'v');
      expect(await s.get('a')).toBe('v');
      await s.remove('a');
      expect(await s.get('a')).toBeNull();
    });
  });
});
