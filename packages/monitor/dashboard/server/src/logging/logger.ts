// Task 117.69 — structured server logging (JSON + correlation IDs).
//
// A tiny, dependency-free structured logger. Each call emits exactly one
// JSON object per line: `{ ts, level, msg, ...fields }`. Designed for the
// HTTP control plane only — it is deliberately kept OFF the hot WebSocket
// ingest path, which has its own lean counters (see ingest/wsHandler.ts).
//
// Child loggers (`logger.child({ requestId })`) bind extra fields that are
// merged into every line they emit. This is how a per-request correlation
// id threads through request start / finish / error logs without the call
// sites having to pass it around manually.
//
// Everything is injectable for tests: a capturing `stream`, a fixed `now`
// clock, and a deterministic id generator (`createRequestId`). The default
// stream is `process.stderr` so logs never pollute stdout (which may carry
// machine-readable output) and the default level is `info`.

/**
 * Log levels in ascending severity. A logger configured at level `L`
 * emits a record only when the record's level is `>= L`.
 */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** A field bag merged into every emitted record. Values must be JSON-safe. */
export type LogFields = Record<string, unknown>;

/**
 * Minimal sink contract — anything with a `write(line: string)` method.
 * `process.stderr` satisfies this, as do test capture buffers and
 * Node `Writable` streams.
 */
export interface LogStream {
  write(chunk: string): void;
}

export interface CreateLoggerOptions {
  /** Minimum level to emit. Default `info`. */
  level?: LogLevel;
  /** Output sink. Default `process.stderr`. */
  stream?: LogStream;
  /** Clock injection for tests. Default `Date.now`. */
  now?: () => number;
  /**
   * Bound fields merged into every record this logger emits. Internal —
   * child loggers populate this; callers use `createLogger({ level })`.
   */
  fields?: LogFields;
}

export interface Logger {
  /** Current minimum level. */
  readonly level: LogLevel;
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /**
   * Derive a child logger that merges `fields` into every record it (and
   * its own descendants) emit. Shares the parent's stream, clock, and
   * level. Child fields override parent fields on key collision.
   */
  child(fields: LogFields): Logger;
}

/**
 * Default correlation id generator. Short, URL-safe, collision-resistant
 * enough for request tracing within a single process lifetime. Tests
 * inject a fixed generator instead.
 */
export function createRequestId(): string {
  // 9 base-36 chars from the high bits of two random draws — ~46 bits of
  // entropy. We avoid `crypto.randomUUID()` to keep this allocation-light
  // and dependency-free; request ids only need to be unique per process.
  const a = Math.random().toString(36).slice(2, 7);
  const b = Math.random().toString(36).slice(2, 6);
  return `req_${a}${b}`;
}

function resolveStream(stream: LogStream | undefined): LogStream {
  return stream ?? process.stderr;
}

class JsonLogger implements Logger {
  readonly level: LogLevel;
  private readonly stream: LogStream;
  private readonly now: () => number;
  private readonly boundFields: LogFields;
  private readonly minRank: number;

  constructor(options: CreateLoggerOptions) {
    this.level = options.level ?? 'info';
    this.stream = resolveStream(options.stream);
    this.now = options.now ?? Date.now;
    this.boundFields = options.fields ?? {};
    this.minRank = LEVEL_RANK[this.level];
  }

  debug(msg: string, fields?: LogFields): void {
    this.emit('debug', msg, fields);
  }

  info(msg: string, fields?: LogFields): void {
    this.emit('info', msg, fields);
  }

  warn(msg: string, fields?: LogFields): void {
    this.emit('warn', msg, fields);
  }

  error(msg: string, fields?: LogFields): void {
    this.emit('error', msg, fields);
  }

  child(fields: LogFields): Logger {
    return new JsonLogger({
      level: this.level,
      stream: this.stream,
      now: this.now,
      // Parent fields first so the child's own fields win on collision.
      fields: { ...this.boundFields, ...fields },
    });
  }

  private emit(level: LogLevel, msg: string, fields?: LogFields): void {
    if (LEVEL_RANK[level] < this.minRank) return;
    // Field precedence: bound fields are the base, per-call fields win
    // over them — but ts/level/msg are always authoritative and set last
    // so no caller-supplied field can clobber the record's identity.
    const record: LogFields = {
      ...this.boundFields,
      ...(fields ?? {}),
      ts: this.now(),
      level,
      msg,
    };
    let line: string;
    try {
      line = JSON.stringify(record);
    } catch {
      // A non-serialisable field (cycle, BigInt) must never crash the
      // request path — fall back to a minimal record describing the drop.
      line = JSON.stringify({
        ts: this.now(),
        level,
        msg,
        logError: 'unserialisable_fields',
      });
    }
    try {
      this.stream.write(line + '\n');
    } catch {
      // A failing sink (closed stream) must not propagate into the caller.
    }
  }
}

/**
 * Construct a structured JSON logger. Defaults: level `info`, stream
 * `process.stderr`, clock `Date.now`, and the built-in request-id
 * generator (used by callers, not the logger itself).
 */
export function createLogger(options: CreateLoggerOptions = {}): Logger {
  return new JsonLogger(options);
}
