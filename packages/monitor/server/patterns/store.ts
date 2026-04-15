/**
 * Task 63 — PatternLibrary Server Persistence
 *
 * PostgreSQL store for patterns. CRUD operations via the DatabaseClient
 * interface so the store is fully testable without a real database.
 */

import type { DatabaseClient } from '../db/schema';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface StoredPattern {
  readonly id: string;
  readonly appId: string;
  readonly patternType: string;
  readonly patternData: Record<string, unknown>;
  readonly confidence: number;
  readonly sampleCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type NewStoredPattern = Omit<StoredPattern, 'id' | 'createdAt' | 'updatedAt'>;

export interface PatternFilter {
  readonly appId?: string;
  readonly patternType?: string;
  readonly minConfidence?: number;
}

// ────────────────────────────────────────────────────────────
// Row type (DB query result)
// ────────────────────────────────────────────────────────────

interface PatternRow {
  readonly id: string;
  readonly app_id: string;
  readonly pattern_type: string;
  readonly pattern_data: string;
  readonly confidence: number;
  readonly sample_count: number;
  readonly created_at: string;
  readonly updated_at: string;
}

function rowToPattern(row: PatternRow): StoredPattern {
  return {
    id: row.id,
    appId: row.app_id,
    patternType: row.pattern_type,
    patternData: JSON.parse(row.pattern_data) as Record<string, unknown>,
    confidence: row.confidence,
    sampleCount: row.sample_count,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// ────────────────────────────────────────────────────────────
// Store
// ────────────────────────────────────────────────────────────

export class PatternStore {
  constructor(private readonly db: DatabaseClient) {}

  async create(pattern: NewStoredPattern): Promise<StoredPattern> {
    const rows = await this.db.query<PatternRow>(
      `INSERT INTO patterns (app_id, pattern_type, pattern_data, confidence, sample_count)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        pattern.appId,
        pattern.patternType,
        JSON.stringify(pattern.patternData),
        pattern.confidence,
        pattern.sampleCount,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error('Insert returned no rows');
    return rowToPattern(row);
  }

  async findById(id: string): Promise<StoredPattern | null> {
    const rows = await this.db.query<PatternRow>(
      'SELECT * FROM patterns WHERE id = $1',
      [id],
    );
    const row = rows[0];
    return row ? rowToPattern(row) : null;
  }

  async findAll(filter?: PatternFilter): Promise<readonly StoredPattern[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filter?.appId) {
      conditions.push(`app_id = $${idx++}`);
      params.push(filter.appId);
    }
    if (filter?.patternType) {
      conditions.push(`pattern_type = $${idx++}`);
      params.push(filter.patternType);
    }
    if (filter?.minConfidence !== undefined) {
      conditions.push(`confidence >= $${idx++}`);
      params.push(filter.minConfidence);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await this.db.query<PatternRow>(
      `SELECT * FROM patterns ${where} ORDER BY updated_at DESC`,
      params,
    );
    return rows.map(rowToPattern);
  }

  async update(
    id: string,
    updates: { confidence?: number; sampleCount?: number; patternData?: Record<string, unknown> },
  ): Promise<StoredPattern | null> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let idx = 1;

    if (updates.confidence !== undefined) {
      setClauses.push(`confidence = $${idx++}`);
      params.push(updates.confidence);
    }
    if (updates.sampleCount !== undefined) {
      setClauses.push(`sample_count = $${idx++}`);
      params.push(updates.sampleCount);
    }
    if (updates.patternData !== undefined) {
      setClauses.push(`pattern_data = $${idx++}`);
      params.push(JSON.stringify(updates.patternData));
    }

    params.push(id);
    const rows = await this.db.query<PatternRow>(
      `UPDATE patterns SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );
    const row = rows[0];
    return row ? rowToPattern(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM patterns WHERE id = $1',
      [id],
    );
    return result.rowCount > 0;
  }

  async upsert(pattern: NewStoredPattern): Promise<StoredPattern> {
    const rows = await this.db.query<PatternRow>(
      `INSERT INTO patterns (app_id, pattern_type, pattern_data, confidence, sample_count)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (app_id, pattern_type)
       DO UPDATE SET
         pattern_data = CASE WHEN EXCLUDED.confidence > patterns.confidence THEN EXCLUDED.pattern_data ELSE patterns.pattern_data END,
         confidence = GREATEST(EXCLUDED.confidence, patterns.confidence),
         sample_count = EXCLUDED.sample_count,
         updated_at = NOW()
       RETURNING *`,
      [
        pattern.appId,
        pattern.patternType,
        JSON.stringify(pattern.patternData),
        pattern.confidence,
        pattern.sampleCount,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error('Upsert returned no rows');
    return rowToPattern(row);
  }
}
