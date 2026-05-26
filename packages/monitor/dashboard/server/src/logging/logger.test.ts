// Task 117.69 — structured logger tests.

import { describe, expect, test } from 'vitest';
import { createLogger, createRequestId, type LogStream } from './logger.js';

/** Capturing sink — collects each `write` call into a line buffer. */
function makeCapture(): { stream: LogStream; lines: string[]; records: () => Array<Record<string, unknown>> } {
  const lines: string[] = [];
  const stream: LogStream = { write: (chunk) => void lines.push(chunk) };
  const records = (): Array<Record<string, unknown>> =>
    lines
      .map((l) => l.trimEnd())
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  return { stream, lines, records };
}

describe('createLogger — JSON shape', () => {
  test('emits one JSON object per line with ts, level, msg + fields', () => {
    const cap = makeCapture();
    const log = createLogger({ stream: cap.stream, now: () => 1234, level: 'debug' });
    log.info('hello', { foo: 'bar', n: 7 });
    expect(cap.lines).toHaveLength(1);
    expect(cap.lines[0]?.endsWith('\n')).toBe(true);
    expect(cap.records()[0]).toEqual({ ts: 1234, level: 'info', msg: 'hello', foo: 'bar', n: 7 });
  });

  test('per-call fields cannot override ts/level/msg', () => {
    const cap = makeCapture();
    const log = createLogger({ stream: cap.stream, now: () => 9 });
    log.info('m', { ts: 0, level: 'debug', msg: 'override?' });
    const rec = cap.records()[0]!;
    expect(rec.ts).toBe(9);
    expect(rec.level).toBe('info');
    expect(rec.msg).toBe('m');
  });

  test('unserialisable fields degrade gracefully without throwing', () => {
    const cap = makeCapture();
    const log = createLogger({ stream: cap.stream, now: () => 1 });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => log.error('boom', { cyclic })).not.toThrow();
    expect(cap.records()[0]).toMatchObject({ level: 'error', msg: 'boom', logError: 'unserialisable_fields' });
  });
});

describe('createLogger — level filtering', () => {
  test('records below the configured level are dropped', () => {
    const cap = makeCapture();
    const log = createLogger({ stream: cap.stream, level: 'warn', now: () => 0 });
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    const levels = cap.records().map((r) => r.level);
    expect(levels).toEqual(['warn', 'error']);
  });

  test('default level is info (debug suppressed)', () => {
    const cap = makeCapture();
    const log = createLogger({ stream: cap.stream, now: () => 0 });
    log.debug('d');
    log.info('i');
    expect(cap.records().map((r) => r.msg)).toEqual(['i']);
  });
});

describe('createLogger — child field binding', () => {
  test('child merges bound fields into every record', () => {
    const cap = makeCapture();
    const log = createLogger({ stream: cap.stream, now: () => 5, level: 'debug' });
    const child = log.child({ requestId: 'req_abc', component: 'http' });
    child.info('start');
    child.warn('slow', { durationMs: 42 });
    const recs = cap.records();
    expect(recs[0]).toMatchObject({ requestId: 'req_abc', component: 'http', msg: 'start' });
    expect(recs[1]).toMatchObject({ requestId: 'req_abc', component: 'http', msg: 'slow', durationMs: 42 });
  });

  test('grandchild fields override ancestor fields on key collision', () => {
    const cap = makeCapture();
    const log = createLogger({ stream: cap.stream, now: () => 0, level: 'debug' });
    const child = log.child({ component: 'http', requestId: 'req_1' });
    const grandchild = child.child({ component: 'auth' });
    grandchild.info('m');
    expect(cap.records()[0]).toMatchObject({ component: 'auth', requestId: 'req_1' });
  });

  test('child inherits parent level', () => {
    const cap = makeCapture();
    const log = createLogger({ stream: cap.stream, level: 'error', now: () => 0 });
    const child = log.child({ requestId: 'x' });
    expect(child.level).toBe('error');
    child.info('dropped');
    child.error('kept');
    expect(cap.records().map((r) => r.msg)).toEqual(['kept']);
  });
});

describe('createRequestId', () => {
  test('produces unique req_-prefixed ids', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(createRequestId());
    for (const id of ids) expect(id).toMatch(/^req_/);
    // Collision rate should be negligible across 1000 draws.
    expect(ids.size).toBeGreaterThan(990);
  });
});
