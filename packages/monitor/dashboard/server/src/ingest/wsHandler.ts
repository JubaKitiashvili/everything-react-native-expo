import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage, Server } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { DashboardStore } from '../storage/sqliteStore.js';
import type { EventRecord, SessionRecord, Severity, CrashGroupRecord } from '../storage/types.js';
import { computeFallbackFingerprint } from './fingerprint.js';
import {
  DEFAULT_RATE_LIMITER_CONFIG,
  TokenBucketRateLimiter,
  deriveTenantKey,
  type RateLimiterConfig,
} from './rateLimiter.js';
import type { IQueue, QueueStats } from '../queue/IQueue.js';
import { InMemoryQueue } from '../queue/in-memory-adapter.js';

export const INGEST_PATH = '/ws/ingest';
export const SUBSCRIBE_PATH = '/ws/subscribe';

export type IngestWsHandlerOptions = {
  store: DashboardStore;
  /** Current time provider — injected for tests. */
  now?: () => number;
  /** Max events accepted from a single SDK connection per `rateWindowMs`. */
  maxEventsPerWindow?: number;
  /** Rate-window size in ms. Default 1000ms. */
  rateWindowMs?: number;
  /**
   * Task 117.64 — per-tenant ingest rate limiting. The connection-level
   * `maxEventsPerWindow` guard protects a single socket; this limiter
   * protects the dashboard from a single noisy tenant fanning a flood
   * across many connections. Keyed by the SDK/API key the connection
   * carries (`?apiKey=` / `?ws_auth_token=` / `Authorization: Bearer`),
   * falling back to client IP — so one app can never starve ingest for
   * the rest of the fleet.
   *
   * A token bucket: `capacity` is the largest burst accepted after an idle
   * period; `refillPerSec` is the sustained per-tenant rate. Defaults
   * (`DEFAULT_RATE_LIMITER_CONFIG`): 100-event burst, 50 events/sec/tenant.
   * Set `tenantRateLimit: false` to disable per-tenant limiting entirely
   * (the per-connection guard still applies).
   */
  tenantRateLimit?: RateLimiterConfig | false;
  /** Max bytes per incoming WS message. Default 256 KB. */
  maxMessageBytes?: number;
  /** Logger hook; defaults to console on server-side errors only. */
  onError?: (err: Error, context: string) => void;
  /**
   * API key guarding `/ws/subscribe` (Task 117.101). When set, every
   * subscriber must present the key as `?apiKey=<key>` (WebSocket API
   * can't set arbitrary headers in browsers) or `Authorization: Bearer
   * <key>` (Node/CLI clients). When null/undefined, no gate — matches
   * the REST gate's dev-friendly default.
   *
   * The ingest path (`/ws/ingest`) is NOT gated by this key — SDKs in
   * shipped apps don't have access to the operator's dashboard key.
   * SDK-side auth uses the rotatable `ws_auth_token` setting and is
   * gated by a separate task.
   */
  apiKey?: string | null;
  /**
   * Task 117.62 — managed ingest-key gate on `/ws/ingest`. When provided,
   * every SDK ingest upgrade must present a token the predicate accepts
   * (read from `?apiKey=` / `?ws_auth_token=` query params — browsers can't
   * set WS headers — or `Authorization: Bearer <token>`). The predicate is
   * the bridge to the rotatable/revocable key set owned by the server
   * (`createDashboardServer` passes a closure over the `ingest_keys`
   * setting), so a revoked token is rejected instantly and a rotated-out
   * token still works during its grace window.
   *
   * When OMITTED (the default — and every legacy test), ingest is NOT gated:
   * any SDK connects, preserving the dev-friendly fail-open behaviour the
   * shipped fleet relies on. The server only supplies a predicate, and the
   * predicate only enforces, once an operator has configured at least one
   * managed key.
   *
   * Distinct from `apiKey` above, which gates the dashboard's `/ws/subscribe`
   * stream with the operator's dashboard key — SDKs never have that key.
   */
  authorizeIngest?: (token: string | null) => boolean;
  /**
   * Task 117.5 — inject a custom queue implementation. When omitted,
   * the handler constructs an `InMemoryQueue<EventRecord>` with
   * concurrency=1 (FIFO to preserve per-session ordering), default
   * retry, and a 10_000-item backpressure ceiling. A queue is always
   * used; the ingest hot path is never fully synchronous.
   */
  queue?: IQueue<EventRecord>;
  /**
   * Task 117.99 — invoked synchronously inside the queue worker after
   * an event is persisted (i.e. only when `inserted=true`). Used by
   * the alert evaluator to count metric events into rule windows.
   * Errors from the hook are caught and surfaced via `onError` so a
   * misbehaving downstream never blocks ingest.
   */
  onEventPersisted?: (event: EventRecord) => void | Promise<void>;
};

