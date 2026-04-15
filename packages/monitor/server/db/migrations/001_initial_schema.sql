-- 001_initial_schema.sql
-- PostgreSQL schema for ERNE Monitor server-side persistence.
-- Tracks applications, versions, source maps, API keys, and alert configuration.

BEGIN;

-- ────────────────────────────────────────────────────────────
-- apps — top-level entity representing a monitored application
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS apps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  bundle_id   TEXT NOT NULL,
  platform    TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX idx_apps_bundle_id_platform ON apps (bundle_id, platform);
CREATE INDEX idx_apps_created_at ON apps (created_at);

-- ────────────────────────────────────────────────────────────
-- app_versions — tracks each released version of an app
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id        UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  version       TEXT NOT NULL,
  build_number  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_versions_app_id ON app_versions (app_id);
CREATE UNIQUE INDEX idx_app_versions_app_version_build
  ON app_versions (app_id, version, build_number);

-- ────────────────────────────────────────────────────────────
-- source_maps — uploaded source maps for symbolication
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS source_maps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_version_id  UUID NOT NULL REFERENCES app_versions (id) ON DELETE CASCADE,
  platform        TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  bundle_id       TEXT NOT NULL,
  map_url         TEXT NOT NULL,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_source_maps_app_version_id ON source_maps (app_version_id);
CREATE INDEX idx_source_maps_bundle_platform
  ON source_maps (bundle_id, platform);

-- ────────────────────────────────────────────────────────────
-- alert_rules — configurable alerting rules per app
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id           UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  metric           TEXT NOT NULL,
  operator         TEXT NOT NULL CHECK (operator IN ('>', '<', '>=', '<=', '==', 'change_pct')),
  threshold        DOUBLE PRECISION NOT NULL,
  window_seconds   INTEGER NOT NULL,
  channel          TEXT NOT NULL,
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  cooldown_seconds INTEGER NOT NULL DEFAULT 300,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alert_rules_app_id ON alert_rules (app_id);
CREATE INDEX idx_alert_rules_enabled ON alert_rules (enabled) WHERE enabled = TRUE;

-- ────────────────────────────────────────────────────────────
-- alert_history — log of triggered (and optionally resolved) alerts
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id       UUID NOT NULL REFERENCES alert_rules (id) ON DELETE CASCADE,
  triggered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ,
  payload_json  JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_alert_history_rule_id ON alert_history (rule_id);
CREATE INDEX idx_alert_history_triggered_at ON alert_history (triggered_at);
CREATE INDEX idx_alert_history_unresolved
  ON alert_history (rule_id, triggered_at) WHERE resolved_at IS NULL;

-- ────────────────────────────────────────────────────────────
-- api_keys — bearer tokens for SDK event ingestion
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id       UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  key_hash     TEXT NOT NULL,
  scopes       TEXT[] NOT NULL DEFAULT '{ingest}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_app_id ON api_keys (app_id);
CREATE UNIQUE INDEX idx_api_keys_key_hash ON api_keys (key_hash);

-- ────────────────────────────────────────────────────────────
-- migrations tracking table
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS _erne_migrations (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
