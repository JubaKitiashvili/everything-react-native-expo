/**
 * Ingest HTTP server skeleton.
 *
 * Accepts SDK event batches via POST /v1/events, OTLP-compatible
 * endpoints, and a health check. Authentication via X-ERNE-Key header.
 * Rate limiting per app with backpressure (429).
 *
 * All external dependencies (DB, queue, auth) are injected.
 */

import type { IngestRouter } from './router';
import type { ValidationResult } from './validator';
import { validateEvent, type IngestEvent } from './validator';

// ────────────────────────────────────────────────────────────
// Interfaces for injected dependencies
// ────────────────────────────────────────────────────────────

export interface ApiKeyResolver {
  resolve(keyHash: string): Promise<{ appId: string; scopes: readonly string[] } | null>;
}

export interface RateLimiter {
  /**
   * Check if the app has capacity for `count` events.
   * Returns remaining capacity. If 0, the caller should 429.
   */
  tryConsume(appId: string, count: number): Promise<{ allowed: boolean; remaining: number }>;
}

export interface IngestRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: unknown;
}

export interface IngestResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export interface ReceiptResult {
  readonly receiptId: string;
  readonly accepted: number;
  readonly rejected: number;
  readonly errors: readonly string[];
}

// ────────────────────────────────────────────────────────────
// Rate limit config
// ────────────────────────────────────────────────────────────

export interface IngestServerConfig {
  /** Max events per minute per app. Default: 1000 */
  readonly rateLimitPerMinute: number;
}

const DEFAULT_CONFIG: IngestServerConfig = {
  rateLimitPerMinute: 1000,
};

// ────────────────────────────────────────────────────────────
// Server implementation
// ────────────────────────────────────────────────────────────

export interface IngestServer {
  handle(request: IngestRequest): Promise<IngestResponse>;
}

export const createIngestServer = (deps: {
  readonly apiKeyResolver: ApiKeyResolver;
  readonly rateLimiter: RateLimiter;
  readonly router: IngestRouter;
  readonly config?: Partial<IngestServerConfig>;
}): IngestServer => {
  const config = { ...DEFAULT_CONFIG, ...deps.config };

  const authenticate = async (
    headers: Readonly<Record<string, string | undefined>>,
  ): Promise<{ appId: string; scopes: readonly string[] } | null> => {
    const key = headers['x-erne-key'];
    if (!key) return null;
    return deps.apiKeyResolver.resolve(key);
  };

  const generateReceiptId = (): string => {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 10);
    return `rcpt_${ts}_${rand}`;
  };

  const handleEvents = async (
    appId: string,
    body: unknown,
  ): Promise<IngestResponse> => {
    if (!Array.isArray(body)) {
      return { status: 400, body: { error: 'Request body must be a JSON array of events' } };
    }

    const events = body as unknown[];

    // Rate limiting
    const rateResult = await deps.rateLimiter.tryConsume(appId, events.length);
    if (!rateResult.allowed) {
      return {
        status: 429,
        body: { error: 'Rate limit exceeded', remaining: rateResult.remaining },
        headers: { 'Retry-After': '60' },
      };
    }

    // Validate each event
    const accepted: IngestEvent[] = [];
    const allErrors: string[] = [];

    for (let i = 0; i < events.length; i++) {
      const result: ValidationResult = validateEvent(events[i]);
      if (result.valid && result.event) {
        accepted.push(result.event);
      } else {
        for (const err of result.errors) {
          allErrors.push(`event[${i}]: ${err}`);
        }
      }
    }

    // Route accepted events to the job queue
    if (accepted.length > 0) {
      await deps.router.route(appId, accepted);
    }

    const receiptId = generateReceiptId();

    const receipt: ReceiptResult = {
      receiptId,
      accepted: accepted.length,
      rejected: events.length - accepted.length,
      errors: allErrors,
    };

    return { status: 202, body: receipt };
  };

  const handleOtlp = async (
    appId: string,
    _signal: string,
    body: unknown,
  ): Promise<IngestResponse> => {
    // OTLP endpoints accept the body and forward it to the router
    // as a single wrapped event. Full OTLP parsing deferred to workers.
    const event: IngestEvent = {
      type: 'otlp',
      timestamp: Date.now(),
      sessionId: 'otlp-import',
      data: body as Record<string, unknown>,
    };

    await deps.router.route(appId, [event]);

    return {
      status: 202,
      body: { receiptId: generateReceiptId(), accepted: 1, rejected: 0, errors: [] },
    };
  };

  const handle = async (request: IngestRequest): Promise<IngestResponse> => {
    // Health check — no auth required
    if (request.method === 'GET' && request.path === '/health') {
      return { status: 200, body: { status: 'ok', timestamp: Date.now() } };
    }

    // All other endpoints require authentication
    const auth = await authenticate(request.headers);
    if (!auth) {
      return { status: 401, body: { error: 'Missing or invalid API key' } };
    }

    // POST /v1/events — batch event ingest
    if (request.method === 'POST' && request.path === '/v1/events') {
      if (!auth.scopes.includes('ingest')) {
        return { status: 403, body: { error: 'Insufficient scope: ingest required' } };
      }
      return handleEvents(auth.appId, request.body);
    }

    // POST /v1/otlp/{signal} — OTLP-compatible endpoints
    const otlpMatch = request.path.match(/^\/v1\/otlp\/(traces|metrics|logs)$/);
    if (request.method === 'POST' && otlpMatch) {
      if (!auth.scopes.includes('ingest')) {
        return { status: 403, body: { error: 'Insufficient scope: ingest required' } };
      }
      return handleOtlp(auth.appId, otlpMatch[1]!, request.body);
    }

    return { status: 404, body: { error: 'Not found' } };
  };

  // Suppress unused variable warning for config
  void config;

  return { handle };
};
