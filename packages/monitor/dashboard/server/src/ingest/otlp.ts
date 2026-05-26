import { createHash } from 'node:crypto';
import type { EventRecord, Severity } from '../storage/types.js';

/**
 * Task 117.11 — OpenTelemetry (OTLP/HTTP **JSON**) ingest mapper.
 *
 * Pure translation from the OTLP/HTTP JSON wire format into our
 * `EventRecord[]`, so ANY OTel SDK / collector can export telemetry to
 * ERNE via `POST /v1/traces|/v1/logs|/v1/metrics`. The functions here are
 * deliberately side-effect free (JSON in → records out) so they're trivial
 * to unit test; the server route wires them to the store.
 *
 * We hand-parse the protobuf-derived JSON rather than depending on the
 * `@opentelemetry/*` packages — the format is stable and small, and a
 * runtime dep on the full OTel stack is unjustified for a read-mapper.
 *
 * Defensive by construction: every accessor tolerates missing/partial
 * fields, empty arrays, and nanosecond timestamps expressed as either a
 * JSON string (the common encoding for 64-bit ints) or a number.
 */

const VALID_SEVERITIES: ReadonlyArray<Severity> = [
  'critical',
  'warning',
  'info',
  'success',
  'muted',
];

// ──────────────────────────────────────────────────────────────────
// OTLP/JSON wire shapes (the subset we read).
// ──────────────────────────────────────────────────────────────────

/** OTLP AnyValue — a tagged union of primitive / array / kvlist values. */
interface OtlpAnyValue {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: string | number;
  doubleValue?: number;
  bytesValue?: string;
  arrayValue?: { values?: OtlpAnyValue[] };
  kvlistValue?: { values?: OtlpKeyValue[] };
}

interface OtlpKeyValue {
  key?: string;
  value?: OtlpAnyValue;
}

interface OtlpResource {
  attributes?: OtlpKeyValue[];
}

interface OtlpScope {
  name?: string;
  version?: string;
}

interface OtlpSpan {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  name?: string;
  kind?: number;
  startTimeUnixNano?: string | number;
  endTimeUnixNano?: string | number;
  attributes?: OtlpKeyValue[];
  status?: { code?: number; message?: string };
}

interface OtlpLogRecord {
  timeUnixNano?: string | number;
  observedTimeUnixNano?: string | number;
  severityNumber?: number;
  severityText?: string;
  body?: OtlpAnyValue;
  attributes?: OtlpKeyValue[];
  traceId?: string;
  spanId?: string;
}

interface OtlpNumberDataPoint {
  timeUnixNano?: string | number;
  startTimeUnixNano?: string | number;
  asDouble?: number;
  asInt?: string | number;
  attributes?: OtlpKeyValue[];
}

interface OtlpMetric {
  name?: string;
  unit?: string;
  description?: string;
  gauge?: { dataPoints?: OtlpNumberDataPoint[] };
  sum?: { dataPoints?: OtlpNumberDataPoint[] };
  histogram?: { dataPoints?: OtlpHistogramDataPoint[] };
  summary?: { dataPoints?: OtlpHistogramDataPoint[] };
}

interface OtlpHistogramDataPoint {
  timeUnixNano?: string | number;
  startTimeUnixNano?: string | number;
  count?: string | number;
  sum?: number;
  attributes?: OtlpKeyValue[];
}

interface OtlpScopeSpans {
  scope?: OtlpScope;
  spans?: OtlpSpan[];
}

interface OtlpResourceSpans {
  resource?: OtlpResource;
  scopeSpans?: OtlpScopeSpans[];
}

interface OtlpTracesPayload {
  resourceSpans?: OtlpResourceSpans[];
}

interface OtlpScopeLogs {
  scope?: OtlpScope;
  logRecords?: OtlpLogRecord[];
}

interface OtlpResourceLogs {
  resource?: OtlpResource;
  scopeLogs?: OtlpScopeLogs[];
}

interface OtlpLogsPayload {
  resourceLogs?: OtlpResourceLogs[];
}

interface OtlpScopeMetrics {
  scope?: OtlpScope;
  metrics?: OtlpMetric[];
}

interface OtlpResourceMetrics {
  resource?: OtlpResource;
  scopeMetrics?: OtlpScopeMetrics[];
}

interface OtlpMetricsPayload {
  resourceMetrics?: OtlpResourceMetrics[];
}

// ──────────────────────────────────────────────────────────────────
// Primitive coercers.
// ──────────────────────────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Convert an OTLP `*UnixNano` field (string or number, nanoseconds) into
 * integer milliseconds. Returns `null` when the input is absent/unparseable
 * so callers can fall back to `now`.
 */
