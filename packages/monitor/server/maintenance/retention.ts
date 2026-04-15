/**
 * Data retention policies and SQL generation.
 * Generates ClickHouse DROP PARTITION commands for expired data
 * and PostgreSQL cleanup queries for orphaned records.
 */

// ────────────────────────────────────────────────────────────
// Retention policy types
// ────────────────────────────────────────────────────────────

export interface RetentionPolicy {
  /** App ID this policy applies to. '*' means global default. */
  readonly appId: string;
  /** Raw events retention in days. Default: 90. */
  readonly rawEventsDays: number;
  /** Aggregated data retention in days. Default: 365. */
  readonly aggregatedDays: number;
  /** Alert history retention in days. Default: 180. */
  readonly alertHistoryDays: number;
}

export interface RetentionConfig {
  readonly policies: readonly RetentionPolicy[];
  readonly defaultPolicy: RetentionPolicy;
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  appId: '*',
  rawEventsDays: 90,
  aggregatedDays: 365,
  alertHistoryDays: 180,
};

// ────────────────────────────────────────────────────────────
// Generated commands
// ────────────────────────────────────────────────────────────

export interface RetentionCommand {
  readonly type: 'clickhouse' | 'postgresql';
  readonly table: string;
  readonly sql: string;
  readonly description: string;
  readonly estimatedScope: string;
}

// ────────────────────────────────────────────────────────────
// Partition calculation
// ────────────────────────────────────────────────────────────

/**
 * Compute which YYYYMM partitions have fully expired
 * given a retention period in days from a reference date.
 */
export const getExpiredPartitions = (
  retentionDays: number,
  referenceDate: Date = new Date(),
): readonly string[] => {
  const cutoff = new Date(referenceDate);
  cutoff.setDate(cutoff.getDate() - retentionDays);

  // We only drop partitions that are FULLY expired.
  // A partition YYYYMM is fully expired if the last day of that month is before the cutoff.
  const partitions: string[] = [];

  // Go back up to 5 years
  const earliest = new Date(referenceDate);
  earliest.setFullYear(earliest.getFullYear() - 5);

  const current = new Date(earliest);
  current.setDate(1); // start of month

  while (current < cutoff) {
    // Last day of this month
    const lastDay = new Date(current.getFullYear(), current.getMonth() + 1, 0);

    if (lastDay < cutoff) {
      const yyyy = current.getFullYear();
      const mm = String(current.getMonth() + 1).padStart(2, '0');
      partitions.push(`${yyyy}${mm}`);
    }

    current.setMonth(current.getMonth() + 1);
  }

  return partitions;
};

// ────────────────────────────────────────────────────────────
// Command generation
// ────────────────────────────────────────────────────────────

/**
 * Generate retention cleanup commands for a given policy.
 */
export const generateRetentionCommands = (
  policy: RetentionPolicy,
  referenceDate: Date = new Date(),
): readonly RetentionCommand[] => {
  const commands: RetentionCommand[] = [];

  // ClickHouse raw events
  const rawPartitions = getExpiredPartitions(policy.rawEventsDays, referenceDate);
  for (const partition of rawPartitions) {
    commands.push({
      type: 'clickhouse',
      table: 'events',
      sql: `ALTER TABLE events DROP PARTITION '${partition}'`,
      description: `Drop raw events partition ${partition} (>${policy.rawEventsDays} days)`,
      estimatedScope: `events from ${partition.slice(0, 4)}-${partition.slice(4)}`,
    });
  }

  // ClickHouse aggregated tables
  const aggPartitions = getExpiredPartitions(policy.aggregatedDays, referenceDate);
  const aggTables = ['crash_counts_hourly', 'perf_metrics_5min', 'error_rate_hourly'];

  for (const table of aggTables) {
    for (const partition of aggPartitions) {
      commands.push({
        type: 'clickhouse',
        table,
        sql: `ALTER TABLE ${table} DROP PARTITION '${partition}'`,
        description: `Drop aggregated ${table} partition ${partition} (>${policy.aggregatedDays} days)`,
        estimatedScope: `${table} from ${partition.slice(0, 4)}-${partition.slice(4)}`,
      });
    }
  }

  // PostgreSQL alert history cleanup
  const alertCutoff = new Date(referenceDate);
  alertCutoff.setDate(alertCutoff.getDate() - policy.alertHistoryDays);
  const cutoffStr = alertCutoff.toISOString();

  if (policy.appId === '*') {
    commands.push({
      type: 'postgresql',
      table: 'alert_history',
      sql: `DELETE FROM alert_history WHERE triggered_at < '${cutoffStr}' AND resolved_at IS NOT NULL`,
      description: `Delete resolved alert history older than ${policy.alertHistoryDays} days`,
      estimatedScope: `all apps, before ${cutoffStr.split('T')[0]}`,
    });
  } else {
    commands.push({
      type: 'postgresql',
      table: 'alert_history',
      sql: `DELETE FROM alert_history WHERE rule_id IN (SELECT id FROM alert_rules WHERE app_id = '${policy.appId}') AND triggered_at < '${cutoffStr}' AND resolved_at IS NOT NULL`,
      description: `Delete resolved alert history for app ${policy.appId} older than ${policy.alertHistoryDays} days`,
      estimatedScope: `app ${policy.appId}, before ${cutoffStr.split('T')[0]}`,
    });
  }

  return commands;
};

/**
 * Generate PostgreSQL orphan cleanup commands.
 * Removes records that reference deleted parents.
 */
export const generateOrphanCleanupCommands = (): readonly RetentionCommand[] => [
  {
    type: 'postgresql',
    table: 'source_maps',
    sql: `DELETE FROM source_maps WHERE app_version_id NOT IN (SELECT id FROM app_versions)`,
    description: 'Delete orphaned source maps with no matching app version',
    estimatedScope: 'all orphaned source_maps',
  },
  {
    type: 'postgresql',
    table: 'api_keys',
    sql: `DELETE FROM api_keys WHERE app_id NOT IN (SELECT id FROM apps)`,
    description: 'Delete orphaned API keys with no matching app',
    estimatedScope: 'all orphaned api_keys',
  },
  {
    type: 'postgresql',
    table: 'alert_rules',
    sql: `DELETE FROM alert_rules WHERE app_id NOT IN (SELECT id FROM apps)`,
    description: 'Delete orphaned alert rules with no matching app',
    estimatedScope: 'all orphaned alert_rules',
  },
];

/**
 * Get the effective policy for an app.
 * Falls back to default if no app-specific policy exists.
 */
export const getEffectivePolicy = (
  config: RetentionConfig,
  appId: string,
): RetentionPolicy => {
  const specific = config.policies.find((p) => p.appId === appId);
  return specific ?? config.defaultPolicy;
};
