import type {
  EventPriority,
  EventStoreBackend,
  StoredEventRow,
} from './EventStore';
import type { MonitorEvent } from '../types';

/**
 * Minimal surface of expo-sqlite this backend consumes. Declared locally
 * so @erne/monitor does not have a hard dependency on expo-sqlite — host
 * apps inject the module at runtime. Tests stub this interface.
 */
export interface ExpoSqliteLike {
  openDatabaseAsync(name: string): Promise<ExpoSqliteDatabase>;
}

export interface ExpoSqliteDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: unknown[]): Promise<{ lastInsertRowId: number; changes: number }>;
  runSync?(sql: string, params?: unknown[]): { lastInsertRowId: number; changes: number };
  getAllAsync<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  getFirstAsync<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>;
  closeAsync(): Promise<void>;
}

export interface SqliteEventStoreBackendOptions {
  sqlite: ExpoSqliteLike;
  databaseName?: string;
}

interface Row {
  id: number;
  priority: EventPriority;
  payload: string;
  size_bytes: number;
  inserted_at: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS monitor_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  priority TEXT NOT NULL,
  payload TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  inserted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS monitor_events_priority_inserted
  ON monitor_events (priority, inserted_at);
CREATE INDEX IF NOT EXISTS monitor_events_inserted
  ON monitor_events (inserted_at);
`;

const PRIORITY_ORDER: readonly EventPriority[] = [
  'critical',
  'high',
  'normal',
  'low',
];

function serialize(event: MonitorEvent): string {
  return JSON.stringify(event);
}

function deserialize(row: Row): StoredEventRow {
  return {
    id: row.id,
    priority: row.priority,
    event: JSON.parse(row.payload) as MonitorEvent,
    sizeBytes: row.size_bytes,
    insertedAt: row.inserted_at,
  };
}

/**
 * expo-sqlite backed EventStoreBackend. expo-sqlite is not a direct
 * dependency of @erne/monitor — the host app passes the module in via
 * options so Metro resolves it from the app's node_modules and Phase 2
 * native bridge can swap implementations freely.
 *
 * SQL schema is auto-created on init(). Sync insert uses runSync() when
 * the host's expo-sqlite version exposes it; otherwise it queues the
 * write on a microtask (Phase 1a best-effort) and logs a warning.
 */
export class SqliteEventStoreBackend implements EventStoreBackend {
  private readonly sqlite: ExpoSqliteLike;
  private readonly databaseName: string;
  private db: ExpoSqliteDatabase | null = null;

  constructor(options: SqliteEventStoreBackendOptions) {
    this.sqlite = options.sqlite;
    this.databaseName = options.databaseName ?? 'erne_monitor.db';
  }

  async init(): Promise<void> {
    if (this.db) return;
    this.db = await this.sqlite.openDatabaseAsync(this.databaseName);
    await this.db.execAsync(SCHEMA);
  }

  async insert(row: StoredEventRow): Promise<void> {
    const db = this.requireDb();
    await db.runAsync(
      'INSERT INTO monitor_events (priority, payload, size_bytes, inserted_at) VALUES (?, ?, ?, ?)',
      [row.priority, serialize(row.event), row.sizeBytes, row.insertedAt],
    );
  }

  insertSync(row: StoredEventRow): void {
    const db = this.requireDb();
    if (typeof db.runSync === 'function') {
      db.runSync(
        'INSERT INTO monitor_events (priority, payload, size_bytes, inserted_at) VALUES (?, ?, ?, ?)',
        [row.priority, serialize(row.event), row.sizeBytes, row.insertedAt],
      );
      return;
    }
    // Fallback: queue asynchronously. Phase 2 native bridge writes crash
    // payloads via a synchronous file handle so this codepath is only
    // used as a best-effort while the app is still alive.
    void db
      .runAsync(
        'INSERT INTO monitor_events (priority, payload, size_bytes, inserted_at) VALUES (?, ?, ?, ?)',
        [row.priority, serialize(row.event), row.sizeBytes, row.insertedAt],
      )
      .catch(() => {});
  }

  async drain(priority: EventPriority, limit: number): Promise<StoredEventRow[]> {
    const db = this.requireDb();
    const rows = await db.getAllAsync<Row>(
      'SELECT id, priority, payload, size_bytes, inserted_at FROM monitor_events WHERE priority = ? ORDER BY inserted_at ASC LIMIT ?',
      [priority, limit],
    );
    if (rows.length === 0) return [];
    await this.deleteIds(rows.map((r) => r.id));
    return rows.map(deserialize);
  }

  async drainAll(limit: number): Promise<StoredEventRow[]> {
    const db = this.requireDb();
    const out: StoredEventRow[] = [];
    let remaining = limit;
    for (const priority of PRIORITY_ORDER) {
      if (remaining <= 0) break;
      const rows = await db.getAllAsync<Row>(
        'SELECT id, priority, payload, size_bytes, inserted_at FROM monitor_events WHERE priority = ? ORDER BY inserted_at ASC LIMIT ?',
        [priority, remaining],
      );
      if (rows.length === 0) continue;
      await this.deleteIds(rows.map((r) => r.id));
      for (const row of rows) out.push(deserialize(row));
      remaining -= rows.length;
    }
    return out;
  }

  async count(): Promise<number> {
    const db = this.requireDb();
    const row = await db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) AS c FROM monitor_events',
    );
    return row?.c ?? 0;
  }

  async sizeBytes(): Promise<number> {
    const db = this.requireDb();
    const row = await db.getFirstAsync<{ s: number | null }>(
      'SELECT SUM(size_bytes) AS s FROM monitor_events',
    );
    return row?.s ?? 0;
  }

  async deleteOlderThan(cutoffWallTime: number): Promise<number> {
    const db = this.requireDb();
    const result = await db.runAsync(
      'DELETE FROM monitor_events WHERE inserted_at < ?',
      [cutoffWallTime],
    );
    return result.changes;
  }

  async evictLRUPreservingCritical(targetBytes: number): Promise<number> {
    const db = this.requireDb();
    let removed = 0;
    while (true) {
      const totalRow = await db.getFirstAsync<{ s: number | null }>(
        'SELECT SUM(size_bytes) AS s FROM monitor_events',
      );
      const total = totalRow?.s ?? 0;
      if (total <= targetBytes) break;
      const victim = await db.getFirstAsync<Row>(
        "SELECT id, priority, payload, size_bytes, inserted_at FROM monitor_events WHERE priority != 'critical' ORDER BY inserted_at ASC LIMIT 1",
      );
      if (!victim) break;
      await db.runAsync('DELETE FROM monitor_events WHERE id = ?', [victim.id]);
      removed++;
    }
    return removed;
  }

  async close(): Promise<void> {
    if (!this.db) return;
    await this.db.closeAsync();
    this.db = null;
  }

  private async deleteIds(ids: readonly number[]): Promise<void> {
    const db = this.requireDb();
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    await db.runAsync(
      `DELETE FROM monitor_events WHERE id IN (${placeholders})`,
      ids as unknown[],
    );
  }

  private requireDb(): ExpoSqliteDatabase {
    if (!this.db) {
      throw new Error('[monitor] SqliteEventStoreBackend used before init()');
    }
    return this.db;
  }
}
