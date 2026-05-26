// Task 117.81 — AI agent action audit trail.
//
// Wraps the storage methods with input validation + sane shape coercion
// so the REST layer can be a thin pass-through. Two operations:
//
//   recordAiAction(store, body) — validates a JSON envelope and writes
//     one row. Returns `{ inserted, record }` so the REST handler can
//     surface the dedup result honestly.
//   listAiActions(store, filter) — paginated list with the usual
//     (since, until, agent, action, fingerprint, outcome, limit, offset).
//
// The validation rules are intentionally loose on the metadata/tools/
// files/labels fields — the audit trail is supposed to capture what
// the agent did, even if a future agent emits a shape this code didn't
// anticipate. We only enforce the required core fields.

import type {
  AiActionListFilter,
  AiActionRecord,
  AiActionOutcome,
} from '../storage/types.js';
import type { IMonitorStore } from '../storage/IMonitorStore.js';

export type RecordAiActionInputError =
  | 'missing-id'
  | 'missing-agent'
  | 'missing-action'
  | 'missing-outcome'
  | 'invalid-timestamp'
  | 'invalid-confidence'
  | 'string-too-long'
  | 'metadata-too-large';

const MAX_STRING = 2_000;
const MAX_ARRAY = 64;
/**
 * Audit-fix: cap serialised metadata at 16 KB. Without this a buggy
 * agent (or a compromised one) could land a multi-MB blob in SQLite
 * — slow inserts, slow reads, log flooding. The threshold is
 * generous enough for a normal skip-with-detail row plus a few
 * validation failures; well past the 99th percentile of real rows.
 */
const MAX_METADATA_BYTES = 16 * 1024;

/**
 * Audit-fix: scrub free-form text that may have travelled through
 * untrusted telemetry before reaching the audit log. The sanitiser
 * (Task 117.80) strips ANSI / zero-width / agent-tag / jailbreak
 * payloads. We use a tiny inline copy here instead of importing the
 * mcp package to avoid a build-time dep cycle. Matches the same
 * pattern set as the mcp catalogue.
 */
function scrub(text: string): string {
  let out = text;
  // ANSI escapes
  // eslint-disable-next-line no-control-regex -- intentional: scrub control chars
  out = out.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
  // Control chars except \n / \t
  // eslint-disable-next-line no-control-regex -- intentional: scrub control chars
  out = out.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Zero-width / directional / format chars + tag chars
  // eslint-disable-next-line no-irregular-whitespace -- intentional: scrub these chars
  out = out.replace(/[​-‏‪-‮⁠-⁩﻿]/g, '');
  out = out.replace(/\uDB40[\uDC00-\uDC7F]/g, '');
  // Anthropic-style tag carriers
  out = out.replace(
    /<\/?(?:system|user|assistant|human|tool_use|tool_result|function_calls|parameter|antml:[a-z_]+)(?:\s[^>]*)?>/gi,
    '',
  );
  return out;
}

export interface RecordAiActionResult {
  ok: true;
  inserted: boolean;
  record: AiActionRecord;
}

export interface RecordAiActionFailure {
  ok: false;
  error: RecordAiActionInputError;
  detail?: string;
}

/**
 * Validate + insert. Returns a discriminated union the REST layer
 * translates into either 200 / 400.
 */
