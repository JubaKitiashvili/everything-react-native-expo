/**
 * Metrics aggregator worker — pre-computes 1-minute rollups
 * for the real-time dashboard. Buffers incoming metric events
 * and flushes per-metric aggregates every minute.
 */

import type { ClickHouseClient } from '../clickhouse/queries';
import type { IngestEvent } from '../ingest/validator';
import type { JobPayload } from '../ingest/router';
import type { WorkerMetrics } from './eventProcessor';

// ────────────────────────────────────────────────────────────
// Aggregation bucket
// ────────────────────────────────────────────────────────────

export interface MetricBucket {
  readonly appId: string;
  readonly metricName: string;
  readonly minute: string; // ISO string truncated to minute
  readonly values: number[];
  count: number;
  sum: number;
  min: number;
  max: number;
}

export interface AggregatedMetric {
  readonly appId: string;
  readonly metricName: string;
  readonly minute: string;
  readonly count: number;
  readonly sum: number;
  readonly min: number;
  readonly max: number;
  readonly avg: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
}

// ────────────────────────────────────────────────────────────
// Aggregator config
// ────────────────────────────────────────────────────────────

export interface MetricsAggregatorConfig {
  /** Flush interval in ms. Default: 60000 (1 minute). */
  readonly flushIntervalMs: number;
}

const DEFAULT_CONFIG: MetricsAggregatorConfig = {
  flushIntervalMs: 60_000,
};

// ────────────────────────────────────────────────────────────
// Helper: percentile calculation
// ────────────────────────────────────────────────────────────

export const percentile = (sorted: readonly number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
};

// ────────────────────────────────────────────────────────────
// Truncate timestamp to the start of the minute
// ────────────────────────────────────────────────────────────

export const truncateToMinute = (timestampMs: number): string => {
  const d = new Date(timestampMs);
  d.setSeconds(0, 0);
  return d.toISOString();
};

// ────────────────────────────────────────────────────────────
// Aggregator
// ────────────────────────────────────────────────────────────

export interface MetricsAggregator {
  process(payload: JobPayload): void;
  flush(): Promise<void>;
  readonly bucketCount: number;
}

export const createMetricsAggregator = (deps: {
  readonly clickhouse: ClickHouseClient;
  readonly metrics: WorkerMetrics;
  readonly config?: Partial<MetricsAggregatorConfig>;
}): MetricsAggregator => {
  void deps.config; // used for flush scheduling at the integration level
  const _config = { ...DEFAULT_CONFIG, ...deps.config };

  // Key: "appId:metricName:minute"
  const buckets = new Map<string, MetricBucket>();

  const bucketKey = (appId: string, metricName: string, minute: string): string =>
    `${appId}:${metricName}:${minute}`;

  const extractMetricValue = (event: IngestEvent): { name: string; value: number } | null => {
    const data = event.data;
    if (!data) return null;

    const name = typeof data['metricName'] === 'string'
      ? data['metricName']
      : event.type;
    const value = typeof data['value'] === 'number'
      ? data['value']
      : typeof data['durationMs'] === 'number'
        ? data['durationMs']
        : null;

    if (value === null || !Number.isFinite(value)) return null;
    return { name, value };
  };

  const process = (payload: JobPayload): void => {
    for (const event of payload.events) {
      const extracted = extractMetricValue(event);
      if (!extracted) continue;

      const minute = truncateToMinute(event.timestamp);
      const key = bucketKey(payload.appId, extracted.name, minute);

      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          appId: payload.appId,
          metricName: extracted.name,
          minute,
          values: [],
          count: 0,
          sum: 0,
          min: Infinity,
          max: -Infinity,
        };
        buckets.set(key, bucket);
      }

      bucket.values.push(extracted.value);
      bucket.count += 1;
      bucket.sum += extracted.value;
      if (extracted.value < bucket.min) {
        (bucket as { min: number }).min = extracted.value;
      }
      if (extracted.value > bucket.max) {
        (bucket as { max: number }).max = extracted.value;
      }
    }

    deps.metrics.increment('aggregator.events_processed', payload.events.length);
  };

  const computeAggregates = (bucket: MetricBucket): AggregatedMetric => {
    const sorted = [...bucket.values].sort((a, b) => a - b);
    return {
      appId: bucket.appId,
      metricName: bucket.metricName,
      minute: bucket.minute,
      count: bucket.count,
      sum: bucket.sum,
      min: bucket.min === Infinity ? 0 : bucket.min,
      max: bucket.max === -Infinity ? 0 : bucket.max,
      avg: bucket.count > 0 ? bucket.sum / bucket.count : 0,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
    };
  };

  const flush = async (): Promise<void> => {
    if (buckets.size === 0) return;

    const aggregates: AggregatedMetric[] = [];
    for (const bucket of buckets.values()) {
      aggregates.push(computeAggregates(bucket));
    }
    buckets.clear();

    const rows = aggregates.map((a) => ({
      app_id: a.appId,
      metric_name: a.metricName,
      minute: a.minute,
      count: a.count,
      sum: a.sum,
      min: a.min,
      max: a.max,
      avg: a.avg,
      p50: a.p50,
      p95: a.p95,
      p99: a.p99,
    }));

    await deps.clickhouse.insert('metrics_1min', rows);
    deps.metrics.increment('aggregator.flushed', aggregates.length);
    deps.metrics.histogram('aggregator.flush_size', aggregates.length);
  };

  // Suppress unused variable for _config
  void _config;

  return {
    process,
    flush,
    get bucketCount() {
      return buckets.size;
    },
  };
};
