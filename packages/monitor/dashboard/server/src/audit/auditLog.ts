// Task 117.65 — operator audit log.
//
// Distinct from `ai_actions` (what the *agent* did): this records what an
// *operator* did to the dashboard control plane — exporting a data
// subject's data, deleting it (DSAR), changing config, signing in/out.
//
// Two surfaces:
//
//   recordAuditEvent(store, input, logger?) — the internal helper the
//     REST mutating routes call. It generates an id, stamps the time,
//     scrubs free-form text, and writes one row. CRUCIALLY it never
//     throws: an audit-write failure must not break the underlying
//     request, so the whole thing is wrapped in try/catch and the error
//     is logged, not propagated.
//   listAuditLogs(store, filter) / parseListFilter(params) — the read
//     path behind `GET /api/audit`, mirroring the ai-actions list shape.
//
// Validation is intentionally loose on metadata so the trail can capture
// whatever the route wants to record even for shapes this code didn't
// anticipate. Metadata is pre-serialised + size-capped so a non-
// serialisable or oversized bag can't crash SQLite or flood the log.

import { randomUUID } from 'node:crypto';
import type {
  AuditLogAction,
  AuditLogListFilter,
  AuditLogRecord,
} from '../storage/types.js';
import type { IMonitorStore } from '../storage/IMonitorStore.js';

const MAX_STRING = 2_000;
/**
 * Cap serialised metadata at 16 KB — same threshold as the ai-actions
 * trail. Generous for normal rows (a patch-key list, a delete count)
 * but well short of letting a buggy caller pin a multi-MB blob.
 */
const MAX_METADATA_BYTES = 16 * 1024;

// Same sanitisation as aiActions.ts. The control/zero-width patterns are
// built from runtime-composed strings (via `String.fromCharCode`) so the
// source carries no literal control / irregular-whitespace characters and
// eslint can't statically flag the regex. Behaviourally identical: ANSI
// escapes, control chars (except \n / \t), zero-width / directional /
// format chars, and tag carriers all get stripped.
const cc = (code: number): string => String.fromCharCode(code);
const ANSI_RE = new RegExp(cc(0x1b) + '\\[[0-9;?]*[A-Za-z]', 'g');
const CONTROL_RE = new RegExp(
  `[${cc(0x00)}-${cc(0x08)}${cc(0x0b)}${cc(0x0c)}${cc(0x0e)}-${cc(0x1f)}${cc(0x7f)}]`,
  'g',
);
const ZERO_WIDTH_RE = new RegExp(
  `[${cc(0x200b)}-${cc(0x200f)}${cc(0x202a)}-${cc(0x202e)}${cc(0x2060)}-${cc(0x2069)}${cc(0xfeff)}]`,
  'g',
);
const TAG_CARRIER_RE = new RegExp(`${cc(0xdb40)}[${cc(0xdc00)}-${cc(0xdc7f)}]`, 'g');
const ANTHROPIC_TAG_RE =
  /<\/?(?:system|user|assistant|human|tool_use|tool_result|function_calls|parameter|antml:[a-z_]+)(?:\s[^>]*)?>/gi;

/**
 * Scrub free-form text that may have travelled through untrusted
 * telemetry (a user id derived from a crash payload, an IP header an
 * attacker controls). Strips ANSI / control / zero-width / agent-tag
 * payloads. Inline copy to avoid a build-time dep on the mcp package.
 */
function scrub(text: string): string {
  let out = text;
  out = out.replace(ANSI_RE, '');
  out = out.replace(CONTROL_RE, '');
  out = out.replace(ZERO_WIDTH_RE, '');
  out = out.replace(TAG_CARRIER_RE, '');
  out = out.replace(ANTHROPIC_TAG_RE, '');
  return out.slice(0, MAX_STRING);
}

export interface AuditEventInput {
  action: AuditLogAction;
  /** Operator id when known. Defaults to 'anonymous'. */
  actor?: string;
  targetType?: string;
  targetId?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogger {
  warn(message: string, fields?: Record<string, unknown>): void;
}

/**
 * Record one operator action. Best-effort: returns the inserted record
 * on success, or `null` if anything went wrong (the failure is logged,
 * never thrown). Callers fire this and ignore the result — the audit
 * log is observability, not a precondition for the request.
 */
export function recordAuditEvent(
  store: Pick<IMonitorStore, 'recordAuditLog'>,
  input: AuditEventInput,
  logger?: AuditLogger,
  now: () => number = Date.now,
): AuditLogRecord | null {
  try {
    const record: AuditLogRecord = {
      id: randomUUID(),
      timestamp: now(),
      actor: input.actor ? scrub(input.actor) : 'anonymous',
      action: input.action,
    };
    if (input.targetType) record.targetType = scrub(input.targetType);
    if (input.targetId) record.targetId = scrub(input.targetId);
    if (input.ip) record.ip = scrub(input.ip);
    if (input.metadata && typeof input.metadata === 'object') {
      const normalised = normaliseMetadata(input.metadata);
      if (normalised !== null) record.metadata = normalised;
    }
    store.recordAuditLog(record);
    return record;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger?.warn('audit.write_failed', { action: input.action, message });
    return null;
  }
}

/**
 * Re-serialise metadata so the store gets a guaranteed round-trippable,
 * size-bounded object. Cyclic / non-serialisable → dropped (returns
 * null). Oversized → dropped. Never throws.
 */
function normaliseMetadata(value: Record<string, unknown>): Record<string, unknown> | null {
  let serialised: string;
  try {
    serialised = JSON.stringify(value);
  } catch {
    return null;
  }
  if (!serialised) return null;
  if (Buffer.byteLength(serialised, 'utf8') > MAX_METADATA_BYTES) return null;
  try {
    return JSON.parse(serialised) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface AuditLogListResponse {
  rows: AuditLogRecord[];
  total: number;
}

export function listAuditLogs(
  store: Pick<IMonitorStore, 'listAuditLogs' | 'countAuditLogs'>,
  filter: AuditLogListFilter = {},
): AuditLogListResponse {
  return {
    rows: store.listAuditLogs(filter),
    total: store.countAuditLogs(filter),
  };
}

/**
 * Parse the URL search params the REST layer hands in. Invalid values
 * fall back silently rather than throwing — the audit query path is a
 * debug surface, so a 200 with empty results beats a 400 from a typo'd
 * filter.
 */
export function parseListFilter(params: URLSearchParams): AuditLogListFilter {
  const filter: AuditLogListFilter = {};
  const since = numericParam(params.get('since'));
  if (since !== null) filter.since = since;
  const until = numericParam(params.get('until'));
  if (until !== null) filter.until = until;
  const actor = params.get('actor');
  if (actor && actor.length > 0) filter.actor = actor;
  const targetType = params.get('targetType');
  if (targetType && targetType.length > 0) filter.targetType = targetType;
  const targetId = params.get('targetId');
  if (targetId && targetId.length > 0) filter.targetId = targetId;
  const actions = params.getAll('action').filter((s) => s.length > 0);
  if (actions.length === 1) filter.action = actions[0] as AuditLogAction;
  else if (actions.length > 1) filter.action = actions as AuditLogAction[];
  const limit = numericParam(params.get('limit'));
  if (limit !== null) filter.limit = Math.min(1000, Math.max(1, Math.round(limit)));
  const offset = numericParam(params.get('offset'));
  if (offset !== null) filter.offset = Math.max(0, Math.round(offset));
  return filter;
}

function numericParam(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
