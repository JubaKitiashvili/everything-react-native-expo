/**
 * Tests for event processor, crash processor, and metrics aggregator.
 * Uses fake queue/storage implementations.
 */

import { createEventProcessor, type WorkerMetrics, type DeadLetterQueue } from './eventProcessor';
import { createCrashProcessor, computeFingerprint, type CrashDeduplicator, type SymbolicationQueue, type SymbolicationJob } from './crashProcessor';
import { createMetricsAggregator, percentile, truncateToMinute } from './metricsAggregator';
import type { ClickHouseClient } from '../clickhouse/queries';
import type { IngestEvent } from '../ingest/validator';
import type { JobPayload } from '../ingest/router';

// ────────────────────────────────────────────────────────────
// Shared fakes
// ────────────────────────────────────────────────────────────

const createFakeClickHouse = (): ClickHouseClient & {
  inserted: Array<{ table: string; rows: readonly Record<string, unknown>[] }>;
  shouldFail: boolean;
} => {
  const state = {
    inserted: [] as Array<{ table: string; rows: readonly Record<string, unknown>[] }>,
    shouldFail: false,
    query: async <T>(): Promise<readonly T[]> => [],
    insert: async (table: string, rows: readonly Record<string, unknown>[]): Promise<void> => {
      if (state.shouldFail) throw new Error('ClickHouse insert failed');
      state.inserted.push({ table, rows });
    },
  };
  return state;
};

const createFakeMetrics = (): WorkerMetrics & {
  increments: Array<{ metric: string; value?: number }>;
  histograms: Array<{ metric: string; value: number }>;
} => {
  const state = {
    increments: [] as Array<{ metric: string; value?: number }>,
    histograms: [] as Array<{ metric: string; value: number }>,
    increment: (metric: string, value?: number) => {
      state.increments.push({ metric, value });
    },
    histogram: (metric: string, value: number) => {
      state.histograms.push({ metric, value });
    },
  };
  return state;
};

const createFakeDeadLetter = (): DeadLetterQueue & {
  items: Array<{ payload: JobPayload; error: string; attempt: number }>;
} => {
  const state = {
    items: [] as Array<{ payload: JobPayload; error: string; attempt: number }>,
    send: async (payload: JobPayload, error: string, attempt: number) => {
      state.items.push({ payload, error, attempt });
    },
  };
  return state;
};

const makePayload = (events: readonly IngestEvent[], appId = 'app_1'): JobPayload => ({
  appId,
  events,
  enqueuedAt: Date.now(),
});

const makeEvent = (overrides: Partial<IngestEvent> = {}): IngestEvent => ({
  type: 'network',
  timestamp: Date.now(),
  sessionId: 'sess_1',
  ...overrides,
});

// ────────────────────────────────────────────────────────────
// Event Processor tests
// ────────────────────────────────────────────────────────────

