import { WebSocketServer, type WebSocket } from 'ws';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { DashboardStore } from '../storage/sqliteStore.js';
import type { EventRecord, SessionRecord, Severity, CrashGroupRecord } from '../storage/types.js';
import { computeFallbackFingerprint } from './fingerprint.js';

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
  /** Max bytes per incoming WS message. Default 256 KB. */
  maxMessageBytes?: number;
  /** Logger hook; defaults to console on server-side errors only. */
  onError?: (err: Error, context: string) => void;
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
  | { kind: 'error'; message: string };

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
}

interface SdkConnectionState {
  sessionId?: string;
  windowStart: number;
  inWindow: number;
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

  readonly stats: IngestStats = { ingested: 0, rejected: 0, crashes: 0, broadcasts: 0 };

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
    this.wss = new WebSocketServer({ noServer: true });
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
        this.wss.handleUpgrade(req, socket, head, (ws) => this.onIngestConnection(ws));
        return;
      }
      if (url.pathname === SUBSCRIBE_PATH) {
        this.wss.handleUpgrade(req, socket, head, (ws) => this.onSubscribeConnection(ws));
        return;
      }
      socket.destroy();
    });
  }

  close(): void {
    for (const ws of this.subscribers) ws.close();
    this.subscribers.clear();
    this.wss.close();
  }

  /** Number of currently-connected dashboard subscribers. */
  get subscriberCount(): number {
    return this.subscribers.size;
  }

  // ------------------------------ SDK side ------------------------------

  private onIngestConnection(ws: WebSocket): void {
    this.sdkState.set(ws, { windowStart: this.now(), inWindow: 0 });

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
    if (!this.checkRate(ws)) return;
    const normalised = this.normaliseEvent(payload);
    if (!normalised) {
      this.stats.rejected += 1;
      this.sendTo(ws, { kind: 'error', message: 'invalid event' });
      return;
    }
    this.persistAndBroadcast(normalised);
  }

  private handleBatch(ws: WebSocket, events: IngestEventPayload[] | undefined): void {
    if (!Array.isArray(events)) {
      this.stats.rejected += 1;
      this.sendTo(ws, { kind: 'error', message: 'batch requires events array' });
      return;
    }
    for (const payload of events) {
      if (!this.checkRate(ws)) return;
      const normalised = this.normaliseEvent(payload);
      if (!normalised) {
        this.stats.rejected += 1;
        continue;
      }
      this.persistAndBroadcast(normalised);
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

    const record: EventRecord = {
      id: payload.id ?? randomUUID(),
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

  private persistAndBroadcast(event: EventRecord): void {
    this.store.insertEvent(event);
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

    return {
      kind: 'event',
      event: {
        id: `${sessionId}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
        type: normalisedType,
        severity,
        sessionId,
        timestamp,
        payload: normalisedType === 'breadcrumb' ? { category: 'nav', ...payload } : payload,
      },
    };
  }

  return null;
}
