import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { DashboardStore, defaultDashboardDbPath } from './storage/sqliteStore.js';
import { seedDemoData } from './demo/seed.js';
import { parseProGuardMapping, resolveFrame } from './symbolication/resolver.js';
import type {
  CrashGroupStatus,
  EventListFilter,
  NotificationListFilter,
  SymbolFileRecord,
  SymbolPlatform,
  SymbolResolveInput,
} from './storage/types.js';
import { IngestWebSocketHandler } from './ingest/wsHandler.js';
import type { IngestWsHandlerOptions } from './ingest/wsHandler.js';
import { mapLogs, mapMetrics, mapTraces } from './ingest/otlp.js';
import { TokenBucketRateLimiter } from './ingest/rateLimiter.js';
import type { RateLimiterConfig } from './ingest/rateLimiter.js';
import type { EventRecord } from './storage/types.js';
import { RetentionPurgeJob } from './jobs/retention.js';
import type { RetentionPurgeJobOptions } from './jobs/retention.js';
import {
  listAiActions as auditListAiActions,
  parseListFilter as parseAuditListFilter,
  recordAiAction,
} from './audit/aiActions.js';
import {
  listAuditLogs,
  parseListFilter as parseAuditLogListFilter,
  recordAuditEvent,
} from './audit/auditLog.js';
import {
  REMOTE_CONFIG_SETTING_KEY,
  mergeRemoteConfig,
  parseRemoteConfig,
  serializeRemoteConfig,
  validateRemoteConfig,
} from './config/remoteConfig.js';
import {
  INGEST_KEYS_SETTING_KEY,
  DEFAULT_GRACE_MS,
  addKey as addIngestKey,
  isEnforcing as ingestKeysEnforcing,
  isValid as ingestKeyIsValid,
  parseIngestKeySet,
  pruneExpired as pruneIngestKeys,
  revoke as revokeIngestKey,
  rotate as rotateIngestKeys,
  serializeIngestKeySet,
  summarizeKeys as summarizeIngestKeys,
} from './auth/ingestKeys.js';
import {
  RBAC_SETTING_KEY,
  RBAC_JWT_SECRET_SETTING_KEY,
  authenticate as rbacAuthenticate,
  createTenant as rbacCreateTenant,
  createUser as rbacCreateUser,
  isEnforcing as rbacIsEnforcing,
  isRole as rbacIsRole,
  parseRbac,
  removeUser as rbacRemoveUser,
  roleSatisfies,
  serializeRbac,
  setRole as rbacSetRole,
  signToken,
  summarizeUsers as rbacSummarizeUsers,
  verifyToken,
  type Principal,
  type Role,
} from './auth/rbac.js';
import { DashboardAdvertiser, type DashboardAdvertiserOptions } from './discovery/advertiser.js';
import { resolveAiProvider, type AiProvider } from './ai/provider.js';
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
  /**
   * OTLP `/v1/{traces,logs,metrics}` ingest controls. These routes are
   * UNauthenticated by OTLP convention (collectors export without the
   * dashboard's operator key), so an open flood is otherwise free. Default:
   * an IP-keyed token-bucket limiter (capacity 600 burst, sustained 300
   * req/sec/IP) returns HTTP 429 + `Retry-After` and inserts nothing when an
   * IP exceeds its budget. Set `rateLimit: false` to disable (e.g. behind a
   * proxy that already throttles), or pass a `RateLimiterConfig` to tune.
   * `now` is injectable for deterministic tests.
   */
  otlp?: {
    rateLimit?: RateLimiterConfig | false;
    /** Clock override for the OTLP limiter — defaults to `Date.now`. */
    now?: () => number;
  };
  /**
   * Task 117.18 — multi-tenant RBAC for the MANAGEMENT surface (`/api/*`).
   * Independent of the ingest auth in `ingestKeys.ts` (`/v1/*` + WS keep
   * their own bearer tokens) and of the coarse `apiKey` edge gate above.
   *
   * Default (`enabled` omitted): AUTO — RBAC enforces as soon as the first
   * user exists (created via `POST /api/auth/register`), and is dormant
   * before that. While dormant, every caller is treated as the synthetic
   * Owner of the `default` tenant, so a single-tenant self-host (and every
   * existing test) needs no login. This mirrors the fail-open empty-set
   * default of ingest keys: opt-in, never a surprise lockout.
   *
   * Set `enabled: true` to require auth even before a user exists (the very
   * first request would 401 until you bootstrap), or `enabled: false` to
   * disable RBAC entirely regardless of stored users.
   *
   * `jwtSecret` signs/verifies access tokens. Precedence: this value →
   * `process.env.MONITOR_JWT_SECRET` → a 256-bit secret generated once and
   * persisted in `server_settings` (survives restarts). Pass `null` to force
   * the generated-secret path even when the env var is set.
   */
  auth?: {
    enabled?: boolean;
    jwtSecret?: string | null;
    /** Access-token lifetime in ms. Default: 12h (see DEFAULT_TOKEN_TTL_MS). */
    tokenTtlMs?: number;
    /** Clock override for token issue/verify — defaults to `Date.now`. */
    now?: () => number;
  };
  /**
   * Task 117.79 — mDNS/Bonjour LAN auto-discovery. OFF by default. When
   * `enabled`, the server advertises itself as `_erne-monitor._tcp` once it's
   * listening, so SDKs on the LAN can find it without a hardcoded IP. The real
   * multicast needs the optional `bonjour-service` package; if it isn't
   * installed, advertising is a logged no-op (never a startup failure). Pass a
   * `publisher` to inject a mock/custom advertiser. Other fields tune the
   * advertised name / TXT record.
   */
  discovery?:
    | false
    | (Omit<DashboardAdvertiserOptions, 'secure'> & { enabled?: boolean; secure?: boolean });
  /**
   * Task 117.9 — server-side AI fallback for `POST /api/ai/complete` (Member+).
   * The dashboard prefers in-browser WebLLM; this is the fallback for browsers
   * without WebGPU / server-side use. Provider precedence: `ai.provider` →
   * `ANTHROPIC_API_KEY` env → none. When no provider is configured the endpoint
   * returns 501 (the dashboard then relies on in-browser WebLLM or hides the
   * feature). Pass `ai.provider` to inject a stub in tests. `ai.provider: null`
   * forces the endpoint off regardless of env.
   */
  ai?: { provider?: AiProvider | null };
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
   * Task 117.79 — LAN discovery advertiser. `null` when discovery is disabled
   * (the default). `startDashboardServer` calls `start(port)` once listening;
   * `close()` stops it. Exposed so tests can assert advertising behaviour.
   */
  advertiser: DashboardAdvertiser | null;
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

