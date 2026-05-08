// Task 117.4 — PostgreSQL DDL + migration list.
//
// Translation rules from the SQLite schema:
//   - INTEGER for monotonic ms timestamps stays BIGINT (Postgres
//     INTEGER is 32-bit, can't hold modern epoch ms).
//   - INTEGER 0/1 booleans (alert_rules.enabled) become BOOLEAN.
//   - TEXT primary keys stay TEXT — we hash event ids client-side, no
//     reason to convert to UUID at the storage boundary.
//   - DESC indices: Postgres supports `index ON (col DESC)` natively.
//   - Foreign-key triggers from SQLite (PRAGMA foreign_keys = ON)
//     become explicit `REFERENCES` clauses where the SQLite schema
//     uses them; current schema has none, so the Postgres version
//     stays loose for symmetry.
//   - JSON payloads: Postgres benefits from JSONB for indexable
//     queries, but the dashboard never queries inside the JSON column,
//     so we keep TEXT for now to maximise translation fidelity. A
//     future task can flip these to JSONB without breaking callers.

export interface PostgresMigration {
  version: number;
  name: string;
  /** Single SQL string executed in one transaction by the runner. */
  up: string;
}

const V1_INITIAL_SQL = `
CREATE TABLE IF NOT EXISTS events (
  id            TEXT     PRIMARY KEY,
  type          TEXT     NOT NULL,
  severity      TEXT     NOT NULL,
  session_id    TEXT     NOT NULL,
  fingerprint   TEXT,
  timestamp     BIGINT   NOT NULL,
  received_at   BIGINT   NOT NULL,
  screen        TEXT,
  platform      TEXT,
  payload_json  TEXT     NOT NULL,
  user_id       TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_timestamp    ON events (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_session      ON events (session_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_type         ON events (type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_fingerprint  ON events (fingerprint, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_user         ON events (user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id                TEXT     PRIMARY KEY,
  user_id           TEXT,
  started_at        BIGINT   NOT NULL,
  ended_at          BIGINT,
  platform          TEXT,
  device_json       TEXT,
  app_version       TEXT,
  runtime_version   TEXT,
  channel           TEXT,
  event_count       INTEGER  NOT NULL DEFAULT 0,
  crash_count       INTEGER  NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions (user_id);

CREATE TABLE IF NOT EXISTS crash_groups (
  fingerprint         TEXT     PRIMARY KEY,
  message             TEXT     NOT NULL,
  first_seen          BIGINT   NOT NULL,
  last_seen           BIGINT   NOT NULL,
  event_count         INTEGER  NOT NULL DEFAULT 0,
  session_count       INTEGER  NOT NULL DEFAULT 0,
  status              TEXT     NOT NULL DEFAULT 'new',
  top_screen          TEXT,
  ai_suggestion_json  TEXT
);

CREATE INDEX IF NOT EXISTS idx_crash_groups_last_seen ON crash_groups (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_crash_groups_status    ON crash_groups (status, last_seen DESC);

CREATE TABLE IF NOT EXISTS bug_reports (
  id                TEXT     PRIMARY KEY,
  session_id        TEXT     NOT NULL,
  submitted_at      BIGINT   NOT NULL,
  title             TEXT,
  description       TEXT,
  status            TEXT     NOT NULL DEFAULT 'new',
  assignee          TEXT,
  attachments_json  TEXT,
  event_ids_json    TEXT
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_submitted ON bug_reports (submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_bug_reports_status    ON bug_reports (status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS alert_rules (
  id                TEXT     PRIMARY KEY,
  name              TEXT     NOT NULL,
  metric            TEXT     NOT NULL,
  threshold         DOUBLE PRECISION NOT NULL,
  window_seconds    INTEGER  NOT NULL,
  channels_json     TEXT     NOT NULL,
  cooldown_seconds  INTEGER  NOT NULL DEFAULT 300,
  enabled           BOOLEAN  NOT NULL DEFAULT TRUE,
  created_at        BIGINT   NOT NULL,
  updated_at        BIGINT   NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_history (
  id            TEXT     PRIMARY KEY,
  rule_id       TEXT     NOT NULL,
  fired_at      BIGINT   NOT NULL,
  metric_value  DOUBLE PRECISION NOT NULL,
  severity      TEXT     NOT NULL,
  payload_json  TEXT
);

CREATE INDEX IF NOT EXISTS idx_alert_history_fired ON alert_history (fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_history_rule  ON alert_history (rule_id, fired_at DESC);
`;

