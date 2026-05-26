import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { DashboardStore, defaultDashboardDbPath } from './storage/sqliteStore.js';
import { seedDemoData } from './demo/seed.js';
import { parseProGuardMapping, resolveFrame } from './symbolication/resolver.js';
import type {
  CrashGroupStatus,
  EventListFilter,
  SymbolFileRecord,
  SymbolPlatform,
  SymbolResolveInput,
} from './storage/types.js';
import { IngestWebSocketHandler } from './ingest/wsHandler.js';
import type { IngestWsHandlerOptions } from './ingest/wsHandler.js';
import { RetentionPurgeJob } from './jobs/retention.js';
import type { RetentionPurgeJobOptions } from './jobs/retention.js';
import {
  listAiActions as auditListAiActions,
  parseListFilter as parseAuditListFilter,
  recordAiAction,
} from './audit/aiActions.js';
import { AlertDelivery, type AlertDeliveryOptions } from './alerts/delivery.js';
import { AlertEvaluator } from './alerts/evaluator.js';
import {
  applyBaseSecurityHeaders,
  applyHtmlSecurityHeaders,
  resolveCsp,
} from './security/headers.js';
import { PrometheusRegistry, PROMETHEUS_CONTENT_TYPE } from './metrics/prometheus.js';
import { crashGroupCommonFrames } from './analysis/commonFrames.js';
import { createLogger, createRequestId, type Logger } from './logging/logger.js';
import { InMemoryCache } from './cache/in-memory-cache.js';
import type { ICache } from './cache/ICache.js';

interface AlertRuleInput {
  id?: string;
  name?: string;
  metric?: string;
  threshold?: number;
  windowSeconds?: number;
  channels?: unknown[];
  cooldownSeconds?: number;
  enabled?: boolean;
  createdAt?: number;
}

function generateRuleId(): string {
  return `rule_${randomUUID()}`;
}

function generateSymbolId(): string {
  return `sym_${randomUUID()}`;
}

const DEFAULT_RETENTION_DAYS = 14;

/** Task 117.82 follow-up — canonical crash-group statuses accepted by
 *  `POST /api/crash-groups/:fingerprint/status`. Mirrors
 *  `CrashGroupStatus` in storage/types.ts. */
const VALID_CRASH_STATUSES: readonly CrashGroupStatus[] = [
  'new',
  'investigating',
  'resolved',
  'ignored',
];

function maskToken(token: string | null): string | null {
  if (!token) return null;
  if (token.length <= 6) return '••••••';
  return `${token.slice(0, 3)}••••${token.slice(-3)}`;
}

function coerceRetentionDays(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 3650) return null;
  return Math.round(n);
}

interface SymbolUploadInput {
  platform?: unknown;
  bundleId?: unknown;
  version?: unknown;
  filename?: unknown;
  uuid?: unknown;
  mappingText?: unknown;
  sizeBytes?: unknown;
}

interface SymbolResolvePayload {
  platform?: unknown;
  bundleId?: unknown;
  version?: unknown;
  symbol?: unknown;
  fileId?: unknown;
  /** Task 117.3 — Hermes / SourceMap v3 generated coordinates. */
  line?: unknown;
  column?: unknown;
}

function coerceSymbolPlatform(raw: unknown): SymbolPlatform | null {
  return raw === 'ios' || raw === 'android' ? raw : null;
}

function readJsonBody(req: IncomingMessage, maxBytes = 128 * 1024): Promise<unknown> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        rejectBody(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (text.length === 0) {
        resolveBody({});
        return;
      }
      try {
        resolveBody(JSON.parse(text) as unknown);
      } catch (err) {
        rejectBody(err as Error);
      }
    });
    req.on('error', rejectBody);
  });
}