export function unixNanoToMs(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.floor(value / 1_000_000);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0 || !/^\d+$/.test(trimmed)) return null;
    // Nanosecond values overflow 2^53, so divide on BigInt to keep
    // millisecond precision exact, then narrow to Number (ms since epoch
    // fits comfortably in a double for any realistic timestamp).
    return Number(BigInt(trimmed) / 1_000_000n);
  }
  return null;
}

/** Flatten a single OTLP AnyValue into a plain JS value for storage. */
export function anyValueToJs(value: OtlpAnyValue | undefined): unknown {
  if (!value || typeof value !== 'object') return undefined;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.boolValue !== undefined) return value.boolValue;
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.intValue !== undefined) {
    const n = Number(value.intValue);
    return Number.isFinite(n) ? n : String(value.intValue);
  }
  if (value.bytesValue !== undefined) return value.bytesValue;
  if (value.arrayValue !== undefined) {
    return asArray<OtlpAnyValue>(value.arrayValue.values).map((v) => anyValueToJs(v));
  }
  if (value.kvlistValue !== undefined) {
    return attributesToObject(value.kvlistValue.values);
  }
  return undefined;
}

/** Flatten an OTLP KeyValue[] into a plain object suitable for storage. */
export function attributesToObject(
  attributes: OtlpKeyValue[] | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const kv of asArray<OtlpKeyValue>(attributes)) {
    if (!kv || typeof kv.key !== 'string' || kv.key.length === 0) continue;
    const js = anyValueToJs(kv.value);
    if (js !== undefined) out[kv.key] = js;
  }
  return out;
}

/**
 * Derive a session id from resource attributes when one isn't explicit.
 * OTel has no first-class "session", so we prefer `service.name`
 * (the closest stable grouping key), then any caller-supplied
 * `session.id` attribute, then a stable fallback.
 */
