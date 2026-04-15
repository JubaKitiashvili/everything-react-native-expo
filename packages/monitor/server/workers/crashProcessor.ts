/**
 * Crash processor worker — server-side crash fingerprinting,
 * deduplication, and symbolication job triggering.
 */

import type { ClickHouseClient } from '../clickhouse/queries';
import type { IngestEvent } from '../ingest/validator';
import type { JobPayload } from '../ingest/router';
import type { WorkerMetrics, DeadLetterQueue } from './eventProcessor';

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

export interface SymbolicationJob {
  readonly appId: string;
  readonly fingerprint: string;
  readonly event: IngestEvent;
}

export interface SymbolicationQueue {
  enqueue(job: SymbolicationJob): Promise<void>;
}

export interface CrashProcessorConfig {
  /** Max retries before dead-letter. Default: 3. */
  readonly maxRetries: number;
}

const DEFAULT_CONFIG: CrashProcessorConfig = {
  maxRetries: 3,
};

// ────────────────────────────────────────────────────────────
// Fingerprinting
// ────────────────────────────────────────────────────────────

/**
 * Compute a crash fingerprint from the event data.
 * Uses the top stack frame + error message as the grouping key.
 * If the event already carries a client-side fingerprint, use that.
 */
export const computeFingerprint = (event: IngestEvent): string => {
  // Client already computed a fingerprint
  if (event.fingerprint && event.fingerprint.length > 0) {
    return event.fingerprint;
  }

  const data = event.data ?? {};
  const message = typeof data['message'] === 'string' ? data['message'] : '';
  const stack = typeof data['stack'] === 'string' ? data['stack'] : '';

  // Extract the first meaningful stack frame
  const firstFrame = stack.split('\n').find((line) => line.trim().startsWith('at '));
  const frameKey = firstFrame?.trim() ?? 'no-stack';

  // Simple hash: combine type + message prefix + first frame
  const raw = `${event.type}:${message.slice(0, 120)}:${frameKey}`;
  return simpleHash(raw);
};

/**
 * A simple non-cryptographic hash for fingerprinting.
 * Consistent across runs. Not for security use.
 */
const simpleHash = (input: string): string => {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h = ((h << 5) - h + ch) | 0;
  }
  return `fp_${(h >>> 0).toString(36)}`;
};

// ────────────────────────────────────────────────────────────
// Deduplication
// ────────────────────────────────────────────────────────────

export interface CrashDeduplicator {
  /**
   * Check if this fingerprint was already seen in the given time window.
   * Returns true if this is a new occurrence.
   */
  isNew(appId: string, fingerprint: string, windowMs: number): Promise<boolean>;
  /** Mark the fingerprint as seen. */
  markSeen(appId: string, fingerprint: string): Promise<void>;
}

// ────────────────────────────────────────────────────────────
// Processor
// ────────────────────────────────────────────────────────────

export interface CrashProcessor {
  process(payload: JobPayload, attempt?: number): Promise<void>;
}

export const createCrashProcessor = (deps: {
  readonly clickhouse: ClickHouseClient;
  readonly symbolicationQueue: SymbolicationQueue;
  readonly deduplicator: CrashDeduplicator;
  readonly deadLetter: DeadLetterQueue;
  readonly metrics: WorkerMetrics;
  readonly config?: Partial<CrashProcessorConfig>;
}): CrashProcessor => {
  const config = { ...DEFAULT_CONFIG, ...deps.config };

  /** Dedup window: 1 hour */
  const DEDUP_WINDOW_MS = 60 * 60 * 1000;

  const process = async (payload: JobPayload, attempt = 1): Promise<void> => {
    try {
      for (const event of payload.events) {
        const fingerprint = computeFingerprint(event);

        // Store with the computed fingerprint
        const row = {
          app_id: payload.appId,
          event_type: event.type,
          timestamp: new Date(event.timestamp).toISOString(),
          session_id: event.sessionId,
          fingerprint,
          severity: event.severity ?? 'error',
          screen: event.screen ?? '',
          data: JSON.stringify(event.data ?? {}),
          device_json: JSON.stringify(event.device ?? {}),
          enrichment_json: JSON.stringify(event.enrichment ?? {}),
        };

        await deps.clickhouse.insert('events', [row]);
        deps.metrics.increment('crashes.stored', 1, { app_id: payload.appId });

        // Only trigger symbolication for new fingerprints
        const isNew = await deps.deduplicator.isNew(payload.appId, fingerprint, DEDUP_WINDOW_MS);
        if (isNew) {
          await deps.symbolicationQueue.enqueue({
            appId: payload.appId,
            fingerprint,
            event,
          });
          await deps.deduplicator.markSeen(payload.appId, fingerprint);
          deps.metrics.increment('crashes.new_fingerprint', 1, {
            app_id: payload.appId,
          });
        } else {
          deps.metrics.increment('crashes.deduped', 1, { app_id: payload.appId });
        }
      }
    } catch (err) {
      if (attempt >= config.maxRetries) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await deps.deadLetter.send(payload, errorMsg, attempt);
        deps.metrics.increment('crashes.dead_lettered', payload.events.length);
      } else {
        throw err;
      }
    }
  };

  return { process };
};