export interface DashboardServerOptions {
  port?: number;
  host?: string;
  publicDir?: string;
  store?: DashboardStore;
  dbPath?: string;
  /**
   * Opt-out for tests or future transports. Default: attach the
   * WebSocket ingest/broadcast handler to the HTTP server.
   */
  enableWebsocket?: boolean;
  /**
   * Tuning + injection for the WS handler (rate limits, clock, logger).
   * Ignored when `enableWebsocket === false`.
   */
  websocket?: Omit<IngestWsHandlerOptions, 'store'>;
  /**
   * API-key gate for `/api/*` endpoints (Task 117.61). When set, every
   * non-public API call must present the key either as
   * `Authorization: Bearer <key>` or `?apiKey=<key>`. When omitted, falls
   * back to `process.env.ERNE_API_KEY`. When neither is set, no auth is
   * enforced — the developer-friendly default for local dashboards.
   *
   * Public endpoints that bypass the gate (orchestrator probes must
   * always succeed):
   *   - GET /api/health    liveness
   *   - GET /api/ready     readiness
   *
   * Static assets (the SPA bundle) are also public — they render the
   * login shell that in turn presents the key.
   */
  apiKey?: string | null;
  /**
   * Retention purge job (Task 117.71). Defaults: `enabled=true`,
   * `intervalMs=1h`, `defaultDays=14`. Set `enabled: false` in tests
   * that already own their own purge schedule, or to disable retention
   * entirely. The job's `logger` / `onError` / `now` hooks are forwarded
   * verbatim to the `RetentionPurgeJob` constructor.
   */
  retention?:
    | false
    | (Omit<RetentionPurgeJobOptions, 'store'> & { enabled?: boolean });
  /**
   * Task 117.99 — alert evaluator + delivery configuration. Default:
   * an `AlertEvaluator` runs in-process and a stock `AlertDelivery`
   * uses the global `fetch`. Set `false` to disable evaluation entirely
   * (rules will still persist but never fire — useful for tests). Pass
   * `delivery` to inject a stub fetch / clock for unit tests.
   */
  alerts?:
    | false
    | {
        enabled?: boolean;
        delivery?: AlertDeliveryOptions;
        /** Override the evaluator's clock — defaults to `Date.now`. */
        now?: () => number;
        /** Logger surface forwarded into both evaluator + delivery. */
        onError?: (err: Error, context: { rule?: string; channel?: string }) => void;
      };
  /**
   * Task 117.63 — shared HMAC secret for OUTBOUND generic `webhook:`
   * alert deliveries. When set (or via `process.env.ERNE_WEBHOOK_SECRET`),
   * every generic webhook POST carries an `X-ERNE-Signature: sha256=<hex>`
   * header computed over the exact body so receivers can verify it. An
   * explicit value here takes precedence over the env var; pass `null` to
   * disable signing even when the env var is set. The secret threads into
   * the `AlertDelivery` instance unless `alerts.delivery.webhookSigningSecret`
   * is already specified (that wins).
   */
  webhookSigningSecret?: string | null;
  /**
   * Task 117.66 — override the Content-Security-Policy applied to the
   * HTML shell. `undefined` uses the SPA-friendly default (see
   * `DEFAULT_CSP`); a string overrides it wholesale; `null` omits the
   * CSP header entirely (the other security headers still apply) —
   * useful behind a reverse proxy that injects its own policy. CSP is
   * only set on the HTML response; JSON / static assets always carry the
   * base header set (HSTS, X-Frame-Options, nosniff, Referrer-Policy).
   */
  csp?: string | null;
  /**
   * Task 117.68 — Prometheus `/metrics` endpoint configuration.
   *
   * Default: the endpoint is served and gated by the same API key as
   * `/api/*` (when a key is configured). Set `metrics: { public: true }`
   * to expose it WITHOUT the API key — handy when the scraper can't
   * present the dashboard's key but the endpoint sits on a trusted
   * network. Set `metrics: false` to disable the endpoint entirely.
   *
   * `/metrics` lives at the server root (NOT under `/api/`) per the
   * Prometheus convention, so it has its own gate handling separate from
   * the `/api/*` middleware.
   */
  metrics?:
    | false
    | {
        enabled?: boolean;
        /** Expose `/metrics` without the API-key gate. Default: false. */
        public?: boolean;
      };
  /**
   * Task 117.69 — structured request logger. Default: a logger at `info`
   * writing JSON lines to `process.stderr`. Each HTTP request gets a
   * correlation id (a `child` logger bound to `{ requestId }`) and logs a
   * `request.start` + `request.finish` pair (method, path, status,
   * durationMs) plus `request.error` on a thrown handler. Logging is HTTP
   * only — it deliberately never touches the hot WebSocket ingest path.
   *
   * Tests inject a capturing stream + fixed clock to assert log shape, and
   * `generateRequestId` for a stable correlation id.
   */
  logger?: Logger;
  /**
   * Task 117.69 — request-id generator override (tests inject a fixed id
   * so the emitted correlation id is deterministic). Defaults to the
   * built-in `createRequestId`.
   */
  generateRequestId?: () => string;
  /**
   * Task 117.51 — read-path cache. Default: an `InMemoryCache` fronting a
   * small set of hot GET endpoints (currently `GET /api/crash-groups`).
   * Set `false` to disable caching entirely (every read hits the store).
   * Pass an `ICache` instance (e.g. a `RedisCacheAdapter` from
   * `createRedisCache`) to share a cache across processes.
   */
  cache?: ICache | false;
}

