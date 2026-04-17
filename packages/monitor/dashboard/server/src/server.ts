import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DashboardStore, defaultDashboardDbPath } from './storage/sqliteStore.js';
import type { EventListFilter } from './storage/types.js';

export interface DashboardServerOptions {
  port?: number;
  host?: string;
  publicDir?: string;
  store?: DashboardStore;
  dbPath?: string;
}

export interface DashboardServerHandle {
  server: Server;
  store: DashboardStore;
  port: number;
  host: string;
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

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? host}`);
    const pathname = requestUrl.pathname;

    try {
      if (req.method === 'GET' && pathname === '/api/health') {
        sendJson(res, 200, { ...store.selfCheck(), uptimeSeconds: process.uptime() });
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

      if (req.method === 'GET' && pathname === '/api/bug-reports') {
        const reports = store.listBugReports();
        sendJson(res, 200, { reports });
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

  return {
    server,
    store,
    host,
    port,
    url: `http://${host}:${port}`,
    close: () =>
      new Promise<void>((resolveClose) => {
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