/**
 * Task 117.18 — `/api/*` paths reachable WITHOUT a valid JWT even when RBAC
 * is enforcing. Login must be reachable (you can't get a token without it);
 * the probes must always answer for orchestrators. `/api/auth/register` is
 * deliberately NOT here: when dormant it passes via the synthetic Owner; once
 * enforcing it requires a real Owner, so anonymous access correctly 401s.
 */
const AUTH_PUBLIC_PATHS = new Set(['/api/health', '/api/ready', '/api/auth/login']);

/**
 * The identity used for every request while RBAC is dormant (no users yet, or
 * `auth.enabled === false`): a full Owner of the `default` tenant. This is what
 * keeps the single-tenant self-host login-free.
 */
const SYNTHETIC_OWNER: Principal = {
  userId: 'system',
  tenantId: 'default',
  email: 'system@localhost',
  role: 'owner',
};

/** Extract a Bearer JWT from the request: `Authorization: Bearer` or `?token`. */
function extractBearerToken(req: IncomingMessage, url: URL): string | null {
  const header = req.headers.authorization;
  if (typeof header === 'string') {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (match?.[1]) return match[1].trim();
  }
  const query = url.searchParams.get('token');
  if (query && query.length > 0) return query;
  return null;
}

/**
 * Guard a route by minimum role. Returns true when `principal` satisfies
 * `required`; otherwise sends 403 and returns false so the caller does
 * `if (!requireRole(...)) return;`. While RBAC is dormant the principal is the
 * synthetic Owner, so every guard passes — checks only bite for a real lower
 * -privilege token.
 */
function requireRole(principal: Principal, required: Role, res: ServerResponse): boolean {
  if (roleSatisfies(principal.role, required)) return true;
  sendJson(res, 403, { error: 'forbidden', required, role: principal.role });
  return false;
}

/** Normalise an unknown thrown value to a message string. */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

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

/**
 * Best-effort client IP for the audit log. Honours `x-forwarded-for`
 * (first hop) when present — the dashboard typically sits behind a
 * reverse proxy — and falls back to the socket's remote address. Never
 * throws; returns undefined when nothing is resolvable.
 */
