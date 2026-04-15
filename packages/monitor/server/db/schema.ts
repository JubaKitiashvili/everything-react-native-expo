/**
 * TypeScript type definitions matching the PostgreSQL schema.
 * Pure interfaces — no ORM, no runtime dependencies.
 */

// ────────────────────────────────────────────────────────────
// Domain types
// ────────────────────────────────────────────────────────────

export type Platform = 'ios' | 'android' | 'web';

export type AlertOperator = '>' | '<' | '>=' | '<=' | '==' | 'change_pct';

export type AlertMetric =
  | 'crash_count'
  | 'crash_rate'
  | 'error_rate'
  | 'p95_startup'
  | 'p95_fps_drop'
  | 'new_fingerprint';

export type AlertChannel = 'slack' | 'webhook' | 'email';

export type ApiKeyScope = 'ingest' | 'read' | 'admin';

// ────────────────────────────────────────────────────────────
// Table row interfaces
// ────────────────────────────────────────────────────────────

export interface App {
  readonly id: string;
  readonly name: string;
  readonly bundleId: string;
  readonly platform: Platform;
  readonly createdAt: Date;
  readonly configJson: Record<string, unknown>;
}

export interface AppVersion {
  readonly id: string;
  readonly appId: string;
  readonly version: string;
  readonly buildNumber: string;
  readonly createdAt: Date;
}

export interface SourceMap {
  readonly id: string;
  readonly appVersionId: string;
  readonly platform: Platform;
  readonly bundleId: string;
  readonly mapUrl: string;
  readonly uploadedAt: Date;
}

export interface AlertRule {
  readonly id: string;
  readonly appId: string;
  readonly metric: AlertMetric;
  readonly operator: AlertOperator;
  readonly threshold: number;
  readonly windowSeconds: number;
  readonly channel: AlertChannel;
  readonly enabled: boolean;
  readonly cooldownSeconds: number;
  readonly createdAt: Date;
}

export interface AlertHistoryRecord {
  readonly id: string;
  readonly ruleId: string;
  readonly triggeredAt: Date;
  readonly resolvedAt: Date | null;
  readonly payloadJson: Record<string, unknown>;
}

export interface ApiKey {
  readonly id: string;
  readonly appId: string;
  readonly keyHash: string;
  readonly scopes: readonly ApiKeyScope[];
  readonly createdAt: Date;
  readonly lastUsedAt: Date | null;
}

// ────────────────────────────────────────────────────────────
// Database client interface (dependency injection)
// ────────────────────────────────────────────────────────────

export interface DatabaseClient {
  query<T>(sql: string, params?: readonly unknown[]): Promise<readonly T[]>;
  execute(sql: string, params?: readonly unknown[]): Promise<{ rowCount: number }>;
  transaction<T>(fn: (client: DatabaseClient) => Promise<T>): Promise<T>;
}

// ────────────────────────────────────────────────────────────
// Migration runner interface
// ────────────────────────────────────────────────────────────

export interface Migration {
  readonly name: string;
  up(client: DatabaseClient): Promise<void>;
  down(client: DatabaseClient): Promise<void>;
}

export interface MigrationRunner {
  /**
   * Apply all pending migrations in order.
   * Tracks applied migrations in _erne_migrations table.
   */
  migrate(client: DatabaseClient): Promise<readonly string[]>;

  /**
   * Roll back the most recent migration.
   */
  rollback(client: DatabaseClient): Promise<string | null>;

  /**
   * Return names of migrations that have been applied.
   */
  applied(client: DatabaseClient): Promise<readonly string[]>;

  /**
   * Return names of migrations that are pending.
   */
  pending(client: DatabaseClient): Promise<readonly string[]>;
}

// ────────────────────────────────────────────────────────────
// Insert/update parameter types (omit auto-generated fields)
// ────────────────────────────────────────────────────────────

export type NewApp = Omit<App, 'id' | 'createdAt'>;
export type NewAppVersion = Omit<AppVersion, 'id' | 'createdAt'>;
export type NewSourceMap = Omit<SourceMap, 'id' | 'uploadedAt'>;
export type NewAlertRule = Omit<AlertRule, 'id' | 'createdAt'>;
export type NewAlertHistory = Omit<AlertHistoryRecord, 'id' | 'resolvedAt'>;
export type NewApiKey = Omit<ApiKey, 'id' | 'createdAt' | 'lastUsedAt'>;