type SdkMessage =
  | { kind: 'hello'; session: IngestSessionPayload }
  | { kind: 'event'; event: IngestEventPayload }
  | { kind: 'batch'; events: IngestEventPayload[] }
  | { kind: 'session-end'; sessionId: string; endedAt?: number };

type DashboardMessage =
  | { kind: 'hello'; serverTime: number }
  | { kind: 'event'; event: EventRecord }
  | { kind: 'crash-group-update'; group: CrashGroupRecord }
  | {
      kind: 'error';
      message: string;
      /**
       * Task 117.64 — machine-readable error category. Currently only
       * `rate-limited` (tenant exceeded its ingest rate); omitted for
       * generic/malformed-payload errors so existing frames are unchanged.
       */
      reason?: 'rate-limited';
      /** Task 117.64 — ms until the tenant may retry, on rate-limit errors. */
      retryAfterMs?: number;
    };

export interface IngestSessionPayload {
  id: string;
  userId?: string;
  startedAt?: number;
  platform?: string;
  device?: Record<string, unknown>;
  appVersion?: string;
  runtimeVersion?: string;
  channel?: string;
}

export interface IngestEventPayload {
  id?: string;
  type?: string;
  severity?: Severity | string;
  sessionId?: string;
  fingerprint?: string;
  timestamp?: number;
  screen?: string;
  platform?: string;
  userId?: string;
  payload?: Record<string, unknown>;
}

const VALID_SEVERITIES: ReadonlyArray<Severity> = [
  'critical',
  'warning',
  'info',
  'success',
  'muted',
];

export interface IngestStats {
  ingested: number;
  rejected: number;
  crashes: number;
  broadcasts: number;
  /**
   * Task 117.49 — count of events skipped because a row with the same
   * id already existed. A retry flood should leave this growing while
   * `ingested` stays flat.
   */
  deduplicated: number;
  /**
   * Task 117.5 — events refused at enqueue time because the ingest
   * queue was at its `maxSize`. Orthogonal to `rejected` (which counts
   * malformed payloads and rate-limit violations). A non-zero value
   * here means the dashboard is ingesting slower than the SDK fleet
   * can deliver.
   */
  backpressured: number;
  /**
   * Task 117.64 — events dropped because the originating tenant exceeded
   * its per-tenant ingest rate limit. Subset of `rejected` (these also
   * bump `rejected`), broken out so operators can distinguish abusive
   * tenants from malformed payloads. A growing value here points at one
   * noisy app rather than a server-side problem.
   */
  tenantRateLimited: number;
}

interface SdkConnectionState {
  sessionId?: string;
  windowStart: number;
  inWindow: number;
  /**
   * Task 117.64 — opaque tenant key derived once on connect (SDK key or
   * client IP). Pinned per-connection so the limiter aggregates every
   * socket from the same tenant into one bucket. `undefined` when
   * per-tenant limiting is disabled.
   */
  tenantKey?: string;
}

/**
 * WebSocket ingest + subscribe hub.
 *
 * Two URL paths:
 * - `/ws/ingest` — monitor SDKs send hello / event / batch / session-end.
 * - `/ws/subscribe` — dashboard clients receive live event + crash-group
 *   broadcasts.
 *
 * The handler normalises SDK payloads, persists them via the store,
 * upserts the crash_groups row for crash-type events, and fans out
 * a compact broadcast to every subscriber. Invalid payloads are dropped
 * (with an `error` frame back to the sender) rather than crashing the
 * server — SDKs must never take the dashboard down.
 */
export class IngestWebSocketHandler {
  private readonly store: DashboardStore;
  private readonly now: () => number;
  private readonly maxEventsPerWindow: number;
  private readonly rateWindowMs: number;
  private readonly maxMessageBytes: number;
  private readonly onError: (err: Error, context: string) => void;

  private readonly wss: WebSocketServer;
  private readonly subscribers = new Set<WebSocket>();
  private readonly sdkState = new WeakMap<WebSocket, SdkConnectionState>();
  private readonly apiKey: string | null;
  /**
   * Task 117.62 — managed ingest-key predicate. `null` (the default) means
   * the ingest path is ungated (fail-open dev default). Set by the server
   * to a closure over the rotatable/revocable `ingest_keys` setting.
   */
  private readonly authorizeIngest: ((token: string | null) => boolean) | null;