function clientIp(req: IncomingMessage): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  } else if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0];
  }
  return req.socket.remoteAddress ?? undefined;
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

  // M2 — IP-keyed rate limiter for the UNauthenticated OTLP `/v1/*` ingest
  // routes. There's no SDK key on these (OTel collectors export without the
  // operator key), so we key by client IP. Default budget is generous —
  // collectors batch hundreds of spans per request — but a single abusive IP
  // is capped, returns 429 + `Retry-After`, and inserts nothing. `false`
  // disables it. The clock is injectable so route tests are deterministic.
  const otlpRateLimitOption = options.otlp?.rateLimit;
  const otlpNow = options.otlp?.now ?? (() => Date.now());
  const otlpLimiter =
    otlpRateLimitOption === false
      ? null
      : new TokenBucketRateLimiter(
          otlpRateLimitOption ?? { capacity: 600, refillPerSec: 300 },
        );

  // Resolve the required API key once at startup. Explicit null disables
  // the gate even when the env var is set (useful for tests and local
  // reproductions of production incidents).
  const requiredApiKey =
    options.apiKey === null
      ? null
      : options.apiKey !== undefined
        ? options.apiKey
        : (process.env.ERNE_API_KEY ?? null);

  // Task 117.62 — managed ingest-key authorization. The key set lives as a
  // JSON blob in `server_settings`; this closure reads the live set on every
  // ingest upgrade so a rotate/revoke applies instantly. Returns a predicate
  // the WS handler calls with the SDK-presented token. Fail-open: when no
  // managed keys are configured, the predicate accepts everything (the
  // legacy/dev default). Backward compat: the legacy single raw
  // `ws_auth_token` setting is accepted as a valid token even alongside the
  // managed set, so SDKs already pinned to it keep working.
  const loadIngestKeySet = () => parseIngestKeySet(store.getSetting(INGEST_KEYS_SETTING_KEY));
  const authorizeIngestToken = (token: string | null): boolean => {
    const set = loadIngestKeySet();
    // No managed keys → ingest is not gated.
    if (!ingestKeysEnforcing(set)) return true;
    const now = Date.now();
    if (ingestKeyIsValid(set, token, now)) return true;
    // Backward compat: accept the legacy raw ws_auth_token if one is set and
    // the presented token matches it exactly (constant-time).
    const legacy = store.getSetting('ws_auth_token');
    if (legacy && token && legacy.length === token.length) {
      if (constantTimeEquals(token, legacy)) return true;
    }
    return false;
  };

  const websocket =
    options.enableWebsocket === false
      ? null
      : new IngestWebSocketHandler({
          store,
          apiKey: requiredApiKey,
          authorizeIngest: authorizeIngestToken,
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

  // Task 117.79 — LAN discovery advertiser. Off unless `discovery` is enabled.
  // Created here; `startDashboardServer` starts it once the bound port is known.
  // Task 117.9 — resolve the AI fallback provider (option → env → none).
  const aiProvider = resolveAiProvider(options.ai?.provider);

  const discoveryOption = options.discovery;
  const advertiser =
    discoveryOption && (typeof discoveryOption !== 'object' || discoveryOption.enabled !== false)
      ? new DashboardAdvertiser({
          logger,
          ...(typeof discoveryOption === 'object' ? discoveryOption : {}),
        })
      : null;

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
    // Task 117.19 — back the `in-app` channel with the store unless the
    // caller already injected a sink (tests do). Persists one row per
    // firing that the dashboard reads via `GET /api/notifications`.
    if (deliveryOptions.notificationSink === undefined) {
      deliveryOptions.notificationSink = (notification) => {
        store.insertNotification(notification);
      };
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

  // Task 117.17 — remote adaptive config. SDKs poll the effective config
  // (sampling rates / PII rules / feature flags); operators read+replace
  // it. Persisted as a JSON blob in the generic key/value `server_settings`
  // store under `remote_config`. `parseRemoteConfig` is SAFE: a missing or
  // corrupt row falls back to defaults so the poll path never breaks.
  const loadRemoteConfig = () => parseRemoteConfig(store.getSetting(REMOTE_CONFIG_SETTING_KEY));

  // Task 117.18 — RBAC state + JWT secret, loaded/persisted via the same
  // settings KV the other feature modules use.
  const authNow = options.auth?.now ?? Date.now;
  const authTokenTtlMs = options.auth?.tokenTtlMs;
  const loadRbac = () => parseRbac(store.getSetting(RBAC_SETTING_KEY));
  const saveRbac = (set: ReturnType<typeof loadRbac>) =>
    store.setSetting(RBAC_SETTING_KEY, serializeRbac(set));

  /**
   * The signing secret. Precedence: explicit option → env → a 256-bit secret
   * generated once and persisted (so tokens survive restarts). `null` option
   * forces the generated path even when the env var is set.
   */
  const resolveJwtSecret = (): string => {
    if (typeof options.auth?.jwtSecret === 'string' && options.auth.jwtSecret.length > 0) {
      return options.auth.jwtSecret;
    }
    if (options.auth?.jwtSecret !== null) {
      const env = process.env.MONITOR_JWT_SECRET;
      if (typeof env === 'string' && env.length > 0) return env;
    }
    const existing = store.getSetting(RBAC_JWT_SECRET_SETTING_KEY);
    if (existing && existing.length > 0) return existing;
    const generated = randomBytes(32).toString('hex');
    store.setSetting(RBAC_JWT_SECRET_SETTING_KEY, generated);
    return generated;
  };

  /** Whether RBAC currently enforces. Forced on/off by `auth.enabled`, else
   *  auto: enforce as soon as a user exists. */
  const rbacEnforcing = (): boolean => {
    if (options.auth?.enabled === false) return false;
    if (options.auth?.enabled === true) return true;
    return rbacIsEnforcing(loadRbac());
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
      // Task 117.64 — events dropped because a tenant exceeded its
      // per-tenant ingest rate limit (subset of rejected).
      registry.observeCounter(
        'erne_ingest_tenant_rate_limited_total',
        'Total ingest events dropped due to per-tenant rate limiting.',
        ingest.tenantRateLimited,
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

      // Task 117.18 — RBAC gate. Resolves the request's identity for every
      // `/api/*` call. While dormant, `principal` is the synthetic Owner so
      // nothing is gated (single-tenant default). While enforcing, a valid
      // Bearer JWT is required on every `/api/*` path except login + probes;
      // per-route `requireRole(...)` checks below then enforce write/admin
      // boundaries. Ingest (`/v1/*` + WS) and `/metrics` are unaffected.
      let principal: Principal = SYNTHETIC_OWNER;
      if (pathname.startsWith('/api/') && rbacEnforcing()) {
        const verified = verifyToken(
          extractBearerToken(req, requestUrl),
          resolveJwtSecret(),
          authNow(),
        );
        if (verified) {
          principal = verified;
        } else {
          // Always let the FIRST-user bootstrap through, even when auth is
          // force-enabled with no users yet — otherwise the initial Owner
          // could never be created (permanent lockout). Login + probes are
          // always public via AUTH_PUBLIC_PATHS.
          const isBootstrap =
            req.method === 'POST' &&
            pathname === '/api/auth/register' &&
            !rbacIsEnforcing(loadRbac());
          if (!AUTH_PUBLIC_PATHS.has(pathname) && !isBootstrap) {
            sendJson(res, 401, { error: 'unauthorized' });
            return;
          }
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

      // ----------------------------------------------------------------
      // Task 117.18 — RBAC auth endpoints.
      // ----------------------------------------------------------------

      // POST /api/auth/login — exchange email+password for a JWT. Always
      // reachable (AUTH_PUBLIC_PATHS). 401 on bad creds (no email-exists leak).
      if (req.method === 'POST' && pathname === '/api/auth/login') {
        void readJsonBody(req)
          .then((body) => {
            const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };
            if (typeof email !== 'string' || typeof password !== 'string') {
              sendJson(res, 400, { error: 'invalid_body' });
              return;
            }
            const set = loadRbac();
            const user = rbacAuthenticate(set, email, password);
            if (!user) {
              recordAuditEvent(
                store,
                { action: 'login', actor: email.slice(0, 200), ip: clientIp(req), metadata: { ok: false } },
                reqLogger,
              );
              sendJson(res, 401, { error: 'invalid_credentials' });
              return;
            }
            const token = signToken(
              user,
              resolveJwtSecret(),
              authNow(),
              authTokenTtlMs,
            );
            recordAuditEvent(
              store,
              { action: 'login', actor: user.id, ip: clientIp(req), metadata: { ok: true, email: user.email } },
              reqLogger,
            );
            sendJson(res, 200, {
              token,
              user: { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId },
            });
          })
          .catch((err: unknown) => {
            sendJson(res, 400, { error: 'invalid_json', message: errorMessage(err) });
          });
        return;
      }

      // GET /api/auth/me — the current principal's identity. While dormant
      // this returns the synthetic Owner so the SPA can render in dev mode.
      if (req.method === 'GET' && pathname === '/api/auth/me') {
        sendJson(res, 200, {
          enforcing: rbacEnforcing(),
          user: {
            id: principal.userId,
            email: principal.email,
            role: principal.role,
            tenantId: principal.tenantId,
          },
        });
        return;
      }

      // POST /api/auth/register — create a user. Bootstrap: while dormant the
      // synthetic Owner reaches here and creates the FIRST user (role forced
      // to owner + a `default` tenant if none). Once enforcing, requires a
      // real Owner and honours the requested role within the Owner's tenant.
      if (req.method === 'POST' && pathname === '/api/auth/register') {
        if (!requireRole(principal, 'owner', res)) return;
        void readJsonBody(req)
          .then((body) => {
            const { email, password, role } = (body ?? {}) as {
              email?: unknown;
              password?: unknown;
              role?: unknown;
            };
            if (typeof email !== 'string' || typeof password !== 'string') {
              sendJson(res, 400, { error: 'invalid_body' });
              return;
            }
            let set = loadRbac();
            const bootstrapping = !rbacIsEnforcing(set);
            // First user is always an Owner; later users honour the request.
            const desiredRole: Role = bootstrapping
              ? 'owner'
              : rbacIsRole(role)
                ? role
                : 'viewer';
            // Resolve the tenant: bootstrap creates `default`; otherwise the
            // new user joins the acting Owner's tenant.
            let tenantId = principal.tenantId;
            if (bootstrapping) {
              const created = rbacCreateTenant(set, 'default', authNow());
              set = created.set;
              tenantId = created.tenant.id;
            }
            const result = rbacCreateUser(
              set,
              { tenantId, email, password, role: desiredRole },
              authNow(),
            );
            if ('error' in result) {
              const status = result.error === 'duplicate-email' ? 409 : 400;
              sendJson(res, status, { error: result.error });
              return;
            }
            saveRbac(result.set);
            recordAuditEvent(
              store,
              {
                action: 'user-create',
                actor: principal.userId,
                targetType: 'user',
                targetId: result.user.id,
                ip: clientIp(req),
                metadata: { email: result.user.email, role: result.user.role, bootstrap: bootstrapping },
              },
              reqLogger,
            );
            sendJson(res, 201, {
              user: {
                id: result.user.id,
                email: result.user.email,
                role: result.user.role,
                tenantId: result.user.tenantId,
              },
            });
          })
          .catch((err: unknown) => {
            sendJson(res, 400, { error: 'invalid_json', message: errorMessage(err) });
          });
        return;
      }

      // GET /api/auth/users — list users in the principal's tenant (Owner).
      if (req.method === 'GET' && pathname === '/api/auth/users') {
        if (!requireRole(principal, 'owner', res)) return;
        sendJson(res, 200, { users: rbacSummarizeUsers(loadRbac(), principal.tenantId) });
        return;
      }

      // PATCH /api/auth/users/:id — change a user's role (Owner). Guards the
      // last-owner invariant.
      if (req.method === 'PATCH' && pathname.startsWith('/api/auth/users/')) {
        if (!requireRole(principal, 'owner', res)) return;
        const userId = decodeURIComponent(pathname.slice('/api/auth/users/'.length));
        void readJsonBody(req)
          .then((body) => {
            const role = (body as { role?: unknown }).role;
            if (!rbacIsRole(role)) {
              sendJson(res, 400, { error: 'invalid_role' });
              return;
            }
            const set = loadRbac();
            const target = set.users.find((u) => u.id === userId);
            if (target && target.tenantId !== principal.tenantId) {
              sendJson(res, 404, { error: 'not_found' }); // tenant isolation
              return;
            }
            const result = rbacSetRole(set, userId, role);
            if (!result.ok) {
              sendJson(res, result.error === 'unknown-user' ? 404 : 409, { error: result.error });
              return;
            }
            saveRbac(result.set);
            recordAuditEvent(
              store,
              {
                action: 'user-role-change',
                actor: principal.userId,
                targetType: 'user',
                targetId: userId,
                ip: clientIp(req),
                metadata: { role },
              },
              reqLogger,
            );
            sendJson(res, 200, { ok: true });
          })
          .catch((err: unknown) => {
            sendJson(res, 400, { error: 'invalid_json', message: errorMessage(err) });
          });
        return;
      }

      // DELETE /api/auth/users/:id — remove a user (Owner). Guards last-owner.
      if (req.method === 'DELETE' && pathname.startsWith('/api/auth/users/')) {
        if (!requireRole(principal, 'owner', res)) return;
        const userId = decodeURIComponent(pathname.slice('/api/auth/users/'.length));
        const set = loadRbac();
        const target = set.users.find((u) => u.id === userId);
        if (target && target.tenantId !== principal.tenantId) {
          sendJson(res, 404, { error: 'not_found' }); // tenant isolation
          return;
        }
        const result = rbacRemoveUser(set, userId);
        if (!result.ok) {
          sendJson(res, result.error === 'unknown-user' ? 404 : 409, { error: result.error });
          return;
        }
        saveRbac(result.set);
        recordAuditEvent(
          store,
          {
            action: 'user-delete',
            actor: principal.userId,
            targetType: 'user',
            targetId: userId,
            ip: clientIp(req),
          },
          reqLogger,
        );
        sendJson(res, 200, { ok: true });
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
        if (!requireRole(principal, 'owner', res)) return;
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
        if (!requireRole(principal, 'owner', res)) return;
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
        if (!requireRole(principal, 'member', res)) return;
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

      // Task 117.19 — in-app notifications inbox. `GET /api/notifications`
      // lists rows (newest-first, optional `?unread=1` + `?limit=`) plus an
      // `unread` count for the bell badge.
      if (req.method === 'GET' && pathname === '/api/notifications') {
        const limitParam = requestUrl.searchParams.get('limit');
        const unread = requestUrl.searchParams.get('unread');
        const filter: NotificationListFilter = {
          ...(unread === '1' || unread === 'true' ? { unreadOnly: true } : {}),
          ...(limitParam ? { limit: Math.min(500, Math.max(1, Number(limitParam) || 100)) } : {}),
        };
        const notifications = store.listNotifications(filter);
        sendJson(res, 200, {
          notifications,
          unread: store.countUnreadNotifications(),
        });
        return;
      }

      // Task 117.19 — mark one notification read. `:id` may contain a
      // colon-y uuid; slice off the `/read` suffix to recover it.
      if (
        req.method === 'POST' &&
        pathname.startsWith('/api/notifications/') &&
        pathname.endsWith('/read')
      ) {
        if (!requireRole(principal, 'member', res)) return;
        const id = decodeURIComponent(
          pathname.slice('/api/notifications/'.length, -'/read'.length),
        );
        if (!id) {
          sendJson(res, 400, { error: 'missing_id' });
          return;
        }
        const ok = store.markNotificationRead(id);
        if (!ok) {
          sendJson(res, 404, { error: 'not_found', id });
          return;
        }
        sendJson(res, 200, { ok: true, unread: store.countUnreadNotifications() });
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
        if (!requireRole(principal, 'owner', res)) return;
        const userId = decodeURIComponent(pathname.slice('/api/users/'.length, -'/export'.length));
        if (!userId) {
          sendJson(res, 400, { error: 'missing_user_id' });
          return;
        }
        const exported = store.exportUserData(userId);
        recordAuditEvent(
          store,
          {
            action: 'export',
            targetType: 'user',
            targetId: userId,
            ip: clientIp(req),
            metadata: {
              sessions: exported.sessions.length,
              events: exported.events.length,
            },
          },
          reqLogger,
        );
        sendJson(res, 200, { export: exported });
        return;
      }

      if (req.method === 'DELETE' && pathname.startsWith('/api/users/')) {
        if (!requireRole(principal, 'owner', res)) return;
        const userId = decodeURIComponent(pathname.slice('/api/users/'.length));
        if (!userId) {
          sendJson(res, 400, { error: 'missing_user_id' });
          return;
        }
        const deletedEvents = store.deleteEventsByUserId(userId);
        recordAuditEvent(
          store,
          {
            action: 'delete',
            targetType: 'user',
            targetId: userId,
            ip: clientIp(req),
            metadata: { deletedEvents },
          },
          reqLogger,
        );
        sendJson(res, 200, { ok: true, deletedEvents });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/settings') {
        sendJson(res, 200, { settings: buildSettings() });
        return;
      }

      if (req.method === 'PATCH' && pathname === '/api/settings') {
        if (!requireRole(principal, 'owner', res)) return;
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
              recordAuditEvent(
                store,
                {
                  action: 'config-change',
                  targetType: 'settings',
                  targetId: 'retention_days',
                  ip: clientIp(req),
                  metadata: { retentionDays: days },
                },
                reqLogger,
              );
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

      // Task 117.65 — operator audit log. Returns the same
      // `{ rows, total }` envelope as the ai-actions list, filtered by
      // since/until/action/actor/targetType/targetId/limit/offset.
      if (req.method === 'GET' && pathname === '/api/audit') {
        const filter = parseAuditLogListFilter(requestUrl.searchParams);
        sendJson(res, 200, listAuditLogs(store, filter));
        return;
      }

      if (req.method === 'POST' && pathname === '/api/audit/ai-actions') {
        if (!requireRole(principal, 'member', res)) return;
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

      // Task 117.9 — server-side AI completion fallback (Member+). The
      // dashboard prefers in-browser WebLLM; this backs browsers without
      // WebGPU. 501 when no provider is configured. Errors map to 502 so a
      // provider outage is distinguishable from a bad request.
      if (req.method === 'POST' && pathname === '/api/ai/complete') {
        if (!requireRole(principal, 'member', res)) return;
        if (!aiProvider) {
          sendJson(res, 501, { error: 'ai_not_configured' });
          return;
        }
        void readJsonBody(req)
          .then(async (body) => {
            const b = (body ?? {}) as { prompt?: unknown; maxTokens?: unknown; system?: unknown };
            if (typeof b.prompt !== 'string' || b.prompt.trim().length === 0) {
              sendJson(res, 400, { error: 'invalid_body' });
              return;
            }
            try {
              const text = await aiProvider.complete({
                prompt: b.prompt.slice(0, 24_000),
                ...(typeof b.maxTokens === 'number' ? { maxTokens: b.maxTokens } : {}),
                ...(typeof b.system === 'string' ? { system: b.system.slice(0, 4_000) } : {}),
              });
              recordAuditEvent(
                store,
                { action: 'ai-complete', actor: principal.userId, ip: clientIp(req) },
                reqLogger,
              );
              sendJson(res, 200, { text });
            } catch (err) {
              sendJson(res, 502, { error: 'ai_provider_error', message: errorMessage(err) });
            }
          })
          .catch((err: unknown) => {
            sendJson(res, 400, { error: 'invalid_json', message: errorMessage(err) });
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
        if (!requireRole(principal, 'owner', res)) return;
        const token = randomUUID().replace(/-/g, '');
        store.setSetting('ws_auth_token', token);
        recordAuditEvent(
          store,
          {
            action: 'config-change',
            targetType: 'settings',
            targetId: 'ws_auth_token',
            ip: clientIp(req),
            // Never log the token itself — only that it was rotated.
            metadata: { rotated: true },
          },
          reqLogger,
        );
        sendJson(res, 200, { wsTokenMasked: maskToken(token), wsTokenSet: true });
        return;
      }

      // Task 117.62 — managed ingest-key endpoints (operator surface, behind
      // the /api gate). Keys authorise SDK `/ws/ingest` connections; the raw
      // token is only ever returned once, at creation/rotation. Listings
      // expose ids + status only — never the hash or any secret.
      //
      //   GET  /api/keys             list key ids + status
      //   POST /api/keys             issue an additional active key
      //   POST /api/keys/rotate      mint a new active key, retire the old
      //                              ones into a grace window
      //   POST /api/keys/:id/revoke  kill a key immediately

      if (req.method === 'GET' && pathname === '/api/keys') {
        // GC expired grace keys on read so the listing stays tidy without a
        // separate sweep; persist only when something actually changed.
        const set = loadIngestKeySet();
        const now = Date.now();
        const pruned = pruneIngestKeys(set, now);
        if (
          pruned.retired.length !== set.retired.length ||
          pruned.active.length !== set.active.length
        ) {
          store.setSetting(INGEST_KEYS_SETTING_KEY, serializeIngestKeySet(pruned));
        }
        sendJson(res, 200, {
          keys: summarizeIngestKeys(pruned, now),
          enforcing: ingestKeysEnforcing(pruned),
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/keys') {
        if (!requireRole(principal, 'owner', res)) return;
        void readJsonBody(req)
          .then((body) => {
            const input = (body ?? {}) as { label?: unknown };
            const label =
              typeof input.label === 'string' && input.label.length > 0
                ? input.label.slice(0, 256)
                : undefined;
            const now = Date.now();
            const current = pruneIngestKeys(loadIngestKeySet(), now);
            const { set: next, generated } = addIngestKey(current, now, label);
            store.setSetting(INGEST_KEYS_SETTING_KEY, serializeIngestKeySet(next));
            recordAuditEvent(
              store,
              {
                action: 'config-change',
                targetType: 'ingest-key',
                targetId: generated.record.id,
                ip: clientIp(req),
                // Record the id + that a key was created — never the token.
                metadata: { created: true, ...(label ? { label } : {}) },
              },
              reqLogger,
            );
            sendJson(res, 200, {
              // The raw token is surfaced exactly once, here.
              key: {
                id: generated.record.id,
                token: generated.token,
                createdAt: generated.record.createdAt,
              },
              keys: summarizeIngestKeys(next, now),
              enforcing: ingestKeysEnforcing(next),
            });
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            sendJson(res, 400, { error: 'invalid_json', message });
          });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/keys/rotate') {
        if (!requireRole(principal, 'owner', res)) return;
        void readJsonBody(req)
          .then((body) => {
            const input = (body ?? {}) as { label?: unknown; graceMs?: unknown };
            const label =
              typeof input.label === 'string' && input.label.length > 0
                ? input.label.slice(0, 256)
                : undefined;
            const graceMs =
              typeof input.graceMs === 'number' &&
              Number.isFinite(input.graceMs) &&
              input.graceMs >= 0
                ? input.graceMs
                : DEFAULT_GRACE_MS;
            const now = Date.now();
            const current = pruneIngestKeys(loadIngestKeySet(), now);
            const retiredCount = current.active.length;
            const { set: next, generated } = rotateIngestKeys(current, now, graceMs, label);
            store.setSetting(INGEST_KEYS_SETTING_KEY, serializeIngestKeySet(next));
            recordAuditEvent(
              store,
              {
                action: 'config-change',
                targetType: 'ingest-key',
                targetId: generated.record.id,
                ip: clientIp(req),
                // Record shape only: how many keys were retired + the grace
                // window. Never the token.
                metadata: { rotated: true, retiredCount, graceMs, ...(label ? { label } : {}) },
              },
              reqLogger,
            );
            sendJson(res, 200, {
              key: {
                id: generated.record.id,
                token: generated.token,
                createdAt: generated.record.createdAt,
              },
              keys: summarizeIngestKeys(next, now),
              enforcing: ingestKeysEnforcing(next),
            });
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            sendJson(res, 400, { error: 'invalid_json', message });
          });
        return;
      }

      if (
        req.method === 'POST' &&
        pathname.startsWith('/api/keys/') &&
        pathname.endsWith('/revoke')
      ) {
        if (!requireRole(principal, 'owner', res)) return;
        const id = decodeURIComponent(pathname.slice('/api/keys/'.length, -'/revoke'.length));
        if (!id) {
          sendJson(res, 400, { error: 'missing_id' });
          return;
        }
        const now = Date.now();
        const current = loadIngestKeySet();
        const { set: next, revoked } = revokeIngestKey(current, id, now);
        if (!revoked) {
          sendJson(res, 404, { error: 'not_found', id });
          return;
        }
        store.setSetting(INGEST_KEYS_SETTING_KEY, serializeIngestKeySet(next));
        recordAuditEvent(
          store,
          {
            action: 'config-change',
            targetType: 'ingest-key',
            targetId: id,
            ip: clientIp(req),
            metadata: { revoked: true },
          },
          reqLogger,
        );
        sendJson(res, 200, {
          ok: true,
          keys: summarizeIngestKeys(next, now),
          enforcing: ingestKeysEnforcing(next),
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/settings/reset') {
        if (!requireRole(principal, 'owner', res)) return;
        const counts = store.resetAllUserData();
        recordAuditEvent(
          store,
          {
            action: 'delete',
            targetType: 'all-user-data',
            ip: clientIp(req),
            metadata: { deleted: counts },
          },
          reqLogger,
        );
        sendJson(res, 200, { ok: true, deleted: counts });
        return;
      }

      // Task 117.17 — remote adaptive config, operator surface.
      //   GET  /api/config  — read the current effective config.
      //   PUT  /api/config  — validate + persist (replace by default,
      //                       ?merge=1 for per-section merge), record a
      //                       `config-change` audit row, return the stored
      //                       config. 400 on invalid input (config unchanged).
      if (req.method === 'GET' && pathname === '/api/config') {
        sendJson(res, 200, { config: loadRemoteConfig() });
        return;
      }

      if (req.method === 'PUT' && pathname === '/api/config') {
        if (!requireRole(principal, 'owner', res)) return;
        const merge = requestUrl.searchParams.get('merge') === '1';
        void readJsonBody(req)
          .then((body) => {
            const result = validateRemoteConfig(body);
            if (!result.ok) {
              // Invalid input → 400, config left untouched.
              sendJson(res, 400, { error: 'invalid_config', errors: result.errors });
              return;
            }
            const next = merge
              ? mergeRemoteConfig(loadRemoteConfig(), result.config, result.present)
              : result.config;
            next.updatedAt = Date.now();
            store.setSetting(REMOTE_CONFIG_SETTING_KEY, serializeRemoteConfig(next));
            recordAuditEvent(
              store,
              {
                action: 'config-change',
                targetType: 'settings',
                targetId: REMOTE_CONFIG_SETTING_KEY,
                ip: clientIp(req),
                // Record shape stats, never PII rule contents themselves.
                metadata: {
                  merge,
                  samplingKeys: Object.keys(next.sampling).length,
                  piiRules: next.piiRules.length,
                  featureFlags: Object.keys(next.featureFlags).length,
                },
              },
              reqLogger,
            );
            sendJson(res, 200, { config: next });
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            sendJson(res, 400, { error: 'invalid_json', message });
          });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/demo/seed') {
        if (!requireRole(principal, 'owner', res)) return;
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
        if (!requireRole(principal, 'owner', res)) return;
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
        if (!requireRole(principal, 'owner', res)) return;
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
        if (!requireRole(principal, 'member', res)) return;
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
        if (!requireRole(principal, 'member', res)) return;
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

      // Task 117.20 — bug-report reply thread, OPERATOR side (RBAC). GET is a
      // read (Viewer+); POST appends an operator reply (Member+). Matched by
      // method, so they never collide with the PATCH route above.
      if (
        req.method === 'GET' &&
        pathname.startsWith('/api/bug-reports/') &&
        pathname.endsWith('/replies')
      ) {
        const id = decodeURIComponent(
          pathname.slice('/api/bug-reports/'.length, -'/replies'.length),
        );
        if (!id) {
          sendJson(res, 400, { error: 'missing_id' });
          return;
        }
        sendJson(res, 200, { replies: store.listBugReportReplies(id) });
        return;
      }

      if (
        req.method === 'POST' &&
        pathname.startsWith('/api/bug-reports/') &&
        pathname.endsWith('/replies')
      ) {
        if (!requireRole(principal, 'member', res)) return;
        const id = decodeURIComponent(
          pathname.slice('/api/bug-reports/'.length, -'/replies'.length),
        );
        if (!id) {
          sendJson(res, 400, { error: 'missing_id' });
          return;
        }
        void readJsonBody(req)
          .then((body) => {
            const text = (body as { body?: unknown }).body;
            if (typeof text !== 'string' || text.trim().length === 0) {
              sendJson(res, 400, { error: 'invalid_body' });
              return;
            }
            const exists = store.listBugReports({ limit: 1000 }).some((r) => r.id === id);
            if (!exists) {
              sendJson(res, 404, { error: 'not_found', id });
              return;
            }
            const reply = {
              id: randomUUID(),
              reportId: id,
              author: principal.userId,
              authorRole: 'operator' as const,
              body: text.slice(0, 8000),
              createdAt: Date.now(),
            };
            store.insertBugReportReply(reply);
            recordAuditEvent(
              store,
              {
                action: 'bug-reply',
                actor: principal.userId,
                targetType: 'bug_report',
                targetId: id,
                ip: clientIp(req),
              },
              reqLogger,
            );
            sendJson(res, 201, { reply });
          })
          .catch((err: unknown) => {
            sendJson(res, 400, { error: 'invalid_json', message: errorMessage(err) });
          });
        return;
      }

      // Task 117.17 — SDK-facing remote config poll endpoint. Lives at the
      // root (NOT under /api/) per the same convention as the OTLP ingest
      // routes, so it bypasses the /api/* API-key gate: SDKs poll this on a
      // timer to pick up sampling / PII / feature-flag changes and shouldn't
      // need the operator key. Read-only; returns the same effective config
      // as GET /api/config.
      if (req.method === 'GET' && pathname === '/v1/config') {
        sendJson(res, 200, { config: loadRemoteConfig() });
        return;
      }

      // Task 117.20 — SDK-facing bidirectional bug reports. Lives under /v1
      // (NOT /api/, so it bypasses the RBAC + operator-key gates) and is
      // authed with the INGEST key — the SDK creates reports, posts the app
      // user's ("reporter") replies, and polls operator replies for in-app
      // display. Reporter replies and report creation are clamped + sanitized.
      if (pathname === '/v1/bug-reports' || pathname.startsWith('/v1/bug-reports/')) {
        if (!authorizeIngestToken(extractBearerToken(req, requestUrl))) {
          sendJson(res, 401, { error: 'unauthorized' });
          return;
        }
        // Poll operator replies for a session (in-app display).
        if (req.method === 'GET' && pathname === '/v1/bug-reports/replies') {
          const sessionId = requestUrl.searchParams.get('sessionId');
          if (!sessionId) {
            sendJson(res, 400, { error: 'missing_sessionId' });
            return;
          }
          const sinceRaw = requestUrl.searchParams.get('since');
          const since = sinceRaw !== null && Number.isFinite(Number(sinceRaw)) ? Number(sinceRaw) : 0;
          const reports = store.listBugReports({ sessionId, limit: 1000 });
          const replies = reports
            .flatMap((r) => store.listBugReportReplies(r.id))
            .filter((reply) => reply.authorRole === 'operator' && reply.createdAt > since)
            .sort((a, b) => a.createdAt - b.createdAt);
          sendJson(res, 200, { replies });
          return;
        }
        // Create a report.
        if (req.method === 'POST' && pathname === '/v1/bug-reports') {
          void readJsonBody(req)
            .then((body) => {
              const b = (body ?? {}) as {
                sessionId?: unknown;
                title?: unknown;
                description?: unknown;
                eventIds?: unknown;
                attachments?: unknown;
              };
              if (typeof b.sessionId !== 'string' || b.sessionId.length === 0) {
                sendJson(res, 400, { error: 'invalid_body' });
                return;
              }
              const report = {
                id: randomUUID(),
                sessionId: b.sessionId,
                submittedAt: Date.now(),
                status: 'new' as const,
                ...(typeof b.title === 'string' ? { title: b.title.slice(0, 500) } : {}),
                ...(typeof b.description === 'string'
                  ? { description: b.description.slice(0, 8000) }
                  : {}),
                ...(Array.isArray(b.eventIds)
                  ? { eventIds: b.eventIds.filter((x): x is string => typeof x === 'string').slice(0, 100) }
                  : {}),
                ...(b.attachments && typeof b.attachments === 'object'
                  ? { attachments: b.attachments as Record<string, unknown> }
                  : {}),
              };
              store.insertBugReport(report);
              sendJson(res, 201, { report });
            })
            .catch((err: unknown) => {
              sendJson(res, 400, { error: 'invalid_json', message: errorMessage(err) });
            });
          return;
        }
        // Reporter (app user) reply.
        if (
          req.method === 'POST' &&
          pathname.startsWith('/v1/bug-reports/') &&
          pathname.endsWith('/replies')
        ) {
          const id = decodeURIComponent(
            pathname.slice('/v1/bug-reports/'.length, -'/replies'.length),
          );
          void readJsonBody(req)
            .then((body) => {
              const text = (body as { body?: unknown }).body;
              if (typeof text !== 'string' || text.trim().length === 0 || !id) {
                sendJson(res, 400, { error: 'invalid_body' });
                return;
              }
              const reply = {
                id: randomUUID(),
                reportId: id,
                author: 'reporter',
                authorRole: 'reporter' as const,
                body: text.slice(0, 8000),
                createdAt: Date.now(),
              };
              store.insertBugReportReply(reply);
              sendJson(res, 201, { reply });
            })
            .catch((err: unknown) => {
              sendJson(res, 400, { error: 'invalid_json', message: errorMessage(err) });
            });
          return;
        }
        sendJson(res, 404, { error: 'not_found', path: pathname });
        return;
      }

      // Task 117.11 — OpenTelemetry OTLP/HTTP **JSON** ingest. Lets any
      // OTel SDK / collector export telemetry to ERNE without the bespoke
      // WS protocol. Each endpoint reads + parses the JSON body, maps it
      // to EventRecord[] via the pure mapper, persists every record on the
      // same store insert path the WS handler uses, and returns the OTLP
      // success envelope (`{ partialSuccess: {} }`) with 200. Malformed
      // JSON yields a structured 400 — the handler never crashes on bad
      // input. Lives at the root (NOT under /api/) per OTLP convention.
      if (
        req.method === 'POST' &&
        (pathname === '/v1/traces' || pathname === '/v1/logs' || pathname === '/v1/metrics')
      ) {
        // M2 — these routes are unauthenticated, so guard the flood with an
        // IP-keyed token bucket BEFORE reading the body. An over-limit IP
        // gets HTTP 429 + a `Retry-After` hint and nothing is parsed or
        // inserted, so a single abuser can't drain CPU/IO for everyone else.
        if (otlpLimiter) {
          const ip = clientIp(req) ?? 'anon';
          const decision = otlpLimiter.tryConsume(`ip:${ip}`, otlpNow());
          if (!decision.allowed) {
            // `Retry-After` is whole seconds per RFC 9110; round the ms hint
            // up to at least 1s so a polite exporter actually backs off.
            const retryAfterSec = Math.max(
              1,
              Math.ceil((decision.retryAfterMs ?? 1000) / 1000),
            );
            applyBaseSecurityHeaders(res);
            res.writeHead(429, {
              'content-type': 'application/json; charset=utf-8',
              'retry-after': String(retryAfterSec),
              'cache-control': 'no-store',
            });
            res.end(
              JSON.stringify({
                error: 'rate_limited',
                retryAfterMs: decision.retryAfterMs,
              }),
            );
            return;
          }
        }
        // OTLP exporters batch many spans/logs/points per request — allow
        // a generous body cap (4 MiB) well above the default JSON limit.
        void readJsonBody(req, 4 * 1024 * 1024)
          .then((body) => {
            let records: EventRecord[];
            if (pathname === '/v1/traces') records = mapTraces(body);
            else if (pathname === '/v1/logs') records = mapLogs(body);
            else records = mapMetrics(body);
            // M2 — insert the whole batch in ONE transaction. A bad record
            // can't 500 the request or leave a partial write: the mapper
            // already produced well-formed `EventRecord`s, and the
            // transaction is atomic across the set (`INSERT OR IGNORE`
            // dedups by id, so duplicates are silently skipped, not errors).
            const { inserted } = store.insertEventsBatch(records);
            const accepted = inserted;
            // OTLP success shape: an empty `partialSuccess` signals full
            // acceptance. We surface our accepted count alongside it for
            // observability without breaking the contract.
            sendJson(res, 200, { partialSuccess: {}, accepted });
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
    advertiser,
    alertEvaluator,
    cache,
    url: `http://${host}:${port}`,
    close: () =>
      new Promise<void>((resolveClose) => {
        retentionJob?.stop();
        advertiser?.stop();
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
  // Task 117.79 — advertise on the LAN now that the bound port is known.
  handle.advertiser?.start(listeningPort);
  return {
    ...handle,
    port: listeningPort,
    url: `http://${handle.host}:${listeningPort}`,
  };
}
