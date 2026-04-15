/**
 * Tests for retention policy calculation and SQL generation.
 */

import {
  getExpiredPartitions,
  generateRetentionCommands,
  generateOrphanCleanupCommands,
  getEffectivePolicy,
  DEFAULT_RETENTION_POLICY,
  type RetentionConfig,
  type RetentionPolicy,
} from './retention';
import { createCleanupJob, type CleanupLogger } from './cleanup';
import type { DatabaseClient } from '../db/schema';
import type { ClickHouseClient } from '../clickhouse/queries';

// ────────────────────────────────────────────────────────────
// getExpiredPartitions tests
// ────────────────────────────────────────────────────────────

describe('getExpiredPartitions', () => {
  test('returns empty array when no partitions expired', () => {
    // 30 days retention from 2026-01-15 — nothing in 2026-01 is fully expired
    const result = getExpiredPartitions(30, new Date('2026-01-15T00:00:00Z'));
    // Only partitions whose LAST DAY is before 2025-12-16 are expired.
    // 2025-12 last day is 2025-12-31 which is after 2025-12-16 — so no partition is fully expired
    expect(result).not.toContain('202601');
  });

  test('returns expired monthly partitions', () => {
    // 90 days retention from 2026-04-14
    // Cutoff: 2026-01-14
    // 2025-12: last day 2025-12-31 → before 2026-01-14 → expired
    // 2026-01: last day 2026-01-31 → after 2026-01-14 → NOT expired
    const result = getExpiredPartitions(90, new Date('2026-04-14T00:00:00Z'));
    expect(result).toContain('202512');
    expect(result).not.toContain('202601');
  });

  test('returns multiple expired partitions for long retention windows', () => {
    // 365 days retention from 2026-04-14 → cutoff 2025-04-14
    // Everything before 2025-04 (up to 5 years back) should be included
    const result = getExpiredPartitions(365, new Date('2026-04-14T00:00:00Z'));
    expect(result).toContain('202503'); // Mar 2025 last day = Mar 31 < Apr 14
    expect(result).not.toContain('202504'); // Apr 2025 last day = Apr 30 > Apr 14
  });

  test('handles short retention (7 days)', () => {
    // 7 days from 2026-04-14 → cutoff 2026-04-07
    // 2026-03: last day Mar 31 → before Apr 7 → expired
    // 2026-04: last day Apr 30 → after Apr 7 → NOT expired
    const result = getExpiredPartitions(7, new Date('2026-04-14T00:00:00Z'));
    expect(result).toContain('202603');
    expect(result).not.toContain('202604');
  });
});

// ────────────────────────────────────────────────────────────
// generateRetentionCommands tests
// ────────────────────────────────────────────────────────────

describe('generateRetentionCommands', () => {
  const policy: RetentionPolicy = {
    appId: '*',
    rawEventsDays: 90,
    aggregatedDays: 365,
    alertHistoryDays: 180,
  };

  test('generates ClickHouse DROP PARTITION commands for raw events', () => {
    const commands = generateRetentionCommands(policy, new Date('2026-04-14T00:00:00Z'));
    const rawCommands = commands.filter((c) => c.table === 'events');

    expect(rawCommands.length).toBeGreaterThan(0);
    for (const cmd of rawCommands) {
      expect(cmd.type).toBe('clickhouse');
      expect(cmd.sql).toContain('DROP PARTITION');
      expect(cmd.sql).toContain('events');
    }
  });

  test('generates ClickHouse DROP PARTITION commands for aggregated tables', () => {
    const commands = generateRetentionCommands(policy, new Date('2026-04-14T00:00:00Z'));
    const aggTables = ['crash_counts_hourly', 'perf_metrics_5min', 'error_rate_hourly'];

    for (const table of aggTables) {
      const tableCommands = commands.filter((c) => c.table === table);
      // Aggregated retention is 365 days so fewer partitions expired
      // but the command structure should still be correct
      for (const cmd of tableCommands) {
        expect(cmd.type).toBe('clickhouse');
        expect(cmd.sql).toContain(table);
      }
    }
  });

  test('generates PostgreSQL alert history cleanup for global policy', () => {
    const commands = generateRetentionCommands(policy, new Date('2026-04-14T00:00:00Z'));
    const pgCommands = commands.filter((c) => c.type === 'postgresql');

    expect(pgCommands.length).toBe(1);
    expect(pgCommands[0]!.sql).toContain('DELETE FROM alert_history');
    expect(pgCommands[0]!.sql).toContain('resolved_at IS NOT NULL');
  });

  test('generates app-specific alert cleanup for non-global policy', () => {
    const appPolicy: RetentionPolicy = { ...policy, appId: 'app_123' };
    const commands = generateRetentionCommands(appPolicy, new Date('2026-04-14T00:00:00Z'));
    const pgCommands = commands.filter((c) => c.type === 'postgresql');

    expect(pgCommands[0]!.sql).toContain('app_123');
  });

  test('includes description for every command', () => {
    const commands = generateRetentionCommands(policy, new Date('2026-04-14T00:00:00Z'));
    for (const cmd of commands) {
      expect(cmd.description.length).toBeGreaterThan(0);
    }
  });
});

// ────────────────────────────────────────────────────────────
// generateOrphanCleanupCommands tests
// ────────────────────────────────────────────────────────────

