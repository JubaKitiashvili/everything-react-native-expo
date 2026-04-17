-- @erne/monitor dashboard — SQLite schema (migration v1).
--
-- Tables cover every surface the 17 panels render: raw events, per-app-run
-- sessions, fingerprint-grouped crashes, shake-submitted bug reports, user-
-- configured alert rules, and the history of fired alerts.
--
-- Indices are chosen for the read paths we know about (descending time,
-- filter by session / user / type, sort by last-seen for the Crash Explorer).
-- When a new panel adds a required read path, bump the migration version
-- and add the index in a v2 migration rather than editing this file in place.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS events (
  id            TEXT    PRIMARY KEY,
  type          TEXT    NOT NULL,
  severity      TEXT    NOT NULL,
  session_id    TEXT    NOT NULL,
  fingerprint   TEXT,
  timestamp     INTEGER NOT NULL,
  received_at   INTEGER NOT NULL,
  screen        TEXT,
  platform      TEXT,
  payload_json  TEXT    NOT NULL,
  user_id       TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_timestamp    ON events (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_session      ON events (session_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_type         ON events (type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_fingerprint  ON events (fingerprint, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_user         ON events (user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id                TEXT    PRIMARY KEY,
  user_id           TEXT,
  started_at        INTEGER NOT NULL,
  ended_at          INTEGER,
  platform          TEXT,
  device_json       TEXT,
  app_version       TEXT,
  runtime_version   TEXT,
  channel           TEXT,
  event_count       INTEGER NOT NULL DEFAULT 0,
  crash_count       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions (user_id);

CREATE TABLE IF NOT EXISTS crash_groups (
  fingerprint         TEXT    PRIMARY KEY,
  message             TEXT    NOT NULL,
  first_seen          INTEGER NOT NULL,
  last_seen           INTEGER NOT NULL,
  event_count         INTEGER NOT NULL DEFAULT 0,
  session_count       INTEGER NOT NULL DEFAULT 0,
  status              TEXT    NOT NULL DEFAULT 'new',
  top_screen          TEXT,
  ai_suggestion_json  TEXT
);

CREATE INDEX IF NOT EXISTS idx_crash_groups_last_seen ON crash_groups (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_crash_groups_status    ON crash_groups (status, last_seen DESC);

CREATE TABLE IF NOT EXISTS bug_reports (
  id                TEXT    PRIMARY KEY,
  session_id        TEXT    NOT NULL,
  submitted_at      INTEGER NOT NULL,
  title             TEXT,
  description       TEXT,
  status            TEXT    NOT NULL DEFAULT 'new',
  assignee          TEXT,
  attachments_json  TEXT,
  event_ids_json    TEXT
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_submitted ON bug_reports (submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_bug_reports_status    ON bug_reports (status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS alert_rules (
  id                TEXT    PRIMARY KEY,
  name              TEXT    NOT NULL,
  metric            TEXT    NOT NULL,
  threshold         REAL    NOT NULL,
  window_seconds    INTEGER NOT NULL,
  channels_json     TEXT    NOT NULL,
  cooldown_seconds  INTEGER NOT NULL DEFAULT 300,
  enabled           INTEGER NOT NULL DEFAULT 1,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_history (
  id            TEXT    PRIMARY KEY,
  rule_id       TEXT    NOT NULL,
  fired_at      INTEGER NOT NULL,
  metric_value  REAL    NOT NULL,
  severity      TEXT    NOT NULL,
  payload_json  TEXT
);

CREATE INDEX IF NOT EXISTS idx_alert_history_fired ON alert_history (fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_history_rule  ON alert_history (rule_id, fired_at DESC);
