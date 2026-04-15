/**
 * Tests for PatternStore and sync logic with a fake DB client.
 */

import { PatternStore, type StoredPattern, type NewStoredPattern } from './store';
import { syncPatterns, fetchServerPatterns, type LocalPattern } from './sync';
import type { DatabaseClient } from '../db/schema';

// ────────────────────────────────────────────────────────────
// Fake DB client
// ────────────────────────────────────────────────────────────

interface FakeRow {
  id: string;
  app_id: string;
  pattern_type: string;
  pattern_data: string;
  confidence: number;
  sample_count: number;
  created_at: string;
  updated_at: string;
}

function createFakeDb(): DatabaseClient & { rows: FakeRow[] } {
  let nextId = 1;
  const rows: FakeRow[] = [];

  const db: DatabaseClient & { rows: FakeRow[] } = {
    rows,

    async query<T>(sql: string, params?: readonly unknown[]): Promise<readonly T[]> {
      const now = new Date().toISOString();

      if (sql.includes('INSERT INTO patterns')) {
        const existing = rows.find(
          (r) => r.app_id === params?.[0] && r.pattern_type === params?.[1],
        );

        if (sql.includes('ON CONFLICT') && existing) {
          // Upsert — higher confidence wins
          const newConfidence = params?.[3] as number;
          if (newConfidence > existing.confidence) {
            existing.confidence = newConfidence;
            existing.sample_count = params?.[4] as number;
            existing.pattern_data = params?.[2] as string;
          } else {
            existing.confidence = Math.max(existing.confidence, newConfidence);
            existing.sample_count = params?.[4] as number;
          }
          existing.updated_at = now;
          return [{ ...existing }] as unknown as readonly T[];
        }

        const row: FakeRow = {
          id: `pat_${nextId++}`,
          app_id: params?.[0] as string,
          pattern_type: params?.[1] as string,
          pattern_data: params?.[2] as string,
          confidence: params?.[3] as number,
          sample_count: params?.[4] as number,
          created_at: now,
          updated_at: now,
        };
        rows.push(row);
        return [{ ...row }] as unknown as readonly T[];
      }

      if (sql.includes('SELECT') && sql.includes('WHERE id')) {
        const id = params?.[0] as string;
        const found = rows.find((r) => r.id === id);
        return found ? [{ ...found }] as unknown as readonly T[] : [];
      }

      if (sql.includes('SELECT')) {
        let filtered = [...rows];
        if (params && params.length > 0) {
          // Simple filter by params in order they appear in conditions
          let paramIdx = 0;
          if (sql.includes('app_id')) {
            const appId = params[paramIdx++] as string;
            filtered = filtered.filter((r) => r.app_id === appId);
          }
          if (sql.includes('pattern_type') && paramIdx < params.length) {
            const pt = params[paramIdx++] as string;
            filtered = filtered.filter((r) => r.pattern_type === pt);
          }
          if (sql.includes('confidence') && paramIdx < params.length) {
            const mc = params[paramIdx] as number;
            filtered = filtered.filter((r) => r.confidence >= mc);
          }
        }
        return filtered.map((r) => ({ ...r })) as unknown as readonly T[];
      }

      if (sql.includes('UPDATE') && params) {
        // Find last param as the id
        const id = params[params.length - 1] as string;
        const row = rows.find((r) => r.id === id);
        if (!row) return [] as unknown as readonly T[];

        // Apply updates from SET clauses
        let pIdx = 0;
        if (sql.includes('confidence =') && pIdx < params.length - 1) {
          row.confidence = params[pIdx++] as number;
        }
        if (sql.includes('sample_count =') && pIdx < params.length - 1) {
          row.sample_count = params[pIdx++] as number;
        }
        if (sql.includes('pattern_data =') && pIdx < params.length - 1) {
          row.pattern_data = params[pIdx++] as string;
        }
        row.updated_at = now;
        return [{ ...row }] as unknown as readonly T[];
      }

      return [] as unknown as readonly T[];
    },

    async execute(sql: string, params?: readonly unknown[]): Promise<{ rowCount: number }> {
      if (sql.includes('DELETE')) {
        const id = params?.[0] as string;
        const idx = rows.findIndex((r) => r.id === id);
        if (idx >= 0) {
          rows.splice(idx, 1);
          return { rowCount: 1 };
        }
        return { rowCount: 0 };
      }
      return { rowCount: 0 };
    },

    async transaction<T>(fn: (client: DatabaseClient) => Promise<T>): Promise<T> {
      return fn(db);
    },
  };

  return db;
}