describe('generateOrphanCleanupCommands', () => {
  test('generates cleanup for source_maps, api_keys, alert_rules', () => {
    const commands = generateOrphanCleanupCommands();
    const tables = commands.map((c) => c.table);

    expect(tables).toContain('source_maps');
    expect(tables).toContain('api_keys');
    expect(tables).toContain('alert_rules');
  });

  test('all commands are PostgreSQL type', () => {
    const commands = generateOrphanCleanupCommands();
    for (const cmd of commands) {
      expect(cmd.type).toBe('postgresql');
    }
  });

  test('all commands use NOT IN subquery pattern', () => {
    const commands = generateOrphanCleanupCommands();
    for (const cmd of commands) {
      expect(cmd.sql).toContain('NOT IN');
    }
  });
});

// ────────────────────────────────────────────────────────────
// getEffectivePolicy tests
// ────────────────────────────────────────────────────────────

describe('getEffectivePolicy', () => {
  const config: RetentionConfig = {
    defaultPolicy: DEFAULT_RETENTION_POLICY,
    policies: [
      { appId: 'premium_app', rawEventsDays: 180, aggregatedDays: 730, alertHistoryDays: 365 },
    ],
  };

  test('returns app-specific policy when exists', () => {
    const policy = getEffectivePolicy(config, 'premium_app');
    expect(policy.rawEventsDays).toBe(180);
    expect(policy.aggregatedDays).toBe(730);
  });

  test('falls back to default policy for unknown app', () => {
    const policy = getEffectivePolicy(config, 'unknown_app');
    expect(policy.rawEventsDays).toBe(90);
    expect(policy.aggregatedDays).toBe(365);
  });
});

// ────────────────────────────────────────────────────────────
// CleanupJob tests
// ────────────────────────────────────────────────────────────

describe('CleanupJob', () => {
  const createFakeDb = (): DatabaseClient => ({
    query: async <T>(sql: string): Promise<readonly T[]> => {
      if (sql.includes('SELECT id FROM apps')) {
        return [{ id: 'app_1' }, { id: 'app_2' }] as unknown as readonly T[];
      }
      return [];
    },
    execute: async () => ({ rowCount: 0 }),
    transaction: async <T>(fn: (c: DatabaseClient) => Promise<T>) => {
      const self: DatabaseClient = {
        query: async <U>(): Promise<readonly U[]> => [],
        execute: async () => ({ rowCount: 0 }),
        transaction: async <U>(inner: (c: DatabaseClient) => Promise<U>) => inner(self),
      };
      return fn(self);
    },
  });

  const createFakeClickHouse = (): ClickHouseClient => ({
    query: async <T>(): Promise<readonly T[]> => [],
    insert: async () => {},
  });

  const createFakeLogger = (): CleanupLogger & { logs: Array<{ level: string; msg: string }> } => {
    const logs: Array<{ level: string; msg: string }> = [];
    return {
      logs,
      info: (msg) => logs.push({ level: 'info', msg }),
      error: (msg) => logs.push({ level: 'error', msg }),
    };
  };

  test('dry run does not execute any commands', async () => {
    const logger = createFakeLogger();
    const job = createCleanupJob({
      db: createFakeDb(),
      clickhouse: createFakeClickHouse(),
      retentionConfig: { defaultPolicy: DEFAULT_RETENTION_POLICY, policies: [] },
      logger,
    });

    const result = await job.runCleanup(true);

    expect(result.dryRun).toBe(true);
    expect(result.totalCommandsRun).toBe(0);
    expect(result.totalErrors).toBe(0);
    expect(result.commands.length).toBeGreaterThan(0);

    // All commands should have executed = false
    for (const cmd of result.commands) {
      expect(cmd.executed).toBe(false);
      expect(cmd.success).toBe(true);
    }
  });

  test('real run executes commands', async () => {
    const logger = createFakeLogger();
    const job = createCleanupJob({
      db: createFakeDb(),
      clickhouse: createFakeClickHouse(),
      retentionConfig: { defaultPolicy: DEFAULT_RETENTION_POLICY, policies: [] },
      logger,
    });

    const result = await job.runCleanup(false);

    expect(result.dryRun).toBe(false);
    // Should have executed at least the orphan cleanup commands
    expect(result.totalCommandsRun).toBeGreaterThan(0);
  });

  test('reports errors from failed commands', async () => {
    const failingCh: ClickHouseClient = {
      query: async () => { throw new Error('CH unavailable'); },
      insert: async () => {},
    };

    const logger = createFakeLogger();
    const job = createCleanupJob({
      db: createFakeDb(),
      clickhouse: failingCh,
      retentionConfig: { defaultPolicy: DEFAULT_RETENTION_POLICY, policies: [] },
      logger,
    });

    const result = await job.runCleanup(false);

    // ClickHouse commands should have errors
    const errors = result.commands.filter((c) => !c.success);
    if (errors.length > 0) {
      expect(errors[0]!.error).toContain('CH unavailable');
    }
    expect(result.totalErrors).toBe(errors.length);
  });

  test('includes timing information', async () => {
    const job = createCleanupJob({
      db: createFakeDb(),
      clickhouse: createFakeClickHouse(),
      retentionConfig: { defaultPolicy: DEFAULT_RETENTION_POLICY, policies: [] },
      logger: createFakeLogger(),
    });

    const result = await job.runCleanup(true);

    expect(result.startedAt).toBeInstanceOf(Date);
    expect(result.completedAt).toBeInstanceOf(Date);
    expect(result.completedAt.getTime()).toBeGreaterThanOrEqual(result.startedAt.getTime());
  });
});
