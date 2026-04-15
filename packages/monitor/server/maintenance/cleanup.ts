/**
 * Scheduled cleanup job interface.
 * Runs retention policies and orphan cleanup.
 */

import type { DatabaseClient } from '../db/schema';
import type { ClickHouseClient } from '../clickhouse/queries';
import {
  generateRetentionCommands,
  generateOrphanCleanupCommands,
  getEffectivePolicy,
  type RetentionConfig,
  type RetentionCommand,
} from './retention';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface CleanupResult {
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly dryRun: boolean;
  readonly commands: readonly CommandResult[];
  readonly totalCommandsRun: number;
  readonly totalErrors: number;
}

export interface CommandResult {
  readonly command: RetentionCommand;
  readonly executed: boolean;
  readonly success: boolean;
  readonly error?: string;
  readonly durationMs: number;
}

export interface CleanupLogger {
  info(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

// ────────────────────────────────────────────────────────────
// Cleanup job
// ────────────────────────────────────────────────────────────

export interface CleanupJob {
  runCleanup(dryRun: boolean): Promise<CleanupResult>;
}

interface AppRow {
  readonly id: string;
}

export const createCleanupJob = (deps: {
  readonly db: DatabaseClient;
  readonly clickhouse: ClickHouseClient;
  readonly retentionConfig: RetentionConfig;
  readonly logger: CleanupLogger;
}): CleanupJob => {
  const executeCommand = async (
    command: RetentionCommand,
    dryRun: boolean,
  ): Promise<CommandResult> => {
    const start = Date.now();

    if (dryRun) {
      deps.logger.info(`[DRY RUN] Would execute: ${command.description}`, {
        sql: command.sql,
        table: command.table,
        type: command.type,
      });
      return {
        command,
        executed: false,
        success: true,
        durationMs: Date.now() - start,
      };
    }

    try {
      if (command.type === 'clickhouse') {
        await deps.clickhouse.query(command.sql, {});
      } else {
        await deps.db.execute(command.sql);
      }

      deps.logger.info(`Executed: ${command.description}`, {
        table: command.table,
        durationMs: Date.now() - start,
      });

      return {
        command,
        executed: true,
        success: true,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      deps.logger.error(`Failed: ${command.description}`, { error, sql: command.sql });

      return {
        command,
        executed: true,
        success: false,
        error,
        durationMs: Date.now() - start,
      };
    }
  };

  const runCleanup = async (dryRun: boolean): Promise<CleanupResult> => {
    const startedAt = new Date();
    const commandResults: CommandResult[] = [];
    const referenceDate = new Date();

    deps.logger.info(`Starting cleanup job (dryRun: ${dryRun})`);

    // 1. Get all registered apps
    const apps = await deps.db.query<AppRow>('SELECT id FROM apps', []);

    // 2. Generate and execute retention commands per app
    for (const app of apps) {
      const policy = getEffectivePolicy(deps.retentionConfig, app.id);
      const commands = generateRetentionCommands(policy, referenceDate);

      for (const cmd of commands) {
        const result = await executeCommand(cmd, dryRun);
        commandResults.push(result);
      }
    }

    // 3. Run default policy for global retention (not app-specific ClickHouse data)
    const globalCommands = generateRetentionCommands(
      deps.retentionConfig.defaultPolicy,
      referenceDate,
    );
    for (const cmd of globalCommands) {
      // Skip if already covered by app-specific commands
      const alreadyCovered = commandResults.some(
        (r) => r.command.sql === cmd.sql,
      );
      if (!alreadyCovered) {
        const result = await executeCommand(cmd, dryRun);
        commandResults.push(result);
      }
    }

    // 4. Orphan cleanup (PostgreSQL)
    const orphanCommands = generateOrphanCleanupCommands();
    for (const cmd of orphanCommands) {
      const result = await executeCommand(cmd, dryRun);
      commandResults.push(result);
    }

    const completedAt = new Date();

    const summary: CleanupResult = {
      startedAt,
      completedAt,
      dryRun,
      commands: commandResults,
      totalCommandsRun: commandResults.filter((r) => r.executed).length,
      totalErrors: commandResults.filter((r) => !r.success).length,
    };

    deps.logger.info('Cleanup job completed', {
      dryRun,
      totalCommands: commandResults.length,
      executed: summary.totalCommandsRun,
      errors: summary.totalErrors,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    });

    return summary;
  };

  return { runCleanup };
};
