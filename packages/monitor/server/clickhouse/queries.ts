/**
 * Typed ClickHouse query builders for ERNE Monitor dashboards and alerting.
 * Each function returns { sql, params } — the caller is responsible for
 * executing against a ClickHouse client (dependency injection).
 */

// ────────────────────────────────────────────────────────────
// ClickHouse client interface (injected)
// ────────────────────────────────────────────────────────────

export interface ClickHouseClient {
  query<T>(sql: string, params: Record<string, unknown>): Promise<readonly T[]>;
  insert(table: string, rows: readonly Record<string, unknown>[]): Promise<void>;
}

// ────────────────────────────────────────────────────────────
// Query result types
// ────────────────────────────────────────────────────────────

export interface CrashTrendPoint {
  readonly hour: string;
  readonly fingerprint: string;
  readonly count: number;
}

export interface PerfTrendPoint {
  readonly bucket: string;
  readonly metricName: string;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly sampleCount: number;
}

export interface TopError {
  readonly fingerprint: string;
  readonly count: number;
  readonly lastSeen: string;
  readonly severity: string;
}

export interface ErrorRatePoint {
  readonly hour: string;
  readonly endpoint: string;
  readonly totalCount: number;
  readonly errorCount: number;
  readonly errorRate: number;
}

export interface SessionEvent {
  readonly eventType: string;
  readonly timestamp: string;
  readonly severity: string;
  readonly screen: string;
  readonly data: string;
}

// ────────────────────────────────────────────────────────────
// Query parameter interfaces
// ────────────────────────────────────────────────────────────

export interface TimeRangeParams {
  readonly appId: string;
  readonly from: Date;
  readonly to: Date;
}

export interface PaginationParams {
  readonly limit: number;
  readonly offset: number;
}

// ────────────────────────────────────────────────────────────
// Query result wrapper
// ────────────────────────────────────────────────────────────

export interface PreparedQuery {
  readonly sql: string;
  readonly params: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────
// Query builders
// ────────────────────────────────────────────────────────────

/**
 * Crash trend over time — hourly crash counts per fingerprint.
 * Reads from the crash_counts_hourly materialized view.
 */
export const getCrashTrend = (
  range: TimeRangeParams,
  fingerprint?: string,
): PreparedQuery => {
  const fingerprintClause = fingerprint
    ? 'AND fingerprint = {fingerprint:String}'
    : '';

  return {
    sql: `
      SELECT
        hour,
        fingerprint,
        countMerge(crash_count) AS count
      FROM crash_counts_hourly
      WHERE app_id = {appId:String}
        AND hour >= {from:DateTime}
        AND hour <= {to:DateTime}
        ${fingerprintClause}
      GROUP BY hour, fingerprint
      ORDER BY hour ASC
    `,
    params: {
      appId: range.appId,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      ...(fingerprint ? { fingerprint } : {}),
    },
  };
};

/**
 * Performance trend — p50/p95/p99 per metric over 5-minute buckets.
 * Reads from perf_metrics_5min materialized view.
 */
export const getPerfTrend = (
  range: TimeRangeParams,
  metricName?: string,
): PreparedQuery => {
  const metricClause = metricName
    ? 'AND metric_name = {metricName:String}'
    : '';

  return {
    sql: `
      SELECT
        bucket,
        metric_name AS metricName,
        quantileMerge(0.5)(p50) AS p50,
        quantileMerge(0.95)(p95) AS p95,
        quantileMerge(0.99)(p99) AS p99,
        countMerge(sample_count) AS sampleCount
      FROM perf_metrics_5min
      WHERE app_id = {appId:String}
        AND bucket >= {from:DateTime}
        AND bucket <= {to:DateTime}
        ${metricClause}
      GROUP BY bucket, metric_name
      ORDER BY bucket ASC
    `,
    params: {
      appId: range.appId,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      ...(metricName ? { metricName } : {}),
    },
  };
};

/**
 * Top errors — most frequent crash fingerprints in a time window.
 * Reads from raw events table for full-fidelity.
 */
export const getTopErrors = (
  range: TimeRangeParams,
  pagination: PaginationParams = { limit: 20, offset: 0 },
): PreparedQuery => ({
  sql: `
    SELECT
      fingerprint,
      count() AS count,
      max(timestamp) AS lastSeen,
      any(severity) AS severity
    FROM events
    WHERE app_id = {appId:String}
      AND event_type = 'crash'
      AND timestamp >= {from:DateTime64}
      AND timestamp <= {to:DateTime64}
      AND fingerprint != ''
    GROUP BY fingerprint
    ORDER BY count DESC
    LIMIT {limit:UInt32} OFFSET {offset:UInt32}
  `,
  params: {
    appId: range.appId,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    limit: pagination.limit,
    offset: pagination.offset,
  },
});

/**
 * Network error rate — hourly error rate per endpoint.
 * Reads from error_rate_hourly materialized view.
 */
export const getErrorRate = (
  range: TimeRangeParams,
  endpoint?: string,
): PreparedQuery => {
  const endpointClause = endpoint
    ? 'AND endpoint = {endpoint:String}'
    : '';

  return {
    sql: `
      SELECT
        hour,
        endpoint,
        countMerge(total_count) AS totalCount,
        countIfMerge(error_count) AS errorCount,
        if(countMerge(total_count) > 0,
           countIfMerge(error_count) / countMerge(total_count),
           0) AS errorRate
      FROM error_rate_hourly
      WHERE app_id = {appId:String}
        AND hour >= {from:DateTime}
        AND hour <= {to:DateTime}
        ${endpointClause}
      GROUP BY hour, endpoint
      ORDER BY hour ASC
    `,
    params: {
      appId: range.appId,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      ...(endpoint ? { endpoint } : {}),
    },
  };
};

/**
 * Session events — all events for a specific session, ordered by time.
 * Reads from raw events table.
 */
export const getSessionEvents = (
  appId: string,
  sessionId: string,
  pagination: PaginationParams = { limit: 500, offset: 0 },
): PreparedQuery => ({
  sql: `
    SELECT
      event_type AS eventType,
      timestamp,
      severity,
      screen,
      data
    FROM events
    WHERE app_id = {appId:String}
      AND session_id = {sessionId:String}
    ORDER BY timestamp ASC
    LIMIT {limit:UInt32} OFFSET {offset:UInt32}
  `,
  params: {
    appId,
    sessionId,
    limit: pagination.limit,
    offset: pagination.offset,
  },
});