  /**
   * Task 117.64 — per-tenant token-bucket limiter. `null` when disabled
   * via `tenantRateLimit: false`.
   */
  private readonly tenantLimiter: TokenBucketRateLimiter | null;

  readonly stats: IngestStats = {
    ingested: 0,
    rejected: 0,
    crashes: 0,
    broadcasts: 0,
    deduplicated: 0,
    backpressured: 0,
    tenantRateLimited: 0,
  };

  /**
   * Task 117.5 — ingest queue. Events flow: WS frame → normalise →
   * enqueue → worker runs `persistAndBroadcast` off the WS callback.
   * Default is in-memory, FIFO, single-worker. Injection point is
   * `options.queue` — swap in a persistent or distributed queue for
   * multi-process deployments.
   */
  private readonly queue: IQueue<EventRecord>;
  private readonly onEventPersisted: ((event: EventRecord) => void | Promise<void>) | null;

  constructor(options: IngestWsHandlerOptions) {
    this.store = options.store;
    this.now = options.now ?? (() => Date.now());
    this.maxEventsPerWindow = options.maxEventsPerWindow ?? 200;
    this.rateWindowMs = options.rateWindowMs ?? 1_000;
    this.maxMessageBytes = options.maxMessageBytes ?? 256 * 1024;
    this.onError =
      options.onError ??
      ((err, ctx) => {
        console.error(`[dashboard-server:${ctx}]`, err.message);
      });
    this.apiKey = options.apiKey ?? null;
    this.authorizeIngest = options.authorizeIngest ?? null;
    // Task 117.64 — construct the per-tenant limiter unless explicitly
    // disabled. `undefined` → defaults; a config object → those limits;
    // `false` → no per-tenant limiting (connection guard still applies).
    this.tenantLimiter =
      options.tenantRateLimit === false
        ? null
        : new TokenBucketRateLimiter(options.tenantRateLimit ?? DEFAULT_RATE_LIMITER_CONFIG);
    this.wss = new WebSocketServer({ noServer: true });

    this.queue = options.queue ?? new InMemoryQueue<EventRecord>();
    this.queue.on('failed', ({ error }) => {
      this.onError(error, 'ingest-queue-failed');
    });
    this.onEventPersisted = options.onEventPersisted ?? null;
    this.queue.start((event) => this.persistAndBroadcast(event));
  }

  /**
   * Task 117.99 — replace the persisted-event hook at runtime. Used by
   * `createDashboardServer` so the evaluator can be constructed after
   * the handler (avoiding a circular construction order).
   */
  setOnEventPersisted(hook: ((event: EventRecord) => void | Promise<void>) | null): void {
    // Cast away `readonly` for this single, controlled mutation so the
    // common case (hook locked in at construction) remains immutable.
    (this as unknown as { onEventPersisted: typeof hook }).onEventPersisted = hook;
  }

  /** Task 117.5 — queue stats for `/api/queue/stats` observability. */
  queueStats(): QueueStats {
    return this.queue.stats();
  }