function deriveSessionId(resourceAttrs: Record<string, unknown>): string {
  const candidate =
    pickString(resourceAttrs['session.id']) ??
    pickString(resourceAttrs['service.name']) ??
    pickString(resourceAttrs['service.instance.id']);
  if (candidate) return `otel:${candidate}`;
  return 'otel:unknown';
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Deterministic id so a replayed OTLP export collapses on the events PK. */
function deterministicId(prefix: string, parts: unknown[]): string {
  const hash = createHash('sha1');
  hash.update(parts.map((p) => JSON.stringify(p ?? null)).join('|'));
  return `${prefix}_${hash.digest('hex').slice(0, 16)}`;
}

/**
 * Map an OTLP `severityNumber` (1–24) to our coarse `Severity` ladder.
 * Falls back to a textual `severityText` match, then `info`.
 * OTel ranges: 1–4 TRACE, 5–8 DEBUG, 9–12 INFO, 13–16 WARN, 17–20 ERROR,
 * 21–24 FATAL.
 */
export function severityFromNumber(
  severityNumber: number | undefined,
  severityText?: string,
): Severity {
  if (typeof severityNumber === 'number' && Number.isFinite(severityNumber)) {
    // 17–20 ERROR and 21–24 FATAL both map to our coarse `critical` rung.
    if (severityNumber >= 17) return 'critical';
    if (severityNumber >= 13) return 'warning';
    if (severityNumber >= 5) return 'info';
    if (severityNumber >= 1) return 'muted';
  }
  if (typeof severityText === 'string') {
    const t = severityText.toLowerCase();
    if (t.includes('fatal') || t.includes('error')) return 'critical';
    if (t.includes('warn')) return 'warning';
    if (t.includes('trace') || t.includes('debug')) return 'muted';
  }
  return 'info';
}

// ──────────────────────────────────────────────────────────────────
// Signal mappers.
// ──────────────────────────────────────────────────────────────────

export interface OtlpMapContext {
  /** Wall clock for `receivedAt` + timestamp fallbacks. Injected in tests. */
  now?: () => number;
}

/**
 * /v1/traces → EventRecord[]. Each span becomes one `type: 'span'`
 * record. Trace/span/parent ids are preserved in `payload`, timestamps
 * are converted nanos → ms, status non-OK promotes severity to warning.
 */
export function mapTraces(payload: unknown, ctx: OtlpMapContext = {}): EventRecord[] {
  const now = ctx.now ?? Date.now;
  const records: EventRecord[] = [];
  if (!isObject(payload)) return records;
  const data = payload as OtlpTracesPayload;

  for (const rs of asArray<OtlpResourceSpans>(data.resourceSpans)) {
    const resourceAttrs = attributesToObject(rs?.resource?.attributes);
    const sessionId = deriveSessionId(resourceAttrs);
    const platform = pickString(resourceAttrs['os.type']) ?? undefined;
    for (const ss of asArray<OtlpScopeSpans>(rs?.scopeSpans)) {
      const scopeName = pickString(ss?.scope?.name);
      for (const span of asArray<OtlpSpan>(ss?.spans)) {
        const start = unixNanoToMs(span?.startTimeUnixNano);
        const end = unixNanoToMs(span?.endTimeUnixNano);
        const timestamp = start ?? now();
        const attrs = attributesToObject(span?.attributes);
        const statusCode = span?.status?.code;
        // OTLP status: 0 UNSET, 1 OK, 2 ERROR.
        const severity: Severity = statusCode === 2 ? 'warning' : 'info';
        const name =
          pickString(span?.name) ?? scopeName ?? 'span';
        const payloadObj: Record<string, unknown> = {
          name,
          ...(scopeName ? { scope: scopeName } : {}),
          ...(span?.traceId ? { traceId: span.traceId } : {}),
          ...(span?.spanId ? { spanId: span.spanId } : {}),
          ...(span?.parentSpanId ? { parentSpanId: span.parentSpanId } : {}),
          ...(typeof span?.kind === 'number' ? { kind: span.kind } : {}),
          ...(start !== null ? { startTimeMs: start } : {}),
          ...(end !== null ? { endTimeMs: end } : {}),
          ...(start !== null && end !== null ? { durationMs: end - start } : {}),
          ...(statusCode !== undefined ? { statusCode } : {}),
          ...(span?.status?.message ? { statusMessage: span.status.message } : {}),
          ...(Object.keys(resourceAttrs).length > 0 ? { resource: resourceAttrs } : {}),
          ...(Object.keys(attrs).length > 0 ? { attributes: attrs } : {}),
        };
        records.push({
          id: deterministicId('otel_span', [
            span?.traceId,
            span?.spanId,
            timestamp,
            name,
          ]),
          type: 'span',
          severity,
          sessionId,
          timestamp,
          receivedAt: now(),
          payload: payloadObj,
          ...(platform ? { platform } : {}),
        });
      }
    }
  }
  return records;
}

/**
 * /v1/logs → EventRecord[]. Each logRecord becomes one `type: 'log'`
 * record. Body is flattened into `payload.message`, severityNumber maps
 * onto our `Severity` ladder, trace/span ids preserved when present.
 */
export function mapLogs(payload: unknown, ctx: OtlpMapContext = {}): EventRecord[] {
  const now = ctx.now ?? Date.now;
  const records: EventRecord[] = [];
  if (!isObject(payload)) return records;
  const data = payload as OtlpLogsPayload;

  for (const rl of asArray<OtlpResourceLogs>(data.resourceLogs)) {
    const resourceAttrs = attributesToObject(rl?.resource?.attributes);
    const sessionId = deriveSessionId(resourceAttrs);
    const platform = pickString(resourceAttrs['os.type']) ?? undefined;
    for (const sl of asArray<OtlpScopeLogs>(rl?.scopeLogs)) {
      const scopeName = pickString(sl?.scope?.name);
      for (const log of asArray<OtlpLogRecord>(sl?.logRecords)) {
        const timestamp =
          unixNanoToMs(log?.timeUnixNano) ?? unixNanoToMs(log?.observedTimeUnixNano) ?? now();
        const severity = severityFromNumber(log?.severityNumber, log?.severityText);
        const attrs = attributesToObject(log?.attributes);
        const bodyValue = anyValueToJs(log?.body);
        const message =
          typeof bodyValue === 'string'
            ? bodyValue
            : bodyValue !== undefined
              ? JSON.stringify(bodyValue)
              : '';
        const payloadObj: Record<string, unknown> = {
          message,
          ...(scopeName ? { scope: scopeName } : {}),
          ...(log?.severityText ? { severityText: log.severityText } : {}),
          ...(typeof log?.severityNumber === 'number'
            ? { severityNumber: log.severityNumber }
            : {}),
          ...(log?.traceId ? { traceId: log.traceId } : {}),
          ...(log?.spanId ? { spanId: log.spanId } : {}),
          ...(Object.keys(resourceAttrs).length > 0 ? { resource: resourceAttrs } : {}),
          ...(Object.keys(attrs).length > 0 ? { attributes: attrs } : {}),
        };
        records.push({
          id: deterministicId('otel_log', [
            sessionId,
            timestamp,
            message,
            log?.spanId,
          ]),
          type: 'log',
          severity,
          sessionId,
          timestamp,
          receivedAt: now(),
          payload: payloadObj,
          ...(platform ? { platform } : {}),
        });
      }
    }
  }
  return records;
}

/**
 * /v1/metrics → EventRecord[]. Each numeric data point of each metric
 * becomes one `type: 'metric'` record carrying `payload.name` and
 * `payload.value`. Supports gauge / sum (value = data point) and
 * histogram / summary (value = sum, with count alongside).
 */
export function mapMetrics(payload: unknown, ctx: OtlpMapContext = {}): EventRecord[] {
  const now = ctx.now ?? Date.now;
  const records: EventRecord[] = [];
  if (!isObject(payload)) return records;
  const data = payload as OtlpMetricsPayload;

  for (const rm of asArray<OtlpResourceMetrics>(data.resourceMetrics)) {
    const resourceAttrs = attributesToObject(rm?.resource?.attributes);
    const sessionId = deriveSessionId(resourceAttrs);
    const platform = pickString(resourceAttrs['os.type']) ?? undefined;
    for (const sm of asArray<OtlpScopeMetrics>(rm?.scopeMetrics)) {
      const scopeName = pickString(sm?.scope?.name);
      for (const metric of asArray<OtlpMetric>(sm?.metrics)) {
        const name = pickString(metric?.name) ?? 'metric';
        const numberPoints = [
          ...asArray<OtlpNumberDataPoint>(metric?.gauge?.dataPoints),
          ...asArray<OtlpNumberDataPoint>(metric?.sum?.dataPoints),
        ];
        for (const point of numberPoints) {
          records.push(
            buildMetricRecord({
              name,
              scopeName,
              metric,
              value: numberPointValue(point),
              point,
              resourceAttrs,
              sessionId,
              platform,
              now,
            }),
          );
        }
        const aggPoints = [
          ...asArray<OtlpHistogramDataPoint>(metric?.histogram?.dataPoints),
          ...asArray<OtlpHistogramDataPoint>(metric?.summary?.dataPoints),
        ];
        for (const point of aggPoints) {
          const count = toFiniteNumber(point?.count);
          records.push(
            buildMetricRecord({
              name,
              scopeName,
              metric,
              value: typeof point?.sum === 'number' ? point.sum : (count ?? 0),
              point,
              resourceAttrs,
              sessionId,
              platform,
              now,
              extra: count !== null ? { count } : undefined,
            }),
          );
        }
      }
    }
  }
  return records;
}

function numberPointValue(point: OtlpNumberDataPoint): number {
  if (typeof point?.asDouble === 'number' && Number.isFinite(point.asDouble)) {
    return point.asDouble;
  }
  const asInt = toFiniteNumber(point?.asInt);
  return asInt ?? 0;
}

function toFiniteNumber(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

interface MetricRecordInput {
  name: string;
  scopeName: string | null;
  metric: OtlpMetric;
  value: number;
  point: OtlpNumberDataPoint | OtlpHistogramDataPoint;
  resourceAttrs: Record<string, unknown>;
  sessionId: string;
  platform: string | undefined;
  now: () => number;
  extra?: Record<string, unknown>;
}

function buildMetricRecord(input: MetricRecordInput): EventRecord {
  const { name, scopeName, metric, value, point, resourceAttrs, sessionId, platform, now } = input;
  const timestamp = unixNanoToMs(point?.timeUnixNano) ?? now();
  const attrs = attributesToObject(point?.attributes);
  const payloadObj: Record<string, unknown> = {
    name,
    value,
    ...(input.extra ?? {}),
    ...(metric?.unit ? { unit: metric.unit } : {}),
    ...(metric?.description ? { description: metric.description } : {}),
    ...(scopeName ? { scope: scopeName } : {}),
    ...(Object.keys(resourceAttrs).length > 0 ? { resource: resourceAttrs } : {}),
    ...(Object.keys(attrs).length > 0 ? { attributes: attrs } : {}),
  };
  const record: EventRecord = {
    id: deterministicId('otel_metric', [sessionId, name, timestamp, value, attrs]),
    type: 'metric',
    severity: 'info',
    sessionId,
    timestamp,
    receivedAt: now(),
    payload: payloadObj,
  };
  if (platform) record.platform = platform;
  return record;
}

// Keep the VALID_SEVERITIES export available for any future validation
// without re-deriving the ladder; referenced by tests.
export { VALID_SEVERITIES };
