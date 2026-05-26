export {
  DashboardStore,
  defaultDashboardDbPath,
  DEFAULT_MIGRATIONS,
} from './storage/sqliteStore.js';
export type { DashboardStoreOptions, Migration } from './storage/sqliteStore.js';
export type { IMonitorStore } from './storage/IMonitorStore.js';
export type {
  AiActionListFilter,
  AiActionOutcome,
  AiActionRecord,
  AlertFiringRecord,
  AlertHistoryListFilter,
  AlertRuleRecord,
  BugReportListFilter,
  BugReportRecord,
  BugReportStatus,
  CrashGroupListFilter,
  CrashGroupRecord,
  CrashGroupStatus,
  EventListFilter,
  EventRecord,
  SessionRecord,
  Severity,
} from './storage/types.js';
export {
  listAiActions,
  parseListFilter as parseAiActionListFilter,
  recordAiAction,
} from './audit/aiActions.js';
export type {
  AiActionListResponse,
  RecordAiActionFailure,
  RecordAiActionInputError,
  RecordAiActionResult,
} from './audit/aiActions.js';
export { createDashboardServer, startDashboardServer } from './server.js';
export type { DashboardServerHandle, DashboardServerOptions } from './server.js';
export {
  signPayload,
  verifySignature,
  X_ERNE_SIGNATURE_HEADER,
  SIGNATURE_PREFIX,
} from './webhooks/sign.js';
export {
  DEFAULT_CSP,
  BASE_SECURITY_HEADERS,
  applyBaseSecurityHeaders,
  applyHtmlSecurityHeaders,
  resolveCsp,
} from './security/headers.js';
export type { SecurityHeaderConfig } from './security/headers.js';
export {
  PrometheusRegistry,
  PROMETHEUS_CONTENT_TYPE,
} from './metrics/prometheus.js';
export type { MetricType, MetricSample } from './metrics/prometheus.js';
export { IngestWebSocketHandler, INGEST_PATH, SUBSCRIBE_PATH } from './ingest/wsHandler.js';
export type {
  IngestWsHandlerOptions,
  IngestSessionPayload,
  IngestEventPayload,
  IngestStats,
} from './ingest/wsHandler.js';
export { computeFallbackFingerprint, normaliseStack, djb2 } from './ingest/fingerprint.js';
export {
  RetentionPurgeJob,
  DEFAULT_RETENTION_DAYS,
  DEFAULT_PURGE_INTERVAL_MS,
} from './jobs/retention.js';
export type {
  RetentionPurgeJobOptions,
  RetentionPurgeResult,
  RetentionPurgeLogEntry,
} from './jobs/retention.js';
export {
  backupStore,
  restoreStore,
  parseBackupFile,
  runBackupCli,
  BACKUP_FORMAT_VERSION,
} from './backup/backup.js';
export type {
  BackupFile,
  BackupResult,
  RestoreMode,
  RestoreResult,
  BackupCliResult,
} from './backup/backup.js';
export {
  extractCommonFrames,
  crashGroupCommonFrames,
  framesFromPayload,
  splitStackString,
} from './analysis/commonFrames.js';
export type {
  CommonFramesResult,
  CrashGroupCommonFrames,
} from './analysis/commonFrames.js';
export { InMemoryQueue } from './queue/in-memory-adapter.js';
export type { InMemoryQueueOptions } from './queue/in-memory-adapter.js';
export {
  BetterQueueAdapter,
  createBetterQueueAdapter,
} from './queue/better-queue-adapter.js';
export type { BetterQueueAdapterOptions } from './queue/better-queue-adapter.js';
export type {
  IQueue,
  EnqueueOptions,
  EnqueueResult,
  QueueStats,
  QueueWorker,
  QueueEventMap,
  QueueEventName,
} from './queue/IQueue.js';