  /**
   * Task 117.5 — wait for the ingest queue to drain. Exposed for tests
   * and graceful shutdown. Returns once every enqueued event has been
   * processed (or dropped after retries).
   */
  async flush(timeoutMs = 5_000): Promise<void> {
    const start = Date.now();
    while (
      (this.queue.stats().currentSize > 0 || this.queue.stats().inFlight > 0) &&
      Date.now() - start < timeoutMs
    ) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  /** Attach the handler's upgrade router to a Node HTTP server. */
  attach(httpServer: Server): void {
    httpServer.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://internal');
      // Root `/` is accepted as an alias for ingest — the @erne/monitor
      // SDK's DashboardBridge connects to the configured `dashboardUrl`
      // without a path component, so consumers setting
      // `dashboardUrl: 'ws://localhost:3333'` land here instead of
      // `/ws/ingest`. Both paths route through the same handler, which
      // sniffs the first message to decide whether it's the new
      // `{kind: ...}` protocol or the legacy `{type: 'monitor:...'}` frame.
      if (url.pathname === INGEST_PATH || url.pathname === '/') {
        // Task 117.62 — managed ingest-key gate. Only enforces when the
        // server supplied a predicate (i.e. an operator configured at least
        // one ingest key); otherwise ingest stays fail-open for the fleet.
        // Reject with a 401 Upgrade so the SDK can distinguish "bad/missing
        // key" from a transient socket drop and rotate to the new token.
        if (this.authorizeIngest && !this.authorizeIngest(extractIngestToken(req, url))) {
          rejectUpgrade(socket, 401, 'unauthorized');
          return;
        }
        this.wss.handleUpgrade(req, socket, head, (ws) => this.onIngestConnection(ws, req, url));
        return;
      }
      if (url.pathname === SUBSCRIBE_PATH) {
        // Task 117.101 — API-key gate on the live broadcast stream.
        // Reject with 401 Upgrade rather than accept + close so the
        // client knows the reason (a generic socket.destroy() looks
        // like a transient network error).
        if (this.apiKey && !this.authorizeSubscribe(req, url)) {
          rejectUpgrade(socket, 401, 'unauthorized');
          return;
        }
        this.wss.handleUpgrade(req, socket, head, (ws) => this.onSubscribeConnection(ws));
        return;
      }
      socket.destroy();
    });
  }

  private authorizeSubscribe(req: IncomingMessage, url: URL): boolean {
    if (!this.apiKey) return true;
    const header = req.headers.authorization;
    const fromHeader =
      typeof header === 'string' ? /^Bearer\s+(.+)$/i.exec(header.trim())?.[1]?.trim() : undefined;
    const fromQuery = url.searchParams.get('apiKey') ?? undefined;
    const presented = fromHeader ?? fromQuery;
    if (!presented) return false;
    const a = Buffer.from(presented, 'utf8');
    const b = Buffer.from(this.apiKey, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  close(): void {
    for (const ws of this.subscribers) ws.close();
    this.subscribers.clear();
    this.wss.close();
    // Fire-and-forget the queue stop — we can't make `close()` async
    // without cascading through the `DashboardServerHandle.close` API.
    // The outer `createDashboardServer` awaits `closeAsync()` so we
    // only lose straggling broadcasts; DB writes already persisted.
    void this.queue.stop(1_000);
  }

  /**
   * Graceful-shutdown variant used by `createDashboardServer`. Drains
   * the queue with a timeout so inflight events still land before the
   * store closes.
   */
  async closeAsync(drainTimeoutMs = 5_000): Promise<void> {
    for (const ws of this.subscribers) ws.close();
    this.subscribers.clear();
    this.wss.close();
    await this.queue.stop(drainTimeoutMs);
  }

  /** Number of currently-connected dashboard subscribers. */
  get subscriberCount(): number {
    return this.subscribers.size;
  }

  // ------------------------------ SDK side ------------------------------

  private onIngestConnection(ws: WebSocket, req: IncomingMessage, url: URL): void {
    const state: SdkConnectionState = { windowStart: this.now(), inWindow: 0 };
    // Task 117.64 — pin the tenant key for the lifetime of this socket so
    // every event the connection sends draws from the same bucket. Derived
    // once on connect; deriving per-event would re-parse the URL needlessly.
    if (this.tenantLimiter) state.tenantKey = deriveTenantKey(req, url);
    this.sdkState.set(ws, state);

    ws.on('message', (raw) => this.handleIngestMessage(ws, raw));
    ws.on('error', (err) => this.onError(err, 'ingest-ws'));
    ws.on('close', () => this.sdkState.delete(ws));
  }

  private handleIngestMessage(ws: WebSocket, raw: Buffer | ArrayBuffer | Buffer[]): void {
    const size = messageSize(raw);
    if (size > this.maxMessageBytes) {
      this.stats.rejected += 1;
      this.sendTo(ws, { kind: 'error', message: 'message too large' });
      return;
    }
    let text: string;
    try {
      text = toText(raw);
    } catch (err) {
      this.stats.rejected += 1;
      this.onError(err as Error, 'ingest-decode');
      this.sendTo(ws, { kind: 'error', message: 'binary payload' });
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.stats.rejected += 1;
      this.sendTo(ws, { kind: 'error', message: 'invalid JSON' });
      return;
    }
    // Translate legacy `{type: 'monitor:...'}` frames emitted by the SDK's
    // DashboardBridge into the new `{kind: ...}` envelope. Preserves
    // backwards compat with shipped SDK versions that still speak the
    // Phase 4 protocol.
    const legacyTranslated = translateLegacyFrame(parsed, this.now);
    if (legacyTranslated !== null) parsed = legacyTranslated;

    const msg = parsed as Partial<SdkMessage>;
    if (!msg || typeof msg !== 'object' || typeof msg.kind !== 'string') {
      this.stats.rejected += 1;
      this.sendTo(ws, { kind: 'error', message: 'missing kind' });
      return;
    }

    try {
      switch (msg.kind) {
        case 'hello':
          this.handleHello(ws, (msg as { session?: IngestSessionPayload }).session);
          return;
        case 'event':
          this.handleEvent(ws, (msg as { event?: IngestEventPayload }).event);
          return;
        case 'batch':
          this.handleBatch(ws, (msg as { events?: IngestEventPayload[] }).events);
          return;
        case 'session-end':
          this.handleSessionEnd(
            ws,
            (msg as { sessionId?: string; endedAt?: number }).sessionId,
            (msg as { endedAt?: number }).endedAt,
          );
          return;
        default:
          this.stats.rejected += 1;
          this.sendTo(ws, { kind: 'error', message: `unknown kind ${msg.kind}` });
      }
    } catch (err) {
      this.stats.rejected += 1;
      this.onError(err as Error, `ingest-${msg.kind}`);
      this.sendTo(ws, { kind: 'error', message: (err as Error).message });
    }
  }

  private handleHello(ws: WebSocket, session: IngestSessionPayload | undefined): void {
    if (!session || typeof session.id !== 'string') {
      this.stats.rejected += 1;
      this.sendTo(ws, { kind: 'error', message: 'hello missing session.id' });
      return;
    }
    const record: SessionRecord = {
      id: session.id,
      startedAt: typeof session.startedAt === 'number' ? session.startedAt : this.now(),
      eventCount: 0,
      crashCount: 0,
    };
    if (session.userId !== undefined) record.userId = session.userId;
    if (session.platform !== undefined) record.platform = session.platform;
    if (session.device !== undefined) record.device = session.device;
    if (session.appVersion !== undefined) record.appVersion = session.appVersion;
    if (session.runtimeVersion !== undefined) record.runtimeVersion = session.runtimeVersion;
    if (session.channel !== undefined) record.channel = session.channel;
    this.store.upsertSession(record);

    const state = this.sdkState.get(ws);
    if (state) state.sessionId = session.id;

    this.sendTo(ws, { kind: 'hello', serverTime: this.now() });
  }

  private handleEvent(ws: WebSocket, payload: IngestEventPayload | undefined): void {
    if (!this.checkTenantRate(ws)) return;
    if (!this.checkRate(ws)) return;
    const normalised = this.normaliseEvent(payload);
    if (!normalised) {
      this.stats.rejected += 1;
      this.sendTo(ws, { kind: 'error', message: 'invalid event' });
      return;
    }
    this.enqueueEvent(ws, normalised);
  }

  private handleBatch(ws: WebSocket, events: IngestEventPayload[] | undefined): void {
    if (!Array.isArray(events)) {
      this.stats.rejected += 1;
      this.sendTo(ws, { kind: 'error', message: 'batch requires events array' });
      return;
    }
    for (const payload of events) {
      if (!this.checkTenantRate(ws)) return;
      if (!this.checkRate(ws)) return;
      const normalised = this.normaliseEvent(payload);
      if (!normalised) {
        this.stats.rejected += 1;
        continue;
      }
      this.enqueueEvent(ws, normalised);
    }
  }

  /**
   * Task 117.5 — hand the event to the queue. When the queue rejects
   * (backpressure), we tell the SDK so it can retry with backoff and
   * bump the stat so operators see the pressure in the dashboard.
   */
  private enqueueEvent(ws: WebSocket, event: EventRecord): void {
    const ack = this.queue.enqueue(event);
    if (!ack.queued) {
      this.stats.backpressured += 1;
      this.sendTo(ws, {
        kind: 'error',
        message: ack.reason === 'closed' ? 'ingest closed' : 'backpressure',
      });
    }
  }

  private handleSessionEnd(
    ws: WebSocket,
    sessionId: string | undefined,
    endedAt: number | undefined,
  ): void {
    if (typeof sessionId !== 'string') {
      this.stats.rejected += 1;
      this.sendTo(ws, { kind: 'error', message: 'session-end missing sessionId' });
      return;
    }
    this.store.endSession(sessionId, typeof endedAt === 'number' ? endedAt : this.now());
  }

  private normaliseEvent(payload: IngestEventPayload | undefined): EventRecord | null {
    if (!payload || typeof payload !== 'object') return null;
    if (typeof payload.type !== 'string' || payload.type.length === 0) return null;
    if (typeof payload.sessionId !== 'string' || payload.sessionId.length === 0) return null;

    const severity: Severity = VALID_SEVERITIES.includes(payload.severity as Severity)
      ? (payload.severity as Severity)
      : 'info';
    const body: Record<string, unknown> =
      payload.payload && typeof payload.payload === 'object'
        ? (payload.payload as Record<string, unknown>)
        : {};
    const timestamp = typeof payload.timestamp === 'number' ? payload.timestamp : this.now();
    const fingerprint =
      typeof payload.fingerprint === 'string' && payload.fingerprint.length > 0
        ? payload.fingerprint
        : payload.type === 'crash'
          ? computeFallbackFingerprint({ type: payload.type, severity, payload: body })
          : undefined;

    // Task 117.49 — id must be stable across retries so the store's
    // PK-based dedup can collapse them. Prefer the SDK-supplied id;
    // otherwise derive a content hash so replaying the same payload
    // yields the same row.
    const id =
      typeof payload.id === 'string' && payload.id.length > 0
        ? payload.id
        : deterministicEventId(payload.sessionId, payload.type, timestamp, body);
    const record: EventRecord = {
      id,
      type: payload.type,
      severity,
      sessionId: payload.sessionId,
      timestamp,
      receivedAt: this.now(),
      payload: body,
    };
    if (fingerprint !== undefined) record.fingerprint = fingerprint;
    if (payload.screen !== undefined) record.screen = payload.screen;
    if (payload.platform !== undefined) record.platform = payload.platform;
    if (payload.userId !== undefined) record.userId = payload.userId;
    return record;
  }

  private async persistAndBroadcast(event: EventRecord): Promise<void> {
    const { inserted } = this.store.insertEvent(event);
    if (!inserted) {
      // Task 117.49 — duplicate id. The original row already bumped the
      // session counter and fanned out to subscribers; re-doing any of
      // that would double-count the event. Just record that we deduped
      // and return — the ack path still completes so the SDK stops
      // retrying.
      this.stats.deduplicated += 1;
      return;
    }
    const isCrash = event.type === 'crash';
    this.store.bumpSessionCounters(event.sessionId, 1, isCrash ? 1 : 0);
    this.stats.ingested += 1;

    let group: CrashGroupRecord | null = null;
    if (isCrash && event.fingerprint) {
      this.stats.crashes += 1;
      group = this.upsertCrashGroup(event);
    }

    this.broadcast({ kind: 'event', event });
    if (group) {
      this.broadcast({ kind: 'crash-group-update', group });
    }

    // Task 117.99 — alert evaluator hook. Errors here are isolated from
    // ingest so a webhook timeout never wedges the queue.
    if (this.onEventPersisted) {
      try {
        await this.onEventPersisted(event);
      } catch (err) {
        this.onError(err instanceof Error ? err : new Error(String(err)), 'event-persisted-hook');
      }
    }
  }

  private upsertCrashGroup(event: EventRecord): CrashGroupRecord {
    const payload = event.payload as { message?: unknown };
    const message = typeof payload?.message === 'string' ? payload.message : event.type;
    const group: CrashGroupRecord = {
      fingerprint: event.fingerprint!,
      message,
      firstSeen: event.timestamp,
      lastSeen: event.timestamp,
      eventCount: 1,
      sessionCount: 1,
      status: 'new',
    };
    if (event.screen !== undefined) group.topScreen = event.screen;
    this.store.upsertCrashGroup(group);
    const [canonical] = this.store.listCrashGroups({ limit: 1, offset: 0, status: undefined });
    // Prefer the filtered-by-fingerprint read so the broadcast reflects aggregated counts.
    const byFp = this.store.raw
      .prepare('SELECT * FROM crash_groups WHERE fingerprint = ?')
      .get(event.fingerprint) as
      | {
          fingerprint: string;
          message: string;
          first_seen: number;
          last_seen: number;
          event_count: number;
          session_count: number;
          status: string;
          top_screen: string | null;
          ai_suggestion_json: string | null;
        }
      | undefined;
    if (byFp) {
      const result: CrashGroupRecord = {
        fingerprint: byFp.fingerprint,
        message: byFp.message,
        firstSeen: byFp.first_seen,
        lastSeen: byFp.last_seen,
        eventCount: byFp.event_count,
        sessionCount: byFp.session_count,
        status: byFp.status as CrashGroupRecord['status'],
      };
      if (byFp.top_screen !== null) result.topScreen = byFp.top_screen;
      if (byFp.ai_suggestion_json !== null) {
        result.aiSuggestion = JSON.parse(byFp.ai_suggestion_json) as Record<string, unknown>;
      }
      return result;
    }
    return canonical ?? group;
  }

  /**
   * Task 117.64 — per-tenant rate gate. Spends one token from the
   * connection's tenant bucket. Over-limit events are dropped with a
   * structured `rate-limited` error frame carrying a `retryAfterMs` hint
   * (a 429-equivalent for the WS transport) — the offending tenant's
   * bucket is the only state touched, so other tenants are unaffected and
   * the server never crashes. Returns true when the event may proceed.
   */
  private checkTenantRate(ws: WebSocket): boolean {
    if (!this.tenantLimiter) return true;
    const state = this.sdkState.get(ws);
    if (!state || state.tenantKey === undefined) return true;
    const decision = this.tenantLimiter.tryConsume(state.tenantKey, this.now());
    if (decision.allowed) return true;
    this.stats.rejected += 1;
    this.stats.tenantRateLimited += 1;
    this.sendTo(ws, {
      kind: 'error',
      message: 'tenant rate limit exceeded',
      reason: 'rate-limited',
      ...(decision.retryAfterMs !== undefined ? { retryAfterMs: decision.retryAfterMs } : {}),
    });
    return false;
  }

  private checkRate(ws: WebSocket): boolean {
    const state = this.sdkState.get(ws);
    if (!state) return true;
    const now = this.now();
    if (now - state.windowStart >= this.rateWindowMs) {
      state.windowStart = now;
      state.inWindow = 0;
    }
    state.inWindow += 1;
    if (state.inWindow > this.maxEventsPerWindow) {
      this.stats.rejected += 1;
      this.sendTo(ws, { kind: 'error', message: 'rate limit exceeded' });
      return false;
    }
    return true;
  }

  // ------------------------------ Dashboard side ------------------------------

  private onSubscribeConnection(ws: WebSocket): void {
    this.subscribers.add(ws);
    this.sendTo(ws, { kind: 'hello', serverTime: this.now() });
    ws.on('close', () => this.subscribers.delete(ws));
    ws.on('error', (err) => this.onError(err, 'subscribe-ws'));
  }

  private broadcast(msg: DashboardMessage): void {
    const text = JSON.stringify(msg);
    this.stats.broadcasts += 1;
    for (const ws of this.subscribers) {
      if (ws.readyState === 1 /* OPEN */) {
        ws.send(text);
      }
    }
  }

  private sendTo(ws: WebSocket, msg: DashboardMessage): void {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(JSON.stringify(msg));
    }
  }
}