export interface DashboardServerHandle {
  server: Server;
  store: DashboardStore;
  port: number;
  host: string;
  websocket: IngestWebSocketHandler | null;
  /**
   * Retention purge job when enabled (Task 117.71). `null` when the
   * caller explicitly disabled retention via `options.retention = false`
   * or `{ enabled: false }`.
   */
  retentionJob: RetentionPurgeJob | null;
  /**
   * Task 117.99 — alert evaluator. `null` when disabled via
   * `options.alerts = false`. Exposed so tests + the dashboard's
   * test-fire button can call it directly without going through HTTP.
   */
  alertEvaluator: AlertEvaluator | null;
  /**
   * Task 117.51 — the read-path cache in front of hot GET endpoints.
   * `null` when caching is disabled via `options.cache = false`. Exposed
   * so tests can assert hit/miss/invalidation behaviour directly.
   */
  cache: ICache | null;
  close: () => Promise<void>;
  url: string;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function defaultPublicDir(): string {
  // `dashboard/server/src/server.ts` compiled to `dashboard/server/dist/server.js`;
  // either way the static assets built by `dashboard/app` land in `../public/`.
  const here = fileURLToPath(import.meta.url);
  return resolve(here, '..', '..', '..', 'public');
}

/**
 * Public API paths that bypass the API-key gate. Liveness and readiness
 * probes MUST always respond or an orchestrator will mark the pod
 * unhealthy and restart it on a key mismatch loop.
 */
const PUBLIC_API_PATHS = new Set(['/api/health', '/api/ready']);

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function extractApiKey(req: IncomingMessage, url: URL): string | null {
  const header = req.headers.authorization;
  if (typeof header === 'string') {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (match?.[1]) return match[1].trim();
  }
  const query = url.searchParams.get('apiKey');
  if (query && query.length > 0) return query;
  return null;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  // Task 117.66 — base security headers on every response. CSP is
  // intentionally omitted for JSON (a JSON body is never a browsing
  // context, so a policy there only adds weight).
  applyBaseSecurityHeaders(res);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function sendStatic(res: ServerResponse, filePath: string, csp: string | null): void {
  const ext = extname(filePath).toLowerCase();
  const mime = MIME[ext] ?? 'application/octet-stream';
  const size = statSync(filePath).size;
  // Task 117.66 — the HTML shell gets the full CSP; other static assets
  // get only the base headers (CSP on an image/JS file is meaningless).
  if (ext === '.html') {
    applyHtmlSecurityHeaders(res, csp);
  } else {
    applyBaseSecurityHeaders(res);
  }
  res.writeHead(200, {
    'content-type': mime,
    'content-length': size,
    'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=300',
  });
  createReadStream(filePath).pipe(res);
}

function parseFilterFromUrl(url: URL): EventListFilter {
  const f: EventListFilter = {};
  const since = url.searchParams.get('since');
  const until = url.searchParams.get('until');
  const type = url.searchParams.getAll('type');
  const sessionId = url.searchParams.get('sessionId');
  const fingerprint = url.searchParams.get('fingerprint');
  const userId = url.searchParams.get('userId');
  const limit = url.searchParams.get('limit');
  if (since !== null) f.since = Number(since);
  if (until !== null) f.until = Number(until);
  if (type.length > 0) f.type = type.length === 1 ? type[0]! : type;
  if (sessionId !== null) f.sessionId = sessionId;
  if (fingerprint !== null) f.fingerprint = fingerprint;
  if (userId !== null) f.userId = userId;
  if (limit !== null) f.limit = Math.min(1000, Number(limit));
  return f;
}

export function createDashboardServer(options: DashboardServerOptions = {}): DashboardServerHandle {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 0;
  const publicDir = options.publicDir ?? defaultPublicDir();
  // Task 117.66 — resolve the CSP once. `undefined` → default policy,
  // `null` → no CSP header, string → verbatim override.
  const resolvedCsp = resolveCsp(options.csp);

  // Task 117.68 — Prometheus /metrics config. Default: enabled + gated.
  const metricsOption = options.metrics;
  const metricsEnabled =
    metricsOption !== false &&
    !(typeof metricsOption === 'object' && metricsOption?.enabled === false);
  const metricsPublic =
    typeof metricsOption === 'object' && metricsOption?.public === true;
  const store =
    options.store ?? new DashboardStore({ dbPath: options.dbPath ?? defaultDashboardDbPath() });

  // Task 117.69 — structured request logger. Default: info → stderr.
  const logger = options.logger ?? createLogger({ level: 'info' });
  const generateRequestId = options.generateRequestId ?? createRequestId;

  // Task 117.51 — read-path cache. Default: in-memory; `false` disables.
  const cache: ICache | null = options.cache === false ? null : (options.cache ?? new InMemoryCache());
  // Cache key + TTL for the crash-group list. Short TTL keeps the
  // dashboard's poll loop from re-scanning SQLite on every tick while
  // bounding staleness; explicit invalidation on a status mutation keeps
  // the list correct the instant an operator acknowledges a group.
  const CRASH_GROUPS_CACHE_KEY = 'crash-groups:list';
  const CRASH_GROUPS_CACHE_TTL_MS = 3_000;
  const invalidateCrashGroupsCache = (): void => {
    if (cache) void cache.del(CRASH_GROUPS_CACHE_KEY);
  };

  // Resolve the required API key once at startup. Explicit null disables
  // the gate even when the env var is set (useful for tests and local
  // reproductions of production incidents).
  const requiredApiKey =
    options.apiKey === null
      ? null
      : options.apiKey !== undefined
        ? options.apiKey
        : (process.env.ERNE_API_KEY ?? null);

  const websocket =
    options.enableWebsocket === false
      ? null
      : new IngestWebSocketHandler({
          store,
          apiKey: requiredApiKey,
          ...(options.websocket ?? {}),
        });

  // Task 117.71 — retention purge scheduler. Default on; opt-out with
  // `retention: false` or `{ enabled: false }`.
  const retentionOption = options.retention;
  const retentionJob =
    retentionOption === false ||
    (typeof retentionOption === 'object' && retentionOption?.enabled === false)
      ? null
      : new RetentionPurgeJob({
          store,
          ...(typeof retentionOption === 'object' ? retentionOption : {}),
        });
  retentionJob?.start();

  // Task 117.99 — alert evaluator + delivery. Default on; opt-out with
  // `alerts: false` or `{ enabled: false }`. Constructed unconditionally
  // when enabled so the test-fire endpoint works even without WS ingest.
  const alertsOption = options.alerts;
  const alertsDisabled =
    alertsOption === false ||
    (typeof alertsOption === 'object' && alertsOption?.enabled === false);
  const alertConfig = typeof alertsOption === 'object' ? alertsOption : {};
  // Task 117.63 — resolve the outbound webhook signing secret. Explicit
  // option (incl. null to disable) wins; otherwise fall back to the env
  // var. Threaded into AlertDelivery below unless delivery options already
  // pin a secret.
  const resolvedWebhookSecret =
    options.webhookSigningSecret === null
      ? null
      : options.webhookSigningSecret !== undefined
        ? options.webhookSigningSecret
        : (process.env.ERNE_WEBHOOK_SECRET ?? null);

  let alertEvaluator: AlertEvaluator | null = null;
  if (!alertsDisabled) {
    const deliveryOptions: AlertDeliveryOptions = { ...(alertConfig.delivery ?? {}) };
    if (deliveryOptions.webhookSigningSecret === undefined && resolvedWebhookSecret !== null) {
      deliveryOptions.webhookSigningSecret = resolvedWebhookSecret;
    }
    if (alertConfig.onError && !deliveryOptions.onError) {
      deliveryOptions.onError = (err, ctx) =>
        alertConfig.onError?.(err, { channel: ctx.channel, rule: ctx.rule });
    }
    const delivery = new AlertDelivery(deliveryOptions);
    const evaluatorOptions: ConstructorParameters<typeof AlertEvaluator>[0] = {
      store,
      delivery,
    };
    if (alertConfig.now) evaluatorOptions.now = alertConfig.now;
    if (alertConfig.onError) {
      evaluatorOptions.onError = (err, ctx) => alertConfig.onError?.(err, ctx);
    }
    alertEvaluator = new AlertEvaluator(evaluatorOptions);
    if (websocket) {
      websocket.setOnEventPersisted((event) => alertEvaluator?.onEvent(event));
    }
  }

  const resolveRetentionDays = (): number => {
    const raw = store.getSetting('retention_days');
    return coerceRetentionDays(raw) ?? DEFAULT_RETENTION_DAYS;
  };

  const buildSettings = (): {
    retentionDays: number;
    port: number;
    host: string;
    wsTokenMasked: string | null;
    wsTokenSet: boolean;
    uptimeSeconds: number;
  } => {
    const address = server.address();
    const listenPort = typeof address === 'object' && address !== null ? address.port : port;
    const wsToken = store.getSetting('ws_auth_token');
    return {
      retentionDays: resolveRetentionDays(),
      port: listenPort,
      host,
      wsTokenMasked: maskToken(wsToken),
      wsTokenSet: wsToken !== null,
      uptimeSeconds: process.uptime(),
    };
  };

  // Task 117.68 — render the Prometheus text-exposition body from live
  // server + store state. Surfaces ingest queue depth/stats, total event
  // count, uptime, and applied migration count. Rebuilt on each scrape so
  // values are always current.
  const buildMetrics = (): string => {
    const registry = new PrometheusRegistry();
    const ready = store.readyCheck();

    registry.observeCounter(
      'erne_events_total',
      'Total events ingested and stored.',
      store.countEvents(),
    );
    registry.observeGauge(
      'erne_uptime_seconds',
      'Process uptime in seconds.',
      Math.round(process.uptime()),
    );
    registry.observeGauge(
      'erne_migrations_applied',
      'Number of storage migrations applied.',
      ready.migrationsApplied,
    );
    registry.observeGauge(
      'erne_ready',
      'Readiness: 1 when migrations are applied and storage is not busy, else 0.',
      ready.ready ? 1 : 0,
    );

    if (websocket) {
      const queue = websocket.queueStats();
      const ingest = websocket.stats;
      registry.observeGauge(
        'erne_ingest_queue_depth',
        'Current ingest queue depth (pending events).',
        queue.currentSize,
      );
      registry.observeGauge(
        'erne_ingest_queue_inflight',
        'Ingest events currently being processed by the worker.',
        queue.inFlight,
      );
      registry.observeGauge(
        'erne_ingest_queue_high_water_mark',
        'All-time maximum ingest queue depth.',
        queue.highWaterMark,
      );
      registry.observeCounter(
        'erne_ingest_queue_enqueued_total',
        'Total events ever enqueued onto the ingest queue.',
        queue.enqueued,
      );
      registry.observeCounter(
        'erne_ingest_queue_processed_total',
        'Total ingest events processed cleanly.',
        queue.processed,
      );
      registry.observeCounter(
        'erne_ingest_queue_failed_total',
        'Total ingest events dropped after exhausting retries.',
        queue.failed,
      );
      registry.observeCounter(
        'erne_ingest_queue_backpressured_total',
        'Total enqueue attempts rejected due to backpressure.',
        queue.backpressured,
      );
      registry.observeCounter(
        'erne_ingest_ingested_total',
        'Total events accepted and ingested over WebSocket.',
        ingest.ingested,
      );
      registry.observeCounter(
        'erne_ingest_rejected_total',
        'Total malformed / rate-limited ingest payloads rejected.',
        ingest.rejected,
      );
      registry.observeCounter(
        'erne_ingest_deduplicated_total',
        'Total ingest events skipped as duplicates.',
        ingest.deduplicated,
      );
      registry.observeGauge(
        'erne_subscribers',
        'Current number of dashboard subscriber connections.',
        websocket.subscriberCount,
      );
    }

    return registry.render();
  };

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? host}`);
    const pathname = requestUrl.pathname;

    // Task 117.69 — per-request correlation id + start/finish logging.
    // HTTP control plane only; the WS ingest path is never routed here.
    const requestId = generateRequestId();
    const reqLogger = logger.child({ requestId });
    const startedAt = Date.now();
    const method = req.method ?? 'GET';
    reqLogger.info('request.start', { method, path: pathname });
    res.once('finish', () => {
      reqLogger.info('request.finish', {
        method,
        path: pathname,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });

    try {
      // Task 117.61 — API-key gate. Enforced only when a key is
      // configured, only on `/api/*` paths, and always skipped for
      // liveness/readiness probes so orchestrators can reach them.
      if (requiredApiKey && pathname.startsWith('/api/') && !PUBLIC_API_PATHS.has(pathname)) {
        const presented = extractApiKey(req, requestUrl);
        if (!presented) {
          sendJson(res, 401, { error: 'missing_auth' });
          return;
        }
        if (!constantTimeEquals(presented, requiredApiKey)) {
          sendJson(res, 401, { error: 'unauthorized' });
          return;
        }
      }

      // Task 117.68 — Prometheus scrape endpoint. Lives at the root (not
      // under /api/) per convention, so it bypasses the /api/* gate above
      // and applies its own. Default: gated by the same API key; set
      // `metrics: { public: true }` to expose it without the key.
      if (req.method === 'GET' && pathname === '/metrics') {
        if (!metricsEnabled) {
          sendJson(res, 404, { error: 'not_found', path: pathname });
          return;
        }
        if (requiredApiKey && !metricsPublic) {
          const presented = extractApiKey(req, requestUrl);
          if (!presented) {
            sendJson(res, 401, { error: 'missing_auth' });
            return;
          }
          if (!constantTimeEquals(presented, requiredApiKey)) {
            sendJson(res, 401, { error: 'unauthorized' });
            return;
          }
        }
        const body = buildMetrics();
        applyBaseSecurityHeaders(res);
        res.writeHead(200, {
          'content-type': PROMETHEUS_CONTENT_TYPE,
          'content-length': Buffer.byteLength(body),
          'cache-control': 'no-store',
        });
        res.end(body);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/health') {
        sendJson(res, 200, {
          ...store.selfCheck(),
          uptimeSeconds: process.uptime(),
          ingest: websocket
            ? {
                subscribers: websocket.subscriberCount,
                stats: websocket.stats,
              }
            : null,
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/ready') {
        // Readiness contract (Task 117.100): migrations applied + storage
        // backend not busy. Returns 200 when ready, 503 when not — the
        // status code is what Kubernetes / ECS / Railway / Render care
        // about; the JSON body explains the reason for humans.
        const report = store.readyCheck();
        sendJson(res, report.ready ? 200 : 503, report);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/events') {
        const events = store.listEvents(parseFilterFromUrl(requestUrl));
        sendJson(res, 200, { events, count: events.length });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/sessions') {
        const sessions = store.listSessions();
        sendJson(res, 200, { sessions });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/crash-groups') {
        // Task 117.51 — serve the crash-group list from the read cache
        // when warm. The list is invalidated explicitly on any status
        // mutation (see POST .../status below), so a cache hit can never
        // serve a stale status — only a list at most CRASH_GROUPS_CACHE_TTL_MS
        // behind a brand-new group from ingest, which the poll loop
        // tolerates.
        if (cache) {
          void cache
            .get<{ groups: unknown }>(CRASH_GROUPS_CACHE_KEY)
            .then((cached) => {
              if (cached !== undefined) {
                sendJson(res, 200, cached);
                return;
              }
              const groups = store.listCrashGroups();
              const body = { groups };
              void cache.set(CRASH_GROUPS_CACHE_KEY, body, CRASH_GROUPS_CACHE_TTL_MS);
              sendJson(res, 200, body);
            })
            .catch(() => {
              // A cache failure must never fail the read — fall back to
              // the store directly.
              const groups = store.listCrashGroups();
              sendJson(res, 200, { groups });
            });
          return;
        }
        const groups = store.listCrashGroups();
        sendJson(res, 200, { groups });
        return;
      }

      // Task 117.82 follow-up — mutate a crash group's status. Backs the
      // MCP `acknowledge_crash_group` write tool. Path:
      //   POST /api/crash-groups/:fingerprint/status   body { status }
      if (
        req.method === 'POST' &&
        pathname.startsWith('/api/crash-groups/') &&
        pathname.endsWith('/status')
      ) {
        const fingerprint = decodeURIComponent(
          pathname.slice('/api/crash-groups/'.length, -'/status'.length),
        );
        if (!fingerprint) {
          sendJson(res, 400, { error: 'missing_fingerprint' });
          return;
        }
        void readJsonBody(req)
          .then((body) => {
            const status = (body as { status?: unknown }).status;
            if (!VALID_CRASH_STATUSES.includes(status as CrashGroupStatus)) {
              sendJson(res, 400, {
                error: 'invalid_status',
                allowed: VALID_CRASH_STATUSES,
              });
              return;
            }
            // Confirm the group exists so the caller gets a 404 rather
            // than a silent no-op when the fingerprint is wrong.
            const existing = store
              .listCrashGroups({ limit: 1000 })
              .find((g) => g.fingerprint === fingerprint);
            if (!existing) {
              sendJson(res, 404, { error: 'not_found', fingerprint });
              return;
            }
            store.setCrashGroupStatus(fingerprint, status as CrashGroupStatus);
            // Task 117.51 — the cached crash-group list now reflects a
            // stale status; drop it so the next GET rebuilds from store.
            invalidateCrashGroupsCache();
            const updated = store
              .listCrashGroups({ limit: 1000 })
              .find((g) => g.fingerprint === fingerprint);
            sendJson(res, 200, { ok: true, group: updated });
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            sendJson(res, 400, { error: 'invalid_json', message });
          });
        return;
      }

      // Task 117.83 — common frame extraction for a crash group. Returns
      // the shared leading call-site prefix + the set of frames present in
      // every recent event stack. Path:
      //   GET /api/crash-groups/:fingerprint/common-frames
      if (
        req.method === 'GET' &&
        pathname.startsWith('/api/crash-groups/') &&
        pathname.endsWith('/common-frames')
      ) {
        const fingerprint = decodeURIComponent(
          pathname.slice('/api/crash-groups/'.length, -'/common-frames'.length),
        );
        if (!fingerprint) {
          sendJson(res, 400, { error: 'missing_fingerprint' });
          return;
        }
        const limitParam = requestUrl.searchParams.get('limit');
        const limit =
          limitParam !== null ? Math.min(1000, Math.max(1, Number(limitParam))) : undefined;
        const result =
          limit !== undefined
            ? crashGroupCommonFrames(store, fingerprint, limit)
            : crashGroupCommonFrames(store, fingerprint);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/alert-rules') {
        const rules = store.listAlertRules();
        sendJson(res, 200, { rules });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/alert-rules') {
        void readJsonBody(req)
          .then((body) => {
            const rule = body as AlertRuleInput;
            if (!rule || typeof rule !== 'object') {
              sendJson(res, 400, { error: 'invalid_body' });
              return;
            }
            const now = Date.now();
            const saved = {
              id: rule.id ?? generateRuleId(),
              name: String(rule.name ?? 'Unnamed rule'),
              metric: String(rule.metric ?? 'crash_count'),
              threshold: Number(rule.threshold ?? 0),
              windowSeconds: Number(rule.windowSeconds ?? 60),
              channels: Array.isArray(rule.channels)
                ? rule.channels.filter((c): c is string => typeof c === 'string')
                : [],
              cooldownSeconds: Number(rule.cooldownSeconds ?? 300),
              enabled: rule.enabled !== false,
              createdAt: rule.createdAt ?? now,
              updatedAt: now,
            };
            store.saveAlertRule(saved);
            // Task 117.99 — evaluator must see the new/updated rule
            // before the next ingested event.
            alertEvaluator?.reloadRules();
            sendJson(res, 200, { rule: saved });
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            sendJson(res, 400, { error: 'invalid_json', message });
          });
        return;
      }

      if (req.method === 'DELETE' && pathname.startsWith('/api/alert-rules/')) {
        const id = pathname.slice('/api/alert-rules/'.length);
        if (!id) {
          sendJson(res, 400, { error: 'missing_id' });
          return;
        }
        // Task 117.99 — `/api/alert-rules/:id/test-fire` lives under the
        // same prefix; route it before the destroy path so the operator
        // can fire-test a rule with a colon-y id without it being
        // misinterpreted as a delete.
        if (id.endsWith('/test-fire')) {
          // Wrong verb (DELETE) for the test-fire path; surface a
          // useful error rather than letting the delete swallow it.
          sendJson(res, 405, { error: 'method_not_allowed' });
          return;
        }
        const deleted = store.deleteAlertRule(id);
        if (!deleted) {
          sendJson(res, 404, { error: 'not_found', id });
          return;
        }
        alertEvaluator?.reloadRules();
        sendJson(res, 200, { ok: true });
        return;
      }

      // Task 117.99 — test-fire endpoint for the dashboard "Test fire"
      // button. Persists a marker firing + dispatches via every
      // configured channel. Returns the firing + per-channel delivery
      // results so the dashboard can render success / failure inline.
      if (
        req.method === 'POST' &&
        pathname.startsWith('/api/alert-rules/') &&
        pathname.endsWith('/test-fire')
      ) {
        const id = pathname.slice('/api/alert-rules/'.length, -'/test-fire'.length);
        if (!id) {
          sendJson(res, 400, { error: 'missing_id' });
          return;
        }
        if (!alertEvaluator) {
          sendJson(res, 503, { error: 'alerts_disabled' });
          return;
        }
        void alertEvaluator
          .testFire(id)
          .then((result) => {
            if (!result) {
              sendJson(res, 404, { error: 'not_found', id });
              return;
            }
            sendJson(res, 200, { ok: true, ...result });
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            sendJson(res, 500, { error: 'test_fire_failed', message });
          });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/alert-history') {
        const limitParam = requestUrl.searchParams.get('limit');
        const ruleId = requestUrl.searchParams.get('ruleId');
        const firings = store.listAlertHistory({
          ...(ruleId ? { ruleId } : {}),
          ...(limitParam ? { limit: Math.min(500, Number(limitParam)) } : {}),
        });
        sendJson(res, 200, { firings });
        return;
      }

      if (
        req.method === 'GET' &&
        pathname.startsWith('/api/users/') &&
        pathname.endsWith('/summary')
      ) {
        const userId = decodeURIComponent(pathname.slice('/api/users/'.length, -'/summary'.length));
        if (!userId) {
          sendJson(res, 400, { error: 'missing_user_id' });
          return;
        }
        sendJson(res, 200, { summary: store.summariseUserData(userId) });
        return;
      }

      if (
        req.method === 'GET' &&
        pathname.startsWith('/api/users/') &&
        pathname.endsWith('/export')
      ) {
        const userId = decodeURIComponent(pathname.slice('/api/users/'.length, -'/export'.length));
        if (!userId) {
          sendJson(res, 400, { error: 'missing_user_id' });
          return;
        }
        sendJson(res, 200, { export: store.exportUserData(userId) });
        return;
      }

      if (req.method === 'DELETE' && pathname.startsWith('/api/users/')) {
        const userId = decodeURIComponent(pathname.slice('/api/users/'.length));
        if (!userId) {
          sendJson(res, 400, { error: 'missing_user_id' });
          return;
        }
        const deletedEvents = store.deleteEventsByUserId(userId);
        sendJson(res, 200, { ok: true, deletedEvents });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/settings') {
        sendJson(res, 200, { settings: buildSettings() });
        return;
      }

      if (req.method === 'PATCH' && pathname === '/api/settings') {
        void readJsonBody(req)
          .then((body) => {
            const patch = body as { retentionDays?: unknown };
            if (!patch || typeof patch !== 'object') {
              sendJson(res, 400, { error: 'invalid_body' });
              return;
            }
            if (patch.retentionDays !== undefined) {
              const days = coerceRetentionDays(patch.retentionDays);
              if (days === null) {
                sendJson(res, 400, { error: 'invalid_retention_days' });
                return;
              }
              store.setSetting('retention_days', String(days));
            }
            sendJson(res, 200, { settings: buildSettings() });
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            sendJson(res, 400, { error: 'invalid_json', message });
          });
        return;
      }

      // Task 117.5 — queue observability. Returns backpressure/retry/
      // failed counts so operators can see when the ingest queue is
      // under pressure. Only meaningful when the WS handler is attached.
      // Task 117.81 — AI agent action audit trail.
      if (req.method === 'GET' && pathname === '/api/audit/ai-actions') {
        const filter = parseAuditListFilter(requestUrl.searchParams);
        sendJson(res, 200, auditListAiActions(store, filter));
        return;
      }

      if (req.method === 'POST' && pathname === '/api/audit/ai-actions') {
        void readJsonBody(req)
          .then((body) => {
            const result = recordAiAction(store, body);
            if (!result.ok) {
              sendJson(res, 400, { error: result.error, ...(result.detail ? { detail: result.detail } : {}) });
              return;
            }
            sendJson(res, 200, {
              ok: true,
              inserted: result.inserted,
              record: result.record,
            });
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            sendJson(res, 400, { error: 'invalid_json', message });
          });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/queue/stats') {
        if (!websocket) {
          sendJson(res, 200, { queue: null });
          return;
        }
        sendJson(res, 200, { queue: websocket.queueStats() });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/settings/rotate-token') {
        const token = randomUUID().replace(/-/g, '');
        store.setSetting('ws_auth_token', token);
        sendJson(res, 200, { wsTokenMasked: maskToken(token), wsTokenSet: true });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/settings/reset') {
        const counts = store.resetAllUserData();
        sendJson(res, 200, { ok: true, deleted: counts });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/demo/seed') {
        const counts = seedDemoData(store, Date.now());
        sendJson(res, 200, { ok: true, seeded: counts });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/symbols') {
        const platform = coerceSymbolPlatform(requestUrl.searchParams.get('platform'));
        const bundleId = requestUrl.searchParams.get('bundleId');
        const version = requestUrl.searchParams.get('version');
        const files = store.listSymbolFiles({
          ...(platform ? { platform } : {}),
          ...(bundleId ? { bundleId } : {}),
          ...(version ? { version } : {}),
        });
        sendJson(res, 200, { files });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/symbols') {
        // 8 MiB cap — large enough for mid-sized ProGuard mappings, small
        // enough to reject accidental uploads of full dSYM bundles (those
        // stay on the developer's machine; we only record metadata).
        void readJsonBody(req, 8 * 1024 * 1024)
          .then((body) => {
            const input = body as SymbolUploadInput;
            if (!input || typeof input !== 'object') {
              sendJson(res, 400, { error: 'invalid_body' });
              return;
            }
            const platform = coerceSymbolPlatform(input.platform);
            if (!platform) {
              sendJson(res, 400, { error: 'invalid_platform' });
              return;
            }
            const mappingText =
              typeof input.mappingText === 'string' && input.mappingText.length > 0
                ? input.mappingText
                : null;
            const entryCount = mappingText ? parseProGuardMapping(mappingText).entryCount : 0;
            const record: SymbolFileRecord = {
              id: generateSymbolId(),
              platform,
              bundleId: String(input.bundleId ?? 'unknown'),
              version: String(input.version ?? '0.0.0'),
              filename: String(input.filename ?? 'upload'),
              sizeBytes: Number.isFinite(Number(input.sizeBytes))
                ? Number(input.sizeBytes)
                : (mappingText?.length ?? 0),
              uploadedAt: Date.now(),
              entryCount,
              uuid: typeof input.uuid === 'string' && input.uuid.length > 0 ? input.uuid : null,
              mappingText,
            };
            store.saveSymbolFile(record);
            sendJson(res, 200, { file: record });
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            sendJson(res, 400, { error: 'invalid_json', message });
          });
        return;
      }

      if (req.method === 'DELETE' && pathname.startsWith('/api/symbols/')) {
        const id = pathname.slice('/api/symbols/'.length);
        if (!id) {
          sendJson(res, 400, { error: 'missing_id' });
          return;
        }
        const deleted = store.deleteSymbolFile(id);
        if (!deleted) {
          sendJson(res, 404, { error: 'not_found', id });
          return;
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/symbols/resolve') {
        void readJsonBody(req)
          .then((body) => {
            const payload = body as SymbolResolvePayload;
            if (!payload || typeof payload !== 'object') {
              sendJson(res, 400, { error: 'invalid_body' });
              return;
            }
            const platform = coerceSymbolPlatform(payload.platform);
            if (!platform) {
              sendJson(res, 400, { error: 'invalid_platform' });
              return;
            }
            const bundleId = String(payload.bundleId ?? '');
            const version = String(payload.version ?? '');
            const symbol = String(payload.symbol ?? '');
            if (!symbol) {
              sendJson(res, 400, { error: 'missing_symbol' });
              return;
            }
            const artefact =
              typeof payload.fileId === 'string' && payload.fileId.length > 0
                ? store.getSymbolFile(payload.fileId)
                : store.findSymbolFile(platform, bundleId, version);
            const input: SymbolResolveInput = { platform, bundleId, version, symbol };
            // Task 117.3 — forward optional Hermes coordinates. Both
            // line and column must be finite integers — otherwise the
            // resolver falls back to "no coordinates".
            if (typeof payload.line === 'number' && Number.isFinite(payload.line)) {
              input.line = payload.line;
            }
            if (typeof payload.column === 'number' && Number.isFinite(payload.column)) {
              input.column = payload.column;
            }
            sendJson(res, 200, { frame: resolveFrame(input, artefact) });
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            sendJson(res, 400, { error: 'invalid_json', message });
          });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/bug-reports') {
        const reports = store.listBugReports();
        sendJson(res, 200, { reports });
        return;
      }

      if (req.method === 'PATCH' && pathname.startsWith('/api/bug-reports/')) {
        const id = pathname.slice('/api/bug-reports/'.length);
        if (!id) {
          sendJson(res, 400, { error: 'missing_id' });
          return;
        }
        void readJsonBody(req)
          .then((body) => {
            const patch = body as {
              status?: unknown;
              assignee?: unknown;
              title?: unknown;
              description?: unknown;
            };
            if (!patch || typeof patch !== 'object') {
              sendJson(res, 400, { error: 'invalid_body' });
              return;
            }
            const cleaned: Partial<{
              status: 'new' | 'assigned' | 'resolved';
              assignee: string;
              title: string;
              description: string;
            }> = {};
            if (
              patch.status === 'new' ||
              patch.status === 'assigned' ||
              patch.status === 'resolved'
            ) {
              cleaned.status = patch.status;
            }
            if (typeof patch.assignee === 'string') cleaned.assignee = patch.assignee;
            if (typeof patch.title === 'string') cleaned.title = patch.title;
            if (typeof patch.description === 'string') cleaned.description = patch.description;
            store.updateBugReport(id, cleaned);
            const updated = store.listBugReports().find((r) => r.id === id) ?? null;
            sendJson(res, 200, { report: updated });
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            sendJson(res, 400, { error: 'invalid_json', message });
          });
        return;
      }

      // Static assets — serve the built dashboard app.
      if (req.method === 'GET' && publicDir) {
        const staticPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
        const filePath = join(publicDir, staticPath);
        if (filePath.startsWith(publicDir) && existsSync(filePath) && statSync(filePath).isFile()) {
          sendStatic(res, filePath, resolvedCsp);
          return;
        }
        const indexFile = join(publicDir, 'index.html');
        if (existsSync(indexFile)) {
          sendStatic(res, indexFile, resolvedCsp);
          return;
        }
      }

      sendJson(res, 404, { error: 'not_found', path: pathname });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      reqLogger.error('request.error', { method, path: pathname, message });
      sendJson(res, 500, { error: 'internal', message });
    }
  });

  if (websocket) {
    websocket.attach(server);
  }

  return {
    server,
    store,
    host,
    port,
    websocket,
    retentionJob,
    alertEvaluator,
    cache,
    url: `http://${host}:${port}`,
    close: () =>
      new Promise<void>((resolveClose) => {
        retentionJob?.stop();
        // Task 117.5 — drain the ingest queue before closing the store
        // so inflight events land. Fall back to the sync close path if
        // the handler doesn't expose closeAsync (future adapters).
        const drain = websocket?.closeAsync
          ? websocket.closeAsync(5_000)
          : Promise.resolve(websocket?.close());
        void drain.finally(() => {
          server.close(() => {
            store.close();
            // Task 117.51 — release the cache's resources (a Redis socket
            // for the remote adapter; a no-op for in-memory). Failures
            // here must not stall shutdown.
            void Promise.resolve(cache?.close()).finally(() => resolveClose());
          });
        });
      }),
  };
}

export async function startDashboardServer(
  options: DashboardServerOptions = {},
): Promise<DashboardServerHandle> {
  const handle = createDashboardServer(options);
  await new Promise<void>((resolveStart, rejectStart) => {
    handle.server.once('error', rejectStart);
    handle.server.listen(options.port ?? 0, handle.host, () => resolveStart());
  });
  const address = handle.server.address();
  const listeningPort =
    typeof address === 'object' && address !== null ? address.port : handle.port;
  return {
    ...handle,
    port: listeningPort,
    url: `http://${handle.host}:${listeningPort}`,
  };
}
