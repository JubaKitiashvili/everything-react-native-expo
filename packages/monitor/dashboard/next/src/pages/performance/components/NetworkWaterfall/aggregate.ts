import type { EventRecord } from '@/shared/api/types';

export type RequestSeverity = 'error' | 'slow' | 'ok';

export interface NetworkRequest {
  id: string;
  method: string;
  url: string;
  host: string;
  path: string;
  status: number | null;
  durationMs: number;
  timestamp: number;
  sessionId: string;
  screen: string | null;
  initiator: string | null;
  requestSize: number | null;
  responseSize: number | null;
  requestHeaders: Record<string, string> | null;
  responseHeaders: Record<string, string> | null;
  severity: RequestSeverity;
  error: string | null;
}

export interface ClassifyOptions {
  /** Requests longer than this are flagged `slow`. Default 1000ms. */
  slowMs?: number;
}

/**
 * Pull network requests out of the event stream. Keeps events with
 * `type === 'network'`, enriches them with a severity classification,
 * and sorts newest-first so the waterfall shows the freshest request
 * at the top.
 */
export function extractNetworkRequests(
  events: EventRecord[],
  options: ClassifyOptions = {},
): NetworkRequest[] {
  const slowMs = options.slowMs ?? 1_000;
  const out: NetworkRequest[] = [];
  for (const event of events) {
    if (event.type !== 'network') continue;
    const payload = event.payload as Record<string, unknown>;
    const method = typeof payload.method === 'string' ? payload.method.toUpperCase() : 'GET';
    const url = typeof payload.url === 'string' ? payload.url : '';
    if (url.length === 0) continue;
    const status = typeof payload.status === 'number' ? payload.status : null;
    const durationMs =
      typeof payload.durationMs === 'number' && Number.isFinite(payload.durationMs)
        ? payload.durationMs
        : 0;
    const error =
      typeof payload.error === 'string' && payload.error.length > 0 ? payload.error : null;
    const severity = classifyRequest({ status, durationMs, error }, slowMs);
    const { host, path } = splitUrl(url);

    out.push({
      id: event.id,
      method,
      url,
      host,
      path,
      status,
      durationMs,
      timestamp: event.timestamp,
      sessionId: event.sessionId,
      screen: event.screen ?? null,
      initiator:
        typeof payload.initiator === 'string' && payload.initiator.length > 0
          ? payload.initiator
          : null,
      requestSize: toFiniteNumber(payload.requestSize),
      responseSize: toFiniteNumber(payload.responseSize),
      requestHeaders: pickHeaders(payload.requestHeaders),
      responseHeaders: pickHeaders(payload.responseHeaders),
      severity,
      error,
    });
  }
  return out.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Classify a request: error if there's a network error or 4xx/5xx status,
 * slow if the duration crosses `slowMs`, otherwise ok. Pure so it can be
 * reused outside the extractor (e.g. re-classifying when the slow threshold
 * changes without re-fetching).
 */
export function classifyRequest(
  input: { status: number | null; durationMs: number; error?: string | null },
  slowMs: number = 1_000,
): RequestSeverity {
  if (input.error || (input.status !== null && input.status >= 400)) return 'error';
  if (input.durationMs >= slowMs) return 'slow';
  return 'ok';
}

/**
 * Split a URL into `host` + `path` without throwing for relative URLs. If
 * the URL constructor can't parse the string (e.g. `some/path`), `host`
 * falls back to empty and `path` is the whole input.
 */
export function splitUrl(url: string): { host: string; path: string } {
  try {
    const parsed = new URL(url);
    return { host: parsed.host, path: `${parsed.pathname}${parsed.search}` };
  } catch {
    return { host: '', path: url };
  }
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes === 0) return '0 B';
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  if (bytes < 1_024 * 1_024 * 1_024) return `${(bytes / (1_024 * 1_024)).toFixed(2)} MB`;
  return `${(bytes / (1_024 * 1_024 * 1_024)).toFixed(2)} GB`;
}

export function formatDurationMs(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)} ms`;
  if (ms < 10_000) return `${(ms / 1_000).toFixed(2)} s`;
  return `${(ms / 1_000).toFixed(1)} s`;
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pickHeaders(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object') return null;
  const out: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof rawValue === 'string') out[key.toLowerCase()] = rawValue;
  }
  return Object.keys(out).length > 0 ? out : null;
}