export function recordAiAction(
  store: IMonitorStore,
  body: unknown,
  defaults: { now: () => number } = { now: Date.now },
): RecordAiActionResult | RecordAiActionFailure {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'missing-id' };
  }
  const raw = body as Record<string, unknown>;

  const id = stringField(raw.id);
  if (!id) return { ok: false, error: 'missing-id' };
  const agent = stringField(raw.agent);
  if (!agent) return { ok: false, error: 'missing-agent' };
  const action = stringField(raw.action);
  if (!action) return { ok: false, error: 'missing-action' };
  const outcome = stringField(raw.outcome);
  if (!outcome) return { ok: false, error: 'missing-outcome' };

  const timestamp =
    typeof raw.timestamp === 'number' && Number.isFinite(raw.timestamp)
      ? raw.timestamp
      : defaults.now();
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    return { ok: false, error: 'invalid-timestamp' };
  }

  const confidence = optionalIntInRange(raw.confidence, 0, 100);
  if (confidence === 'invalid') return { ok: false, error: 'invalid-confidence' };
  const effectiveConfidence = optionalIntInRange(raw.effectiveConfidence, 0, 100);
  if (effectiveConfidence === 'invalid') {
    return { ok: false, error: 'invalid-confidence' };
  }

  for (const longField of [
    raw.user,
    raw.fingerprint,
    raw.classification,
    raw.prUrl,
  ]) {
    if (typeof longField === 'string' && longField.length > MAX_STRING) {
      return { ok: false, error: 'string-too-long' };
    }
  }

  const record: AiActionRecord = {
    id,
    timestamp,
    agent,
    action,
    outcome: outcome as AiActionOutcome,
  };
  // Audit-fix (117.81 follow-up): scrub free-form text. Identifier-
  // shaped fields would normally pass through verbatim, but here we
  // treat them as untrusted because telemetry could have flowed in via
  // context-building (a malicious crash payload landing in the
  // fingerprint via a content-hash collision, etc.) — defence-in-
  // depth is cheap.
  if (typeof raw.user === 'string') record.user = scrub(raw.user);
  if (typeof raw.fingerprint === 'string') record.fingerprint = scrub(raw.fingerprint);
  if (typeof raw.classification === 'string') record.classification = scrub(raw.classification);
  if (typeof raw.prUrl === 'string') record.prUrl = scrub(raw.prUrl);
  // 'invalid' was already short-circuited above; narrow with typeof.
  if (typeof confidence === 'number') record.confidence = confidence;
  if (typeof effectiveConfidence === 'number') record.effectiveConfidence = effectiveConfidence;
  const toolsCalled = stringArray(raw.toolsCalled);
  if (toolsCalled !== null) record.toolsCalled = toolsCalled;
  const filesConsidered = stringArray(raw.filesConsidered);
  if (filesConsidered !== null) record.filesConsidered = filesConsidered;
  const redactionLabels = stringArray(raw.redactionLabels);
  if (redactionLabels !== null) record.redactionLabels = redactionLabels;
  if (raw.metadata && typeof raw.metadata === 'object') {
    // Audit-fix: cap metadata at 16 KB. A buggy or compromised agent
    // could otherwise pin multi-MB blobs in SQLite — slow inserts,
    // slow reads, log floods. The cap is generous enough for normal
    // skip-with-detail rows + a few validation failures.
    let serialisedOk = false;
    let serialised = '{}';
    let parsed: Record<string, unknown> = {};
    try {
      serialised = JSON.stringify(raw.metadata);
      // Re-parse to drop any data the store wouldn't be able to round
      // trip (functions, BigInts, Dates flattened to strings, etc.) —
      // and to give the SQLite layer a guaranteed-serialisable shape
      // so it can't throw on its own JSON.stringify pass.
      parsed = JSON.parse(serialised) as Record<string, unknown>;
      serialisedOk = true;
    } catch {
      // Cyclic / non-serialisable metadata — accept but normalise to
      // an empty object rather than 400, since the rest of the row
      // still carries useful information.
      serialised = '{}';
      parsed = {};
    }
    if (Buffer.byteLength(serialised, 'utf8') > MAX_METADATA_BYTES) {
      return {
        ok: false,
        error: 'metadata-too-large',
        detail: `${Buffer.byteLength(serialised, 'utf8')} > ${MAX_METADATA_BYTES}`,
      };
    }
    if (serialisedOk) record.metadata = parsed;
  }

  const { inserted } = store.insertAiAction(record);
  return { ok: true, inserted, record };
}

export interface AiActionListResponse {
  rows: AiActionRecord[];
  total: number;
}

export function listAiActions(
  store: IMonitorStore,
  filter: AiActionListFilter = {},
): AiActionListResponse {
  return {
    rows: store.listAiActions(filter),
    total: store.countAiActions(filter),
  };
}

/**
 * Parse the URL search params shape the REST layer hands in. Returns a
 * normalised filter — invalid values silently fall back rather than
 * throwing, because the audit log query path is a debug surface and a
 * 200 with empty results beats a 400 from a typo'd filter.
 */
export function parseListFilter(params: URLSearchParams): AiActionListFilter {
  const filter: AiActionListFilter = {};
  const since = numericParam(params.get('since'));
  if (since !== null) filter.since = since;
  const until = numericParam(params.get('until'));
  if (until !== null) filter.until = until;
  const agent = params.get('agent');
  if (agent && agent.length > 0) filter.agent = agent;
  const action = params.get('action');
  if (action && action.length > 0) filter.action = action;
  const fingerprint = params.get('fingerprint');
  if (fingerprint && fingerprint.length > 0) filter.fingerprint = fingerprint;
  const outcomes = params.getAll('outcome').filter((s) => s.length > 0);
  if (outcomes.length === 1) filter.outcome = outcomes[0] as AiActionOutcome;
  else if (outcomes.length > 1) filter.outcome = outcomes as AiActionOutcome[];
  const limit = numericParam(params.get('limit'));
  if (limit !== null) filter.limit = Math.min(1000, Math.max(1, Math.round(limit)));
  const offset = numericParam(params.get('offset'));
  if (offset !== null) filter.offset = Math.max(0, Math.round(offset));
  return filter;
}

function stringField(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  if (v.length === 0 || v.length > MAX_STRING) return null;
  return v;
}

function stringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const entry of v) {
    if (typeof entry !== 'string') continue;
    if (entry.length === 0 || entry.length > MAX_STRING) continue;
    out.push(entry);
    if (out.length >= MAX_ARRAY) break;
  }
  return out;
}

function optionalIntInRange(
  v: unknown,
  min: number,
  max: number,
): number | null | 'invalid' {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return 'invalid';
  if (n < min || n > max) return 'invalid';
  return Math.round(n);
}

function numericParam(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
