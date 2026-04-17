import {
  SqliteEventStoreBackend,
  type ExpoSqliteDatabase,
  type ExpoSqliteLike,
} from './SqliteEventStoreBackend';
import type { EventPriority, StoredEventRow } from './EventStore';
import type { MonitorEvent } from '../types';

interface FakeRow {
  id: number;
  priority: EventPriority;
  payload: string;
  size_bytes: number;
  inserted_at: number;
}

function makeFakeDb(): {
  db: ExpoSqliteDatabase;
  closed: boolean;
  rows: FakeRow[];
} {
  const state = { rows: [] as FakeRow[], closed: false, nextId: 1 };

  const db: ExpoSqliteDatabase = {
    async execAsync(_sql: string) {
      // schema is a no-op for the fake
    },
    async runAsync(sql: string, params: unknown[] = []) {
      if (/INSERT INTO monitor_events/.test(sql)) {
        const [priority, payload, size_bytes, inserted_at] = params as [
          EventPriority,
          string,
          number,
          number,
        ];
        const row: FakeRow = {
          id: state.nextId++,
          priority,
          payload,
          size_bytes,
          inserted_at,
        };
        state.rows.push(row);
        return { lastInsertRowId: row.id, changes: 1 };
      }
      if (/^DELETE FROM monitor_events WHERE inserted_at < \?/.test(sql)) {
        const cutoff = params[0] as number;
        const before = state.rows.length;
        state.rows = state.rows.filter((r) => r.inserted_at >= cutoff);
        return { lastInsertRowId: 0, changes: before - state.rows.length };
      }
      if (/^DELETE FROM monitor_events WHERE id IN/.test(sql)) {
        const ids = new Set(params as number[]);
        const before = state.rows.length;
        state.rows = state.rows.filter((r) => !ids.has(r.id));
        return { lastInsertRowId: 0, changes: before - state.rows.length };
      }
      if (/^DELETE FROM monitor_events WHERE id = \?/.test(sql)) {
        const id = params[0] as number;
        const before = state.rows.length;
        state.rows = state.rows.filter((r) => r.id !== id);
        return { lastInsertRowId: 0, changes: before - state.rows.length };
      }
      if (/^DELETE FROM monitor_events WHERE payload LIKE \?/.test(sql)) {
        const pattern = params[0] as string;
        const matcher = likeToRegExp(pattern);
        const before = state.rows.length;
        state.rows = state.rows.filter((r) => !matcher.test(r.payload));
        return { lastInsertRowId: 0, changes: before - state.rows.length };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
    async getAllAsync<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      if (
        /SELECT .+ FROM monitor_events WHERE priority = \? ORDER BY inserted_at ASC LIMIT \?/.test(
          sql,
        )
      ) {
        const priority = params[0] as EventPriority;
        const limit = params[1] as number;
        const matched = state.rows
          .filter((r) => r.priority === priority)
          .sort((a, b) => a.inserted_at - b.inserted_at)
          .slice(0, limit);
        return matched as unknown as T[];
      }
      if (
        /SELECT .+ FROM monitor_events WHERE payload LIKE \? ORDER BY inserted_at ASC LIMIT \?/.test(
          sql,
        )
      ) {
        const pattern = params[0] as string;
        const limit = params[1] as number;
        const matcher = likeToRegExp(pattern);
        const matched = state.rows
          .filter((r) => matcher.test(r.payload))
          .sort((a, b) => a.inserted_at - b.inserted_at)
          .slice(0, limit);
        return matched as unknown as T[];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
    async getFirstAsync<T>(sql: string, params: unknown[] = []): Promise<T | null> {
      if (/^SELECT COUNT\(\*\) AS c/.test(sql)) {
        return { c: state.rows.length } as unknown as T;
      }
      if (/^SELECT SUM\(size_bytes\) AS s/.test(sql)) {
        const s = state.rows.reduce((acc, r) => acc + r.size_bytes, 0);
        return { s } as unknown as T;
      }
      if (/WHERE priority != 'critical'/.test(sql)) {
        const victim = state.rows
          .filter((r) => r.priority !== 'critical')
          .sort((a, b) => a.inserted_at - b.inserted_at)[0];
        return (victim ?? null) as unknown as T | null;
      }
      throw new Error(`unexpected getFirst SQL: ${sql}`);
    },
    async closeAsync() {
      state.closed = true;
    },
  };

  return {
    db,
    get closed() {
      return state.closed;
    },
    get rows() {
      return state.rows;
    },
  };
}

function makeSqlite(db: ExpoSqliteDatabase): ExpoSqliteLike {
  return {
    openDatabaseAsync: async () => db,
  };
}

/** Mirror SQL LIKE semantics — only % wildcard is used by the backend. */
function likeToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + escaped.replace(/%/g, '.*') + '$');
}

function makeEvent(sessionId = 's'): MonitorEvent {
  return {
    type: 'custom',
    timestamp: 0,
    wallTime: 0,
    sessionId,
    data: { x: 1 },
  };
}

function row(
  priority: EventPriority,
  insertedAt: number,
  size = 100,
): StoredEventRow {
  return {
    id: 0,
    priority,
    event: makeEvent(`session-${insertedAt}`),
    sizeBytes: size,
    insertedAt,
  };
}

describe('SqliteEventStoreBackend', () => {
  it('creates schema on init and closes cleanly', async () => {
    const fake = makeFakeDb();
    const backend = new SqliteEventStoreBackend({
      sqlite: makeSqlite(fake.db),
    });
    await backend.init();
    await backend.close();
    expect(fake.closed).toBe(true);
  });

  it('throws if used before init', async () => {
    const fake = makeFakeDb();
    const backend = new SqliteEventStoreBackend({
      sqlite: makeSqlite(fake.db),
    });
    await expect(backend.insert(row('normal', 1))).rejects.toThrow(/before init/);
  });

  it('inserts and drains by priority, oldest first', async () => {
    const fake = makeFakeDb();
    const backend = new SqliteEventStoreBackend({
      sqlite: makeSqlite(fake.db),
    });
    await backend.init();
    await backend.insert(row('normal', 1));
    await backend.insert(row('normal', 2));
    await backend.insert(row('critical', 3));
    const normals = await backend.drain('normal', 10);
    expect(normals.map((r) => r.insertedAt)).toEqual([1, 2]);
    expect(await backend.count()).toBe(1);
  });

  it('drainAll returns highest priority first', async () => {
    const fake = makeFakeDb();
    const backend = new SqliteEventStoreBackend({
      sqlite: makeSqlite(fake.db),
    });
    await backend.init();
    await backend.insert(row('low', 1));
    await backend.insert(row('normal', 2));
    await backend.insert(row('critical', 3));
    await backend.insert(row('high', 4));
    const all = await backend.drainAll(10);
    expect(all.map((r) => r.priority)).toEqual([
      'critical',
      'high',
      'normal',
      'low',
    ]);
  });

  it('evictLRUPreservingCritical never touches critical rows', async () => {
    const fake = makeFakeDb();
    const backend = new SqliteEventStoreBackend({
      sqlite: makeSqlite(fake.db),
    });
    await backend.init();
    await backend.insert(row('critical', 1, 500));
    await backend.insert(row('low', 2, 500));
    await backend.insert(row('normal', 3, 500));
    const removed = await backend.evictLRUPreservingCritical(1);
    expect(removed).toBe(2);
    expect(await backend.count()).toBe(1);
    const remaining = await backend.drainAll(10);
    expect(remaining[0]?.priority).toBe('critical');
  });

  it('deleteOlderThan removes only older rows', async () => {
    const fake = makeFakeDb();
    const backend = new SqliteEventStoreBackend({
      sqlite: makeSqlite(fake.db),
    });
    await backend.init();
    await backend.insert(row('normal', 100));
    await backend.insert(row('normal', 200));
    await backend.insert(row('normal', 300));
    const removed = await backend.deleteOlderThan(250);
    expect(removed).toBe(2);
    expect(await backend.count()).toBe(1);
  });

  it('insertSync uses runSync when available', async () => {
    const fake = makeFakeDb();
    let syncCalls = 0;
    const db = {
      ...fake.db,
      runSync: (sql: string, params: unknown[] = []) => {
        syncCalls++;
        void fake.db.runAsync(sql, params);
        return { lastInsertRowId: 0, changes: 1 };
      },
    };
    const backend = new SqliteEventStoreBackend({
      sqlite: makeSqlite(db as ExpoSqliteDatabase),
    });
    await backend.init();
    backend.insertSync(row('critical', 1));
    expect(syncCalls).toBe(1);
  });

  describe('findByUserId / deleteByUserId (DSAR)', () => {
    function rowWithUser(userId: string | null, insertedAt: number): StoredEventRow {
      return {
        id: 0,
        priority: 'normal',
        event: {
          type: 'custom',
          timestamp: 0,
          wallTime: 0,
          sessionId: 's',
          data: {},
          // Attach enriched context inline — same shape the pipeline emits.
          ...({ context: { userId } } as unknown as Record<string, unknown>),
        } as MonitorEvent,
        sizeBytes: 100,
        insertedAt,
      };
    }

    it('findByUserId returns LIKE-matched rows', async () => {
      const fake = makeFakeDb();
      const backend = new SqliteEventStoreBackend({
        sqlite: makeSqlite(fake.db),
      });
      await backend.init();
      await backend.insert(rowWithUser('alice', 1));
      await backend.insert(rowWithUser('bob', 2));
      await backend.insert(rowWithUser('alice', 3));
      const matches = await backend.findByUserId('alice', 10);
      expect(matches).toHaveLength(2);
    });

    it('findByUserId respects limit', async () => {
      const fake = makeFakeDb();
      const backend = new SqliteEventStoreBackend({
        sqlite: makeSqlite(fake.db),
      });
      await backend.init();
      for (let i = 0; i < 5; i++) await backend.insert(rowWithUser('x', i));
      const matches = await backend.findByUserId('x', 2);
      expect(matches).toHaveLength(2);
    });

    it('deleteByUserId removes LIKE-matched rows', async () => {
      const fake = makeFakeDb();
      const backend = new SqliteEventStoreBackend({
        sqlite: makeSqlite(fake.db),
      });
      await backend.init();
      await backend.insert(rowWithUser('alice', 1));
      await backend.insert(rowWithUser('bob', 2));
      await backend.insert(rowWithUser('alice', 3));
      const removed = await backend.deleteByUserId('alice');
      expect(removed).toBe(2);
      expect(await backend.count()).toBe(1);
    });

    it('findByUserId with distinct similar ids does not cross-match', async () => {
      const fake = makeFakeDb();
      const backend = new SqliteEventStoreBackend({
        sqlite: makeSqlite(fake.db),
      });
      await backend.init();
      // alice42 should NOT match when searching for alice (JSON.stringify
      // quotes the user id so 'alice' and 'alice42' serialize to distinct
      // substrings "alice" vs "alice42").
      await backend.insert(rowWithUser('alice', 1));
      await backend.insert(rowWithUser('alice42', 2));
      const alice = await backend.findByUserId('alice', 10);
      expect(alice).toHaveLength(1);
    });
  });
});