/**
 * Task 117.62 — pull the SDK-presented ingest token off a WS upgrade
 * request. Mirrors `deriveTenantKey`'s precedence: `Authorization: Bearer`
 * (Node/CLI), then `?apiKey=` / `?ws_auth_token=` (browsers, which can't set
 * WS headers). Returns null when nothing is presented.
 */
function extractIngestToken(req: IncomingMessage, url: URL): string | null {
  const header = req.headers.authorization;
  if (typeof header === 'string') {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (match?.[1]) return match[1].trim();
  }
  const fromQuery = url.searchParams.get('apiKey') ?? url.searchParams.get('ws_auth_token');
  if (fromQuery && fromQuery.length > 0) return fromQuery;
  return null;
}

function rejectUpgrade(
  socket: { write: (data: string | Buffer) => boolean; destroy: () => void },
  status: number,
  statusText: string,
): void {
  const payload = JSON.stringify({ error: statusText });
  const reason = status === 401 ? 'Unauthorized' : statusText;
  socket.write(
    `HTTP/1.1 ${status} ${reason}\r\n` +
      'Content-Type: application/json; charset=utf-8\r\n' +
      `Content-Length: ${Buffer.byteLength(payload)}\r\n` +
      'Connection: close\r\n' +
      '\r\n' +
      payload,
  );
  socket.destroy();
}