// ────────────────────────────────────────────────────────────
// PatternStore tests
// ────────────────────────────────────────────────────────────

describe('PatternStore', () => {
  test('create inserts and returns a pattern', async () => {
    const db = createFakeDb();
    const store = new PatternStore(db);

    const result = await store.create({
      appId: 'app_1',
      patternType: 'crash',
      patternData: { message: 'null pointer' },
      confidence: 0.85,
      sampleCount: 10,
    });

    expect(result.id).toBe('pat_1');
    expect(result.appId).toBe('app_1');
    expect(result.patternType).toBe('crash');
    expect(result.confidence).toBe(0.85);
    expect(result.sampleCount).toBe(10);
    expect(result.patternData).toEqual({ message: 'null pointer' });
  });

  test('findById returns null for missing pattern', async () => {
    const db = createFakeDb();
    const store = new PatternStore(db);
    const result = await store.findById('nonexistent');
    expect(result).toBeNull();
  });

  test('findById returns existing pattern', async () => {
    const db = createFakeDb();
    const store = new PatternStore(db);
    const created = await store.create({
      appId: 'app_1',
      patternType: 'memory',
      patternData: {},
      confidence: 0.5,
      sampleCount: 5,
    });
    const found = await store.findById(created.id);
    expect(found).not.toBeNull();
    expect(found!.patternType).toBe('memory');
  });

  test('findAll returns all patterns', async () => {
    const db = createFakeDb();
    const store = new PatternStore(db);
    await store.create({ appId: 'app_1', patternType: 'a', patternData: {}, confidence: 0.5, sampleCount: 1 });
    await store.create({ appId: 'app_1', patternType: 'b', patternData: {}, confidence: 0.7, sampleCount: 2 });

    const all = await store.findAll();
    expect(all).toHaveLength(2);
  });

  test('findAll filters by appId', async () => {
    const db = createFakeDb();
    const store = new PatternStore(db);
    await store.create({ appId: 'app_1', patternType: 'a', patternData: {}, confidence: 0.5, sampleCount: 1 });
    await store.create({ appId: 'app_2', patternType: 'b', patternData: {}, confidence: 0.7, sampleCount: 2 });

    const filtered = await store.findAll({ appId: 'app_1' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.appId).toBe('app_1');
  });

  test('update modifies fields and returns updated pattern', async () => {
    const db = createFakeDb();
    const store = new PatternStore(db);
    const created = await store.create({
      appId: 'app_1',
      patternType: 'perf',
      patternData: {},
      confidence: 0.5,
      sampleCount: 3,
    });
    const updated = await store.update(created.id, { confidence: 0.9, sampleCount: 20 });
    expect(updated).not.toBeNull();
    expect(updated!.confidence).toBe(0.9);
    expect(updated!.sampleCount).toBe(20);
  });

  test('update returns null for missing pattern', async () => {
    const db = createFakeDb();
    const store = new PatternStore(db);
    const result = await store.update('nope', { confidence: 0.5 });
    expect(result).toBeNull();
  });

  test('delete removes pattern and returns true', async () => {
    const db = createFakeDb();
    const store = new PatternStore(db);
    const created = await store.create({
      appId: 'app_1',
      patternType: 'x',
      patternData: {},
      confidence: 0.5,
      sampleCount: 1,
    });
    const deleted = await store.delete(created.id);
    expect(deleted).toBe(true);
    expect(db.rows).toHaveLength(0);
  });

  test('delete returns false for missing pattern', async () => {
    const db = createFakeDb();
    const store = new PatternStore(db);
    const deleted = await store.delete('nope');
    expect(deleted).toBe(false);
  });

  test('upsert creates when absent', async () => {
    const db = createFakeDb();
    const store = new PatternStore(db);
    const result = await store.upsert({
      appId: 'app_1',
      patternType: 'new',
      patternData: { foo: 1 },
      confidence: 0.6,
      sampleCount: 5,
    });
    expect(result.patternType).toBe('new');
    expect(db.rows).toHaveLength(1);
  });

  test('upsert updates when existing with higher confidence', async () => {
    const db = createFakeDb();
    const store = new PatternStore(db);
    await store.create({
      appId: 'app_1',
      patternType: 'dup',
      patternData: { old: true },
      confidence: 0.5,
      sampleCount: 3,
    });
    const result = await store.upsert({
      appId: 'app_1',
      patternType: 'dup',
      patternData: { new: true },
      confidence: 0.9,
      sampleCount: 10,
    });
    expect(result.confidence).toBe(0.9);
    expect(db.rows).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────
// Sync tests
// ────────────────────────────────────────────────────────────

describe('syncPatterns', () => {
  test('uploads new local patterns', async () => {
    const db = createFakeDb();
    const store = new PatternStore(db);

    const local: LocalPattern[] = [
      { patternType: 'crash', patternData: {}, confidence: 0.8, sampleCount: 5, updatedAt: Date.now() },
    ];

    const result = await syncPatterns('app_1', local, store);
    expect(result.uploaded).toBe(1);
    expect(result.downloaded).toBe(0);
    expect(result.merged).toBe(0);
    expect(db.rows).toHaveLength(1);
  });

  test('merges when local has higher confidence', async () => {
    const db = createFakeDb();
    const store = new PatternStore(db);

    await store.create({
      appId: 'app_1',
      patternType: 'crash',
      patternData: { old: true },
      confidence: 0.5,
      sampleCount: 3,
    });

    const local: LocalPattern[] = [
      { patternType: 'crash', patternData: { new: true }, confidence: 0.9, sampleCount: 20, updatedAt: Date.now() + 1000 },
    ];

    const result = await syncPatterns('app_1', local, store);
    expect(result.merged).toBe(1);
    expect(result.uploaded).toBe(0);
  });

  test('does not merge when server has higher confidence', async () => {
    const db = createFakeDb();
    const store = new PatternStore(db);

    await store.create({
      appId: 'app_1',
      patternType: 'crash',
      patternData: { server: true },
      confidence: 0.95,
      sampleCount: 50,
    });

    const local: LocalPattern[] = [
      { patternType: 'crash', patternData: { local: true }, confidence: 0.5, sampleCount: 3, updatedAt: 0 },
    ];

    const result = await syncPatterns('app_1', local, store);
    expect(result.merged).toBe(0);
  });

  test('counts server-only patterns as downloads', async () => {
    const db = createFakeDb();
    const store = new PatternStore(db);

    await store.create({
      appId: 'app_1',
      patternType: 'server-only',
      patternData: {},
      confidence: 0.7,
      sampleCount: 10,
    });

    const result = await syncPatterns('app_1', [], store);
    expect(result.downloaded).toBe(1);
  });
});

describe('fetchServerPatterns', () => {
  test('returns patterns as LocalPattern format', async () => {
    const db = createFakeDb();
    const store = new PatternStore(db);

    await store.create({
      appId: 'app_1',
      patternType: 'perf',
      patternData: { threshold: 100 },
      confidence: 0.8,
      sampleCount: 15,
    });

    const result = await fetchServerPatterns('app_1', store);
    expect(result).toHaveLength(1);
    expect(result[0]!.patternType).toBe('perf');
    expect(result[0]!.confidence).toBe(0.8);
    expect(typeof result[0]!.updatedAt).toBe('number');
  });
});
