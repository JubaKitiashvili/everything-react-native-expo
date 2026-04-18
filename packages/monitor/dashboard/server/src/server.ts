import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DashboardStore, defaultDashboardDbPath } from './storage/sqliteStore.js';
import { seedDemoData } from './demo/seed.js';
import { parseProGuardMapping, resolveFrame } from './symbolication/resolver.js';
import type {
  EventListFilter,
  SymbolFileRecord,
  SymbolPlatform,
  SymbolResolveInput,
} from './storage/types.js';
import { IngestWebSocketHandler } from './ingest/wsHandler.js';
import type { IngestWsHandlerOptions } from './ingest/wsHandler.js';

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
}

export interface DashboardServerHandle {
  server: Server;
  store: DashboardStore;
  port: number;
  host: string;
  websocket: IngestWebSocketHandler | null;
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

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function sendStatic(res: ServerResponse, filePath: string): void {
  const ext = extname(filePath).toLowerCase();
  const mime = MIME[ext] ?? 'application/octet-stream';
  const size = statSync(filePath).size;
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
  const store =
    options.store ?? new DashboardStore({ dbPath: options.dbPath ?? defaultDashboardDbPath() });

  const websocket =
    options.enableWebsocket === false
      ? null
      : new IngestWebSocketHandler({ store, ...(options.websocket ?? {}) });

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

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? host}`);
    const pathname = requestUrl.pathname;

    try {
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
        const groups = store.listCrashGroups();
        sendJson(res, 200, { groups });
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
        const deleted = store.deleteAlertRule(id);
        if (!deleted) {
          sendJson(res, 404, { error: 'not_found', id });
          return;
        }
        sendJson(res, 200, { ok: true });
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
          sendStatic(res, filePath);
          return;
        }
        const indexFile = join(publicDir, 'index.html');
        if (existsSync(indexFile)) {
          sendStatic(res, indexFile);
          return;
        }
      }

      sendJson(res, 404, { error: 'not_found', path: pathname });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
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
    url: `http://${host}:${port}`,
    close: () =>
      new Promise<void>((resolveClose) => {
        websocket?.close();
        server.close(() => {
          store.close();
          resolveClose();
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
