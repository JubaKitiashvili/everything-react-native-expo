-- 002_materialized_views.sql
-- Pre-aggregated materialized views for dashboard queries and alerting.
-- Each view reads from the events table and writes to a dedicated
-- AggregatingMergeTree table with longer retention than raw events.

-- ────────────────────────────────────────────────────────────
-- crash_counts_hourly — crash count per app/fingerprint/hour
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crash_counts_hourly (
  app_id        String,
  fingerprint   String,
  hour          DateTime,
  crash_count   AggregateFunction(count, UInt64)
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (app_id, fingerprint, hour)
TTL hour + INTERVAL 1 YEAR
SETTINGS index_granularity = 8192;

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_crash_counts_hourly
TO crash_counts_hourly
AS SELECT
  app_id,
  fingerprint,
  toStartOfHour(timestamp) AS hour,
  countState() AS crash_count
FROM events
WHERE event_type = 'crash'
GROUP BY app_id, fingerprint, hour;

-- ────────────────────────────────────────────────────────────
-- perf_metrics_5min — p50/p95/p99 of FPS/startup/latency per 5min
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS perf_metrics_5min (
  app_id        String,
  metric_name   LowCardinality(String),
  bucket        DateTime,
  p50           AggregateFunction(quantile(0.5), Float64),
  p95           AggregateFunction(quantile(0.95), Float64),
  p99           AggregateFunction(quantile(0.99), Float64),
  sample_count  AggregateFunction(count, UInt64)
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(bucket)
ORDER BY (app_id, metric_name, bucket)
TTL bucket + INTERVAL 1 YEAR
SETTINGS index_granularity = 8192;

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_perf_metrics_5min
TO perf_metrics_5min
AS SELECT
  app_id,
  JSONExtractString(data, 'metricName') AS metric_name,
  toStartOfFiveMinutes(timestamp) AS bucket,
  quantileState(0.5)(JSONExtractFloat(data, 'value')) AS p50,
  quantileState(0.95)(JSONExtractFloat(data, 'value')) AS p95,
  quantileState(0.99)(JSONExtractFloat(data, 'value')) AS p99,
  countState() AS sample_count
FROM events
WHERE event_type IN ('perf', 'startup', 'fps', 'network')
GROUP BY app_id, metric_name, bucket;

-- ────────────────────────────────────────────────────────────
-- error_rate_hourly — network error rate per app/endpoint/hour
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS error_rate_hourly (
  app_id        String,
  endpoint      String,
  hour          DateTime,
  total_count   AggregateFunction(count, UInt64),
  error_count   AggregateFunction(countIf, UInt8)
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (app_id, endpoint, hour)
TTL hour + INTERVAL 1 YEAR
SETTINGS index_granularity = 8192;

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_error_rate_hourly
TO error_rate_hourly
AS SELECT
  app_id,
  JSONExtractString(data, 'url') AS endpoint,
  toStartOfHour(timestamp) AS hour,
  countState() AS total_count,
  countIfState(JSONExtractInt(data, 'statusCode') >= 400 OR JSONExtractInt(data, 'statusCode') = 0) AS error_count
FROM events
WHERE event_type = 'network'
GROUP BY app_id, endpoint, hour;
