/**
 * Routes validated ingest events to the appropriate job queues.
 * Separates crash events (high priority) from other events.
 */

import type { IngestEvent } from './validator';

// ────────────────────────────────────────────────────────────
// Job queue interface (dependency injection)
// ────────────────────────────────────────────────────────────

export type JobPriority = 'high' | 'normal' | 'low';

export interface JobPayload {
  readonly appId: string;
  readonly events: readonly IngestEvent[];
  readonly enqueuedAt: number;
}

export interface JobQueue {
  enqueue(
    queue: string,
    payload: JobPayload,
    priority: JobPriority,
  ): Promise<void>;
}

// ────────────────────────────────────────────────────────────
// Queue names
// ────────────────────────────────────────────────────────────

export const QUEUE_CRASH = 'erne:crash' as const;
export const QUEUE_EVENTS = 'erne:events' as const;
export const QUEUE_OTLP = 'erne:otlp' as const;

// ────────────────────────────────────────────────────────────
// Router
// ────────────────────────────────────────────────────────────

export interface IngestRouter {
  route(appId: string, events: readonly IngestEvent[]): Promise<void>;
}

export const createIngestRouter = (queue: JobQueue): IngestRouter => {
  const route = async (appId: string, events: readonly IngestEvent[]): Promise<void> => {
    const now = Date.now();

    // Partition events by priority class
    const crashes: IngestEvent[] = [];
    const otlp: IngestEvent[] = [];
    const normal: IngestEvent[] = [];

    for (const event of events) {
      if (event.type === 'crash' || event.type === 'anr') {
        crashes.push(event);
      } else if (event.type === 'otlp') {
        otlp.push(event);
      } else {
        normal.push(event);
      }
    }

    // Enqueue each partition. Crash events get high priority
    // so they are processed ahead of regular telemetry.
    const promises: Promise<void>[] = [];

    if (crashes.length > 0) {
      promises.push(
        queue.enqueue(QUEUE_CRASH, { appId, events: crashes, enqueuedAt: now }, 'high'),
      );
    }

    if (otlp.length > 0) {
      promises.push(
        queue.enqueue(QUEUE_OTLP, { appId, events: otlp, enqueuedAt: now }, 'normal'),
      );
    }

    if (normal.length > 0) {
      promises.push(
        queue.enqueue(QUEUE_EVENTS, { appId, events: normal, enqueuedAt: now }, 'normal'),
      );
    }

    await Promise.all(promises);
  };

  return { route };
};