describe('EventProcessor', () => {
  test('buffers events until batch size is reached', async () => {
    const ch = createFakeClickHouse();
    const processor = createEventProcessor({
      clickhouse: ch,
      deadLetter: createFakeDeadLetter(),
      metrics: createFakeMetrics(),
      config: { batchSize: 3, flushIntervalMs: 60000 },
    });

    // 2 events — below batch size
    await processor.process(makePayload([makeEvent(), makeEvent()]));
    expect(ch.inserted).toHaveLength(0);
    expect(processor.pendingCount).toBe(2);
  });

  test('flushes when batch size is reached', async () => {
    const ch = createFakeClickHouse();
    const processor = createEventProcessor({
      clickhouse: ch,
      deadLetter: createFakeDeadLetter(),
      metrics: createFakeMetrics(),
      config: { batchSize: 2, flushIntervalMs: 60000 },
    });

    await processor.process(makePayload([makeEvent(), makeEvent()]));
    expect(ch.inserted).toHaveLength(1);
    expect(ch.inserted[0]!.table).toBe('events');
    expect(ch.inserted[0]!.rows).toHaveLength(2);
  });

  test('manual flush sends pending events', async () => {
    const ch = createFakeClickHouse();
    const processor = createEventProcessor({
      clickhouse: ch,
      deadLetter: createFakeDeadLetter(),
      metrics: createFakeMetrics(),
      config: { batchSize: 100, flushIntervalMs: 60000 },
    });

    await processor.process(makePayload([makeEvent()]));
    expect(ch.inserted).toHaveLength(0);

    await processor.flush();
    expect(ch.inserted).toHaveLength(1);
    expect(processor.pendingCount).toBe(0);
  });

  test('dead-letters after max retries', async () => {
    const ch = createFakeClickHouse();
    ch.shouldFail = true;
    const dl = createFakeDeadLetter();

    const processor = createEventProcessor({
      clickhouse: ch,
      deadLetter: dl,
      metrics: createFakeMetrics(),
      config: { batchSize: 1, maxRetries: 3 },
    });

    await processor.process(makePayload([makeEvent()]), 3);
    expect(dl.items).toHaveLength(1);
    expect(dl.items[0]!.attempt).toBe(3);
  });

  test('re-throws on non-final retry', async () => {
    const ch = createFakeClickHouse();
    ch.shouldFail = true;

    const processor = createEventProcessor({
      clickhouse: ch,
      deadLetter: createFakeDeadLetter(),
      metrics: createFakeMetrics(),
      config: { batchSize: 1, maxRetries: 3 },
    });

    await expect(processor.process(makePayload([makeEvent()]), 1)).rejects.toThrow();
  });

  test('emits metrics on successful insert', async () => {
    const metrics = createFakeMetrics();
    const processor = createEventProcessor({
      clickhouse: createFakeClickHouse(),
      deadLetter: createFakeDeadLetter(),
      metrics,
      config: { batchSize: 1 },
    });

    await processor.process(makePayload([makeEvent()]));

    expect(metrics.increments.find((m) => m.metric === 'events.received')).toBeDefined();
    expect(metrics.increments.find((m) => m.metric === 'events.inserted')).toBeDefined();
  });

  test('flush is a no-op when buffer is empty', async () => {
    const ch = createFakeClickHouse();
    const processor = createEventProcessor({
      clickhouse: ch,
      deadLetter: createFakeDeadLetter(),
      metrics: createFakeMetrics(),
    });

    await processor.flush();
    expect(ch.inserted).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────
// Crash Processor tests
// ────────────────────────────────────────────────────────────

describe('computeFingerprint', () => {
  test('uses client fingerprint when present', () => {
    const fp = computeFingerprint(makeEvent({ fingerprint: 'client_fp_123' }));
    expect(fp).toBe('client_fp_123');
  });

  test('computes from type + message + stack when no client fingerprint', () => {
    const event = makeEvent({
      type: 'crash',
      data: {
        message: 'TypeError: undefined is not a function',
        stack: 'Error\n  at HomeScreen.render (HomeScreen.tsx:42:10)',
      },
    });
    const fp = computeFingerprint(event);
    expect(fp).toMatch(/^fp_/);
    expect(fp.length).toBeGreaterThan(3);
  });

  test('produces consistent fingerprints for same input', () => {
    const event = makeEvent({
      type: 'crash',
      data: { message: 'Test error', stack: 'Error\n  at foo (bar.js:1:1)' },
    });
    expect(computeFingerprint(event)).toBe(computeFingerprint(event));
  });

  test('produces different fingerprints for different errors', () => {
    const e1 = makeEvent({ type: 'crash', data: { message: 'Error A' } });
    const e2 = makeEvent({ type: 'crash', data: { message: 'Error B' } });
    expect(computeFingerprint(e1)).not.toBe(computeFingerprint(e2));
  });

  test('handles missing data gracefully', () => {
    const fp = computeFingerprint(makeEvent({ type: 'crash' }));
    expect(fp).toMatch(/^fp_/);
  });
});

describe('CrashProcessor', () => {
  const createFakeDedup = (): CrashDeduplicator & { seen: Set<string> } => {
    const seen = new Set<string>();
    return {
      seen,
      isNew: async (_appId: string, fp: string) => !seen.has(fp),
      markSeen: async (_appId: string, fp: string) => { seen.add(fp); },
    };
  };

  const createFakeSymQueue = (): SymbolicationQueue & { jobs: SymbolicationJob[] } => {
    const jobs: SymbolicationJob[] = [];
    return {
      jobs,
      enqueue: async (job) => { jobs.push(job); },
    };
  };

  test('stores crash event in ClickHouse', async () => {
    const ch = createFakeClickHouse();
    const processor = createCrashProcessor({
      clickhouse: ch,
      symbolicationQueue: createFakeSymQueue(),
      deduplicator: createFakeDedup(),
      deadLetter: createFakeDeadLetter(),
      metrics: createFakeMetrics(),
    });

    await processor.process(makePayload([
      makeEvent({ type: 'crash', data: { message: 'Crash!' } }),
    ]));

    expect(ch.inserted).toHaveLength(1);
    expect(ch.inserted[0]!.table).toBe('events');
  });

  test('triggers symbolication for new fingerprints', async () => {
    const symQueue = createFakeSymQueue();
    const processor = createCrashProcessor({
      clickhouse: createFakeClickHouse(),
      symbolicationQueue: symQueue,
      deduplicator: createFakeDedup(),
      deadLetter: createFakeDeadLetter(),
      metrics: createFakeMetrics(),
    });

    await processor.process(makePayload([
      makeEvent({ type: 'crash', data: { message: 'New crash' } }),
    ]));

    expect(symQueue.jobs).toHaveLength(1);
    expect(symQueue.jobs[0]!.appId).toBe('app_1');
  });

  test('deduplicates repeated fingerprints', async () => {
    const symQueue = createFakeSymQueue();
    const dedup = createFakeDedup();
    const processor = createCrashProcessor({
      clickhouse: createFakeClickHouse(),
      symbolicationQueue: symQueue,
      deduplicator: dedup,
      deadLetter: createFakeDeadLetter(),
      metrics: createFakeMetrics(),
    });

    const event = makeEvent({ type: 'crash', fingerprint: 'same_fp' });
    await processor.process(makePayload([event]));
    await processor.process(makePayload([event]));

    // Symbolication triggered only once
    expect(symQueue.jobs).toHaveLength(1);
    expect(dedup.seen.size).toBe(1);
  });

  test('dead-letters after max retries', async () => {
    const ch = createFakeClickHouse();
    ch.shouldFail = true;
    const dl = createFakeDeadLetter();

    const processor = createCrashProcessor({
      clickhouse: ch,
      symbolicationQueue: createFakeSymQueue(),
      deduplicator: createFakeDedup(),
      deadLetter: dl,
      metrics: createFakeMetrics(),
      config: { maxRetries: 2 },
    });

    await processor.process(makePayload([makeEvent({ type: 'crash' })]), 2);
    expect(dl.items).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────
// Metrics Aggregator tests
// ────────────────────────────────────────────────────────────

describe('percentile', () => {
  test('returns 0 for empty array', () => {
    expect(percentile([], 50)).toBe(0);
  });

  test('returns single value for single-element array', () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 99)).toBe(42);
  });

  test('computes p50 correctly', () => {
    const values = [10, 20, 30, 40, 50];
    expect(percentile(values, 50)).toBe(30);
  });

  test('computes p95 correctly', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(values, 95)).toBe(95);
  });

  test('computes p99 correctly', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(values, 99)).toBe(99);
  });
});

describe('truncateToMinute', () => {
  test('truncates seconds and milliseconds', () => {
    // 2026-04-14T12:34:56.789Z → 2026-04-14T12:34:00.000Z
    const ts = new Date('2026-04-14T12:34:56.789Z').getTime();
    expect(truncateToMinute(ts)).toBe('2026-04-14T12:34:00.000Z');
  });

  test('preserves already-truncated timestamps', () => {
    const ts = new Date('2026-04-14T12:34:00.000Z').getTime();
    expect(truncateToMinute(ts)).toBe('2026-04-14T12:34:00.000Z');
  });
});

describe('MetricsAggregator', () => {
  test('aggregates metric values into buckets', () => {
    const ch = createFakeClickHouse();
    const aggregator = createMetricsAggregator({
      clickhouse: ch,
      metrics: createFakeMetrics(),
    });

    const now = Date.now();
    aggregator.process(makePayload([
      makeEvent({ type: 'perf', timestamp: now, data: { metricName: 'startup_time', value: 100 } }),
      makeEvent({ type: 'perf', timestamp: now, data: { metricName: 'startup_time', value: 200 } }),
      makeEvent({ type: 'perf', timestamp: now, data: { metricName: 'fps', value: 60 } }),
    ]));

    expect(aggregator.bucketCount).toBe(2); // startup_time + fps
  });

  test('flushes aggregates to ClickHouse', async () => {
    const ch = createFakeClickHouse();
    const aggregator = createMetricsAggregator({
      clickhouse: ch,
      metrics: createFakeMetrics(),
    });

    aggregator.process(makePayload([
      makeEvent({ data: { metricName: 'latency', value: 50 } }),
      makeEvent({ data: { metricName: 'latency', value: 150 } }),
    ]));

    await aggregator.flush();

    expect(ch.inserted).toHaveLength(1);
    expect(ch.inserted[0]!.table).toBe('metrics_1min');

    const row = ch.inserted[0]!.rows[0]!;
    expect(row['metric_name']).toBe('latency');
    expect(row['count']).toBe(2);
    expect(row['min']).toBe(50);
    expect(row['max']).toBe(150);
    expect(row['avg']).toBe(100);
  });

  test('clears buckets after flush', async () => {
    const aggregator = createMetricsAggregator({
      clickhouse: createFakeClickHouse(),
      metrics: createFakeMetrics(),
    });

    aggregator.process(makePayload([
      makeEvent({ data: { metricName: 'x', value: 1 } }),
    ]));
    expect(aggregator.bucketCount).toBe(1);

    await aggregator.flush();
    expect(aggregator.bucketCount).toBe(0);
  });

  test('flush is a no-op when empty', async () => {
    const ch = createFakeClickHouse();
    const aggregator = createMetricsAggregator({
      clickhouse: ch,
      metrics: createFakeMetrics(),
    });

    await aggregator.flush();
    expect(ch.inserted).toHaveLength(0);
  });

  test('ignores events without metric value', () => {
    const aggregator = createMetricsAggregator({
      clickhouse: createFakeClickHouse(),
      metrics: createFakeMetrics(),
    });

    aggregator.process(makePayload([
      makeEvent({ data: { message: 'no value here' } }),
    ]));

    expect(aggregator.bucketCount).toBe(0);
  });

  test('extracts durationMs as fallback value', async () => {
    const ch = createFakeClickHouse();
    const aggregator = createMetricsAggregator({
      clickhouse: ch,
      metrics: createFakeMetrics(),
    });

    aggregator.process(makePayload([
      makeEvent({ type: 'network', data: { durationMs: 250 } }),
    ]));

    await aggregator.flush();

    expect(ch.inserted).toHaveLength(1);
    const row = ch.inserted[0]!.rows[0]!;
    expect(row['min']).toBe(250);
    expect(row['max']).toBe(250);
  });
});
