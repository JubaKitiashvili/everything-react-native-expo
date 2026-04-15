-- 001_events_table.sql
-- ClickHouse events table — the primary event store for all SDK telemetry.
-- Uses ReplacingMergeTree to handle at-least-once delivery dedup.

CREATE TABLE IF NOT EXISTS events (
  app_id        String       CODEC(LZ4),
  event_type    LowCardinality(String),
  timestamp     DateTime64(3, 'UTC'),
  session_id    String       CODEC(LZ4),
  fingerprint   String       DEFAULT '' CODEC(LZ4),
  severity      LowCardinality(String) DEFAULT 'info',
  screen        String       DEFAULT '' CODEC(LZ4),
  data          String       CODEC(LZ4),   -- JSON-encoded event payload
  device_json   String       CODEC(LZ4),   -- JSON-encoded device context
  enrichment_json String     CODEC(LZ4)    -- JSON-encoded enrichment data
)
ENGINE = ReplacingMergeTree(timestamp)
PARTITION BY toYYYYMM(timestamp)
ORDER BY (app_id, event_type, timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- Secondary index on session_id for session replay lookups
ALTER TABLE events ADD INDEX idx_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 4;

-- Secondary index on fingerprint for crash grouping
ALTER TABLE events ADD INDEX idx_fingerprint fingerprint TYPE bloom_filter(0.01) GRANULARITY 4;
