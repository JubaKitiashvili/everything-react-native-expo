/**
 * Event validation for the ingest pipeline.
 * Validates required fields, type enum, and timestamp range.
 */

// ────────────────────────────────────────────────────────────
// Supported event types
// ────────────────────────────────────────────────────────────

const VALID_EVENT_TYPES = new Set([
  'crash',
  'network',
  'navigation',
  'render',
  'custom',
  'perf',
  'startup',
  'fps',
  'anr',
  'thermal',
  'memory',
  'breadcrumb',
  'otlp',
] as const);

export type EventType = typeof VALID_EVENT_TYPES extends Set<infer T> ? T : never;

// ────────────────────────────────────────────────────────────
// Validated event shape
// ────────────────────────────────────────────────────────────

export interface IngestEvent {
  readonly type: string;
  readonly timestamp: number;
  readonly sessionId: string;
  readonly fingerprint?: string;
  readonly severity?: string;
  readonly screen?: string;
  readonly data?: Record<string, unknown>;
  readonly device?: Record<string, unknown>;
  readonly enrichment?: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────
// Validation result
// ────────────────────────────────────────────────────────────

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly event?: IngestEvent;
}

// ────────────────────────────────────────────────────────────
// Timestamp range constants
// ────────────────────────────────────────────────────────────

/** Events older than 7 days are rejected. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Events more than 5 minutes in the future are rejected. */
const MAX_FUTURE_MS = 5 * 60 * 1000;

// ────────────────────────────────────────────────────────────
// Validator
// ────────────────────────────────────────────────────────────

export const validateEvent = (raw: unknown): ValidationResult => {
  const errors: string[] = [];

  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, errors: ['Event must be a non-null object'] };
  }

  const obj = raw as Record<string, unknown>;

  // Required: type
  if (typeof obj['type'] !== 'string' || obj['type'].length === 0) {
    errors.push('Missing or invalid "type": must be a non-empty string');
  } else if (!VALID_EVENT_TYPES.has(obj['type'] as EventType)) {
    errors.push(`Invalid "type": "${obj['type']}". Must be one of: ${[...VALID_EVENT_TYPES].join(', ')}`);
  }

  // Required: timestamp
  if (typeof obj['timestamp'] !== 'number' || !Number.isFinite(obj['timestamp'])) {
    errors.push('Missing or invalid "timestamp": must be a finite number (epoch ms)');
  } else {
    const now = Date.now();
    const ts = obj['timestamp'] as number;
    if (ts < now - MAX_AGE_MS) {
      errors.push(`Timestamp too old: event is ${Math.round((now - ts) / 3600000)}h in the past (max ${MAX_AGE_MS / 3600000}h)`);
    }
    if (ts > now + MAX_FUTURE_MS) {
      errors.push(`Timestamp in the future: event is ${Math.round((ts - now) / 1000)}s ahead (max ${MAX_FUTURE_MS / 1000}s)`);
    }
  }

  // Required: sessionId
  if (typeof obj['sessionId'] !== 'string' || obj['sessionId'].length === 0) {
    errors.push('Missing or invalid "sessionId": must be a non-empty string');
  }

  // Optional field type checks
  if (obj['fingerprint'] !== undefined && typeof obj['fingerprint'] !== 'string') {
    errors.push('"fingerprint" must be a string if present');
  }
  if (obj['severity'] !== undefined && typeof obj['severity'] !== 'string') {
    errors.push('"severity" must be a string if present');
  }
  if (obj['screen'] !== undefined && typeof obj['screen'] !== 'string') {
    errors.push('"screen" must be a string if present');
  }
  if (obj['data'] !== undefined && (typeof obj['data'] !== 'object' || obj['data'] === null || Array.isArray(obj['data']))) {
    errors.push('"data" must be a plain object if present');
  }
  if (obj['device'] !== undefined && (typeof obj['device'] !== 'object' || obj['device'] === null || Array.isArray(obj['device']))) {
    errors.push('"device" must be a plain object if present');
  }
  if (obj['enrichment'] !== undefined && (typeof obj['enrichment'] !== 'object' || obj['enrichment'] === null || Array.isArray(obj['enrichment']))) {
    errors.push('"enrichment" must be a plain object if present');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const event: IngestEvent = {
    type: obj['type'] as string,
    timestamp: obj['timestamp'] as number,
    sessionId: obj['sessionId'] as string,
    ...(obj['fingerprint'] !== undefined && { fingerprint: obj['fingerprint'] as string }),
    ...(obj['severity'] !== undefined && { severity: obj['severity'] as string }),
    ...(obj['screen'] !== undefined && { screen: obj['screen'] as string }),
    ...(obj['data'] !== undefined && { data: obj['data'] as Record<string, unknown> }),
    ...(obj['device'] !== undefined && { device: obj['device'] as Record<string, unknown> }),
    ...(obj['enrichment'] !== undefined && { enrichment: obj['enrichment'] as Record<string, unknown> }),
  };

  return { valid: true, errors: [], event };
};

/**
 * Validate a batch of events. Returns per-event results.
 */
export const validateBatch = (
  events: readonly unknown[],
): readonly ValidationResult[] => events.map(validateEvent);