const V2_SYMBOL_FILES_SQL = `
CREATE TABLE IF NOT EXISTS symbol_files (
  id            TEXT     PRIMARY KEY,
  platform      TEXT     NOT NULL,
  bundle_id     TEXT     NOT NULL,
  version       TEXT     NOT NULL,
  filename      TEXT     NOT NULL,
  size_bytes    BIGINT   NOT NULL DEFAULT 0,
  uploaded_at   BIGINT   NOT NULL,
  entry_count   INTEGER  NOT NULL DEFAULT 0,
  uuid          TEXT,
  mapping_text  TEXT
);

CREATE INDEX IF NOT EXISTS idx_symbol_files_uploaded
  ON symbol_files (uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_symbol_files_signature
  ON symbol_files (platform, bundle_id, version, uploaded_at DESC);
`;

const V3_SERVER_SETTINGS_SQL = `
CREATE TABLE IF NOT EXISTS server_settings (
  key        TEXT     PRIMARY KEY,
  value      TEXT     NOT NULL,
  updated_at BIGINT   NOT NULL
);
`;

const V4_AI_ACTIONS_SQL = `
CREATE TABLE IF NOT EXISTS ai_actions (
  id                      TEXT     PRIMARY KEY,
  timestamp               BIGINT   NOT NULL,
  agent                   TEXT     NOT NULL,
  action                  TEXT     NOT NULL,
  -- Postgres reserves "user" as an unquoted identifier; quote it.
  "user"                  TEXT,
  fingerprint             TEXT,
  tools_called_json       TEXT,
  files_considered_json   TEXT,
  confidence              INTEGER,
  effective_confidence    INTEGER,
  classification          TEXT,
  outcome                 TEXT     NOT NULL,
  pr_url                  TEXT,
  redaction_labels_json   TEXT,
  metadata_json           TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_actions_timestamp
  ON ai_actions (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ai_actions_agent
  ON ai_actions (agent, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ai_actions_fingerprint
  ON ai_actions (fingerprint, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ai_actions_outcome
  ON ai_actions (outcome, timestamp DESC);
`;

const MIGRATION_BOOKKEEPING_SQL = `
CREATE TABLE IF NOT EXISTS _migrations (
  version    INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  applied_at BIGINT  NOT NULL,
  checksum   TEXT    NOT NULL
);
`;

export const POSTGRES_DEFAULT_MIGRATIONS: readonly PostgresMigration[] = Object.freeze([
  { version: 1, name: 'initial', up: V1_INITIAL_SQL },
  { version: 2, name: 'symbol_files', up: V2_SYMBOL_FILES_SQL },
  { version: 3, name: 'server_settings', up: V3_SERVER_SETTINGS_SQL },
  { version: 4, name: 'ai_actions', up: V4_AI_ACTIONS_SQL },
]);

export const POSTGRES_BOOKKEEPING_SQL = MIGRATION_BOOKKEEPING_SQL;

/**
 * Tables wiped by `resetAllUserData`. Mirrors the SQLite list verbatim
 * so the cross-adapter parity test (Task 117.4 acceptance) sees the
 * same purge surface on both backends.
 */
export const POSTGRES_RESET_TABLES = [
  'events',
  'sessions',
  'crash_groups',
  'bug_reports',
  'alert_rules',
  'alert_history',
  'symbol_files',
  'ai_actions',
] as const;
