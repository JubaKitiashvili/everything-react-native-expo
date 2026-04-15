/**
 * Event processor worker — consumes events from the job queue and
 * batch-inserts them into ClickHouse. Implements dead-letter after
 * 3 retries and emits processing metrics.
 */

import type { ClickHouseClient } from '../clickhouse/queries';
import type { IngestEvent } from '../ingest/validator';
import type { JobPayload } from '../ingest/router';

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

export interface WorkerMetrics {
  increment(metric: string, value?: number, tags?: Record<string, string>): void;
  histogram(metric: string, value: number, tags?: Record<string, string>): void;
}

export interface DeadLetterQueue {
  send(payload: JobPayload, error: string, attempt: number): Promise<void>;
}

export interface EventProcessorConfig {
  /** Max events to batch before flushing. Default: 1000. */
  readonly batchSize: number;
  /** Max time (ms) to hold events before flushing. Default: 1000. */
  readonly flushIntervalMs: number;
  /** Max retries before dead-letter. Default: 3. */
  readonly maxRetries: number;
}

const DEFAULT_CONFIG: EventProcessorConfig = {
  batchSize: 1000,
  flushIntervalMs: 1000,
  maxRetries: 3,
};

// ────────────────────────────────────────────────────────────
// Event processor
// ────────────────────────────────────────────────────────────

export interface EventProcessor {
  process(payload: JobPayload, attempt?: number): Promise<void>;
  flush(): Promise<void>;
  readonly pendingCount: number;
}

export const createEventProcessor = (deps: {
  readonly clickhouse: ClickHouseClient;
  readonly deadLetter: DeadLetterQueue;
  readonly metrics: WorkerMetrics;
  readonly config?: Partial<EventProcessorConfig>;
}): EventProcessor => {
  const config = { ...DEFAULT_CONFIG, ...deps.config };

  let buffer: Array<{ appId: string; event: IngestEvent }> = [];
  let lastFlushTime = Date.now();

  const toClickHouseRow = (
    appId: string,
    event: IngestEvent,
  ): Record<string, unknown> => ({
    app_id: appId,
    event_type: event.type,
    timestamp: new Date(event.timestamp).toISOString(),
    session_id: event.sessionId,
    fingerprint: event.fingerprint ?? '',
    severity: event.severity ?? 'info',
    screen: event.screen ?? '',
    data: JSON.stringify(event.data ?? {}),
    device_json: JSON.stringify(event.device ?? {}),
    enrichment_json: JSON.stringify(event.enrichment ?? {}),
  });

  const flush = async (): Promise<void> => {
    if (buffer.length === 0) return;

    const batch = buffer;
    buffer = [];
    lastFlushTime = Date.now();

    const rows = batch.map(({ appId, event }) => toClickHouseRow(appId, event));

    try {
      await deps.clickhouse.insert('events', rows);
      deps.metrics.increment('events.inserted', rows.length);
      deps.metrics.histogram('events.batch_size', rows.length);
    } catch (err) {
      // On flush failure, we cannot individually retry; push the whole
      // batch back into the buffer for the next cycle.
      buffer = [...batch, ...buffer];
      deps.metrics.increment('events.flush_error');
      throw err;
    }
  };

  const shouldFlush = (): boolean =>
    buffer.length >= config.batchSize ||
    Date.now() - lastFlushTime >= config.flushIntervalMs;

  const process = async (payload: JobPayload, attempt = 1): Promise<void> => {
    try {
      for (const event of payload.events) {
        buffer.push({ appId: payload.appId, event });
      }

      deps.metrics.increment('events.received', payload.events.length, {
        app_id: payload.appId,
      });

      if (shouldFlush()) {
        await flush();
      }
    } catch (err) {
      if (attempt >= config.maxRetries) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await deps.deadLetter.send(payload, errorMsg, attempt);
        deps.metrics.increment('events.dead_lettered', payload.events.length);
      } else {
        // Re-throw so the queue can retry
        throw err;
      }
    }
  };

  return {
    process,
    flush,
    get pendingCount() {
      return buffer.length;
    },
  };
};
