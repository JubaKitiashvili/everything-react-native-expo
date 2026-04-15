/**
 * Tests for ingest validator and router.
 * Does not test the HTTP server itself — only the pure logic.
 */

import { validateEvent, validateBatch, type IngestEvent } from './validator';
import {
  createIngestRouter,
  QUEUE_CRASH,
  QUEUE_EVENTS,
  QUEUE_OTLP,
  type JobQueue,
  type JobPayload,
  type JobPriority,
} from './router';

// ────────────────────────────────────────────────────────────
// Validator tests
// ────────────────────────────────────────────────────────────

describe('validateEvent', () => {
  const validEvent = {
    type: 'crash',
    timestamp: Date.now(),
    sessionId: 'sess_abc123',
  };

  test('accepts a valid minimal event', () => {
    const result = validateEvent(validEvent);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.event).toBeDefined();
    expect(result.event!.type).toBe('crash');
  });

  test('accepts a valid event with optional fields', () => {
    const result = validateEvent({
      ...validEvent,
      fingerprint: 'fp_123',
      severity: 'error',
      screen: 'HomeScreen',
      data: { message: 'Something crashed' },
      device: { platform: 'ios' },
      enrichment: { userId: 'u_1' },
    });
    expect(result.valid).toBe(true);
    expect(result.event!.fingerprint).toBe('fp_123');
    expect(result.event!.data).toEqual({ message: 'Something crashed' });
  });

  test('rejects null input', () => {
    const result = validateEvent(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Event must be a non-null object');
  });

  test('rejects array input', () => {
    const result = validateEvent([1, 2, 3]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Event must be a non-null object');
  });

  test('rejects missing type', () => {
    const result = validateEvent({ timestamp: Date.now(), sessionId: 's' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Missing or invalid "type"/);
  });

  test('rejects invalid type enum', () => {
    const result = validateEvent({ type: 'not-a-type', timestamp: Date.now(), sessionId: 's' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Invalid "type"/);
  });

  test('rejects missing timestamp', () => {
    const result = validateEvent({ type: 'crash', sessionId: 's' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Missing or invalid "timestamp"/);
  });

  test('rejects NaN timestamp', () => {
    const result = validateEvent({ type: 'crash', timestamp: NaN, sessionId: 's' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Missing or invalid "timestamp"/);
  });

  test('rejects timestamp too old (>7 days)', () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const result = validateEvent({ type: 'crash', timestamp: eightDaysAgo, sessionId: 's' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Timestamp too old/);
  });

  test('rejects timestamp too far in the future (>5 min)', () => {
    const tenMinutesAhead = Date.now() + 10 * 60 * 1000;
    const result = validateEvent({ type: 'crash', timestamp: tenMinutesAhead, sessionId: 's' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Timestamp in the future/);
  });

  test('rejects missing sessionId', () => {
    const result = validateEvent({ type: 'crash', timestamp: Date.now() });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Missing or invalid "sessionId"/);
  });

  test('rejects empty sessionId', () => {
    const result = validateEvent({ type: 'crash', timestamp: Date.now(), sessionId: '' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Missing or invalid "sessionId"/);
  });

  test('rejects non-object data field', () => {
    const result = validateEvent({ ...validEvent, data: 'not an object' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/"data" must be a plain object/);
  });

  test('rejects array data field', () => {
    const result = validateEvent({ ...validEvent, data: [1, 2] });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/"data" must be a plain object/);
  });

  test('rejects non-string fingerprint', () => {
    const result = validateEvent({ ...validEvent, fingerprint: 42 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/"fingerprint" must be a string/);
  });

  test('collects multiple errors', () => {
    const result = validateEvent({ type: 123, timestamp: 'bad', sessionId: null });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  test('accepts all valid event types', () => {
    const types = [
      'crash', 'network', 'navigation', 'render', 'custom',
      'perf', 'startup', 'fps', 'anr', 'thermal', 'memory',
      'breadcrumb', 'otlp',
    ];
    for (const type of types) {
      const result = validateEvent({ type, timestamp: Date.now(), sessionId: 's' });
      expect(result.valid).toBe(true);
    }
  });
});

describe('validateBatch', () => {
  test('validates each event independently', () => {
    const results = validateBatch([
      { type: 'crash', timestamp: Date.now(), sessionId: 's1' },
      { type: 'invalid-type', timestamp: Date.now(), sessionId: 's2' },
      { type: 'network', timestamp: Date.now(), sessionId: 's3' },
    ]);

    expect(results).toHaveLength(3);
    expect(results[0]!.valid).toBe(true);
    expect(results[1]!.valid).toBe(false);
    expect(results[2]!.valid).toBe(true);
  });

  test('handles empty batch', () => {
    const results = validateBatch([]);
    expect(results).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────
// Router tests
// ────────────────────────────────────────────────────────────

describe('createIngestRouter', () => {
  const makeEvent = (type: string): IngestEvent => ({
    type,
    timestamp: Date.now(),
    sessionId: 'sess_1',
  });

  let enqueued: { queue: string; payload: JobPayload; priority: JobPriority }[];
  let fakeQueue: JobQueue;

  beforeEach(() => {
    enqueued = [];
    fakeQueue = {
      enqueue: async (queue, payload, priority) => {
        enqueued.push({ queue, payload, priority });
      },
    };
  });

  test('routes crash events to high-priority crash queue', async () => {
    const router = createIngestRouter(fakeQueue);
    await router.route('app_1', [makeEvent('crash')]);

    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]!.queue).toBe(QUEUE_CRASH);
    expect(enqueued[0]!.priority).toBe('high');
    expect(enqueued[0]!.payload.appId).toBe('app_1');
    expect(enqueued[0]!.payload.events).toHaveLength(1);
  });

  test('routes ANR events to high-priority crash queue', async () => {
    const router = createIngestRouter(fakeQueue);
    await router.route('app_1', [makeEvent('anr')]);

    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]!.queue).toBe(QUEUE_CRASH);
    expect(enqueued[0]!.priority).toBe('high');
  });

  test('routes OTLP events to the OTLP queue', async () => {
    const router = createIngestRouter(fakeQueue);
    await router.route('app_1', [makeEvent('otlp')]);

    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]!.queue).toBe(QUEUE_OTLP);
    expect(enqueued[0]!.priority).toBe('normal');
  });

  test('routes normal events to the events queue', async () => {
    const router = createIngestRouter(fakeQueue);
    await router.route('app_1', [makeEvent('network'), makeEvent('navigation')]);

    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]!.queue).toBe(QUEUE_EVENTS);
    expect(enqueued[0]!.priority).toBe('normal');
    expect(enqueued[0]!.payload.events).toHaveLength(2);
  });

  test('partitions mixed event types into separate queues', async () => {
    const router = createIngestRouter(fakeQueue);
    await router.route('app_1', [
      makeEvent('crash'),
      makeEvent('network'),
      makeEvent('anr'),
      makeEvent('otlp'),
      makeEvent('render'),
    ]);

    expect(enqueued).toHaveLength(3);

    const crashJob = enqueued.find((e) => e.queue === QUEUE_CRASH);
    const eventJob = enqueued.find((e) => e.queue === QUEUE_EVENTS);
    const otlpJob = enqueued.find((e) => e.queue === QUEUE_OTLP);

    expect(crashJob).toBeDefined();
    expect(crashJob!.payload.events).toHaveLength(2); // crash + anr
    expect(crashJob!.priority).toBe('high');

    expect(eventJob).toBeDefined();
    expect(eventJob!.payload.events).toHaveLength(2); // network + render

    expect(otlpJob).toBeDefined();
    expect(otlpJob!.payload.events).toHaveLength(1);
  });

  test('does nothing for empty event list', async () => {
    const router = createIngestRouter(fakeQueue);
    await router.route('app_1', []);
    expect(enqueued).toHaveLength(0);
  });

  test('includes enqueuedAt timestamp in payload', async () => {
    const before = Date.now();
    const router = createIngestRouter(fakeQueue);
    await router.route('app_1', [makeEvent('custom')]);
    const after = Date.now();

    expect(enqueued[0]!.payload.enqueuedAt).toBeGreaterThanOrEqual(before);
    expect(enqueued[0]!.payload.enqueuedAt).toBeLessThanOrEqual(after);
  });
});