function messageSize(raw: Buffer | ArrayBuffer | Buffer[]): number {
  if (Buffer.isBuffer(raw)) return raw.length;
  if (Array.isArray(raw)) return raw.reduce((acc, b) => acc + b.length, 0);
  return (raw as ArrayBuffer).byteLength;
}

function toText(raw: Buffer | ArrayBuffer | Buffer[]): string {
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  return Buffer.from(raw as ArrayBuffer).toString('utf8');
}

/**
 * Accept legacy `{type: 'monitor:hello' | 'monitor:event'}` frames from the
 * SDK's DashboardBridge (Phase 4 protocol) and return a translated
 * `{kind: ...}` envelope so the rest of the pipeline doesn't care which
 * version of the SDK connected. Returns null when the frame is already in
 * the new protocol (or cannot be interpreted).
 */
function translateLegacyFrame(raw: unknown, now: () => number): unknown | null {
  if (!raw || typeof raw !== 'object') return null;
  const frame = raw as { type?: unknown; clientId?: unknown; event?: unknown };
  if (typeof frame.type !== 'string') return null;

  if (frame.type === 'monitor:hello') {
    const clientId = typeof frame.clientId === 'string' ? frame.clientId : 'legacy-unknown';
    const device = (frame as { device?: Record<string, unknown> }).device ?? {};
    const session: Record<string, unknown> = {
      id: `sdk-${clientId}`,
      startedAt: now(),
    };
    if (typeof device.platform === 'string') session.platform = device.platform;
    if (typeof device.appVersion === 'string') session.appVersion = device.appVersion;
    if (typeof device.runtimeVersion === 'string') session.runtimeVersion = device.runtimeVersion;
    if (typeof device.channel === 'string') session.channel = device.channel;
    if (typeof device.userId === 'string') session.userId = device.userId;
    const modelBits: Record<string, string> = {};
    if (typeof device.model === 'string') modelBits.model = device.model;
    if (typeof device.systemVersion === 'string') modelBits.systemVersion = device.systemVersion;
    else if (typeof device.osVersion === 'string') modelBits.osVersion = device.osVersion;
    if (Object.keys(modelBits).length > 0) session.device = modelBits;
    if (!session.appVersion) session.appVersion = 'unknown';
    return { kind: 'hello', session };
  }

  if (frame.type === 'monitor:event') {
    const ev = frame.event as
      | {
          type?: string;
          sessionId?: string;
          timestamp?: number;
          wallTime?: number;
          [key: string]: unknown;
        }
      | undefined;
    if (!ev || typeof ev.type !== 'string') return null;
    const clientId = typeof frame.clientId === 'string' ? frame.clientId : 'legacy-unknown';
    // Pin every event to the clientId-derived session regardless of the
    // internal sessionId the SDK's session manager uses. The legacy
    // `monitor:hello` carries only clientId, so this is the only way the
    // event can be attributed back to the session record we upserted on
    // hello — otherwise events pile up against orphan SDK-UUIDs and the
    // Device Switcher / panels show empty.
    const sessionId = `sdk-${clientId}`;
    // Retain the SDK's original sessionId inside payload for debugging.
    const originalSessionId = typeof ev.sessionId === 'string' ? ev.sessionId : undefined;
    const timestamp = typeof ev.timestamp === 'number' ? ev.timestamp : now();
    // Strip envelope fields from the payload — they've already been promoted
    // to top-level SdkMessage keys above. The remaining keys are the actual
    // event-specific payload.
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(ev)) {
      if (key === 'type' || key === 'sessionId' || key === 'timestamp' || key === 'wallTime') {
        continue;
      }
      payload[key] = value;
    }
    const { type } = ev;
    if (originalSessionId) payload.__sdkSessionId = originalSessionId;

    // Legacy type → server event-type mapping. Kept deliberately narrow —
    // the schema codegen already documents every SDK event kind and we
    // only forward the ones the dashboard panels render.
    const normalisedType =
      type === 'crash'
        ? 'crash'
        : type === 'network'
          ? 'network'
          : type === 'navigation'
            ? 'breadcrumb'
            : type === 'render'
              ? 'performance'
              : type === 'custom'
                ? 'custom'
                : type;

    const severity: 'critical' | 'warning' | 'info' =
      normalisedType === 'crash'
        ? 'critical'
        : type === 'network' && typeof payload.statusCode === 'number' && payload.statusCode >= 500
          ? 'warning'
          : 'info';

    // Task 117.49 — deterministic id so the ingest dedup guard can
    // collapse retries. The random-suffix id used here before made
    // dedup impossible for the legacy protocol.
    const finalPayload =
      normalisedType === 'breadcrumb' ? { category: 'nav', ...payload } : payload;
    return {
      kind: 'event',
      event: {
        id: deterministicEventId(sessionId, normalisedType, timestamp, finalPayload),
        type: normalisedType,
        severity,
        sessionId,
        timestamp,
        payload: finalPayload,
      },
    };
  }

  return null;
}

/**
 * Task 117.49 — derive a stable id from the event's content so two
 * identical payloads (e.g., a client retry after the WS dropped) hash
 * to the same id and collide on the events.id PK. Hash prefix is
 * 16 hex chars — 2^64 address space is comfortably collision-free for
 * a single tenant's event stream.
 */
function deterministicEventId(
  sessionId: string,
  type: string,
  timestamp: number,
  payload: unknown,
): string {
  const hash = createHash('sha1');
  hash.update(`${sessionId}|${type}|${timestamp}|${JSON.stringify(payload ?? null)}`);
  return `ev_${hash.digest('hex').slice(0, 16)}`;
}
