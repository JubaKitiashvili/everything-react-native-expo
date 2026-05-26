// `npx @erne/monitor monitor live` — connect to the dashboard's
// `/ws/subscribe` socket and stream events to the terminal, compact and
// color-coded by severity.
//
// Two independently-testable pieces:
//   - `formatLiveEvent(event)` — a PURE function that turns a broadcast frame
//     into a single colored terminal line. No I/O.
//   - `LiveStreamController` — a tiny lifecycle state machine driving any
//     socket that satisfies the `LiveSocket` shape. Tests drive it with a fake
//     socket; production wires the global `WebSocket`. The controller owns
//     connecting / streaming / reconnect-with-backoff / closed transitions so
//     none of that logic depends on a real server.

// ---------------------------------------------------------------------------
// Event model — mirrors the dashboard's broadcast frames (DashboardMessage)
// and EventRecord. We keep our own narrow copies so the CLI does not depend
// on the dashboard package at build time.

export type LiveSeverity = 'critical' | 'warning' | 'info' | 'success' | 'muted';

export interface LiveEventRecord {
  id?: string;
  type: string;
  severity?: LiveSeverity | string;
  sessionId?: string;
  timestamp?: number;
  screen?: string;
  platform?: string;
  payload?: Record<string, unknown>;
}

export type LiveFrame =
  | { kind: 'hello'; serverTime: number }
  | { kind: 'event'; event: LiveEventRecord }
  | { kind: 'crash-group-update'; group: { fingerprint?: string; message?: string } }
  | { kind: 'error'; message: string };

// ---------------------------------------------------------------------------
// ANSI color — minimal, no dependency. Disabled when not a TTY / NO_COLOR.

const ANSI = {
  reset: '[0m',
  dim: '[2m',
  red: '[31m',
  yellow: '[33m',
  cyan: '[36m',
  green: '[32m',
  gray: '[90m',
} as const;

const SEVERITY_COLOR: Record<LiveSeverity, keyof typeof ANSI> = {
  critical: 'red',
  warning: 'yellow',
  info: 'cyan',
  success: 'green',
  muted: 'gray',
};

const SEVERITY_TAG: Record<LiveSeverity, string> = {
  critical: 'CRIT',
  warning: 'WARN',
  info: 'INFO',
  success: ' OK ',
  muted: 'MUTE',
};

function isSeverity(value: string): value is LiveSeverity {
  return (
    value === 'critical' ||
    value === 'warning' ||
    value === 'info' ||
    value === 'success' ||
    value === 'muted'
  );
}

export interface FormatOptions {
  /** Apply ANSI color codes. Defaults to false for deterministic tests. */
  color?: boolean;
}

function paint(text: string, color: keyof typeof ANSI, enabled: boolean): string {
  if (!enabled) return text;
  return `${ANSI[color]}${text}${ANSI.reset}`;
}

function formatClock(timestamp: number | undefined): string {
  if (timestamp === undefined || !Number.isFinite(timestamp)) return '--:--:--';
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/**
 * Pure renderer: one broadcast frame → one compact terminal line.
 * Color is opt-in so tests assert on plain text.
 */
export function formatLiveEvent(frame: LiveFrame, options: FormatOptions = {}): string {
  const color = options.color ?? false;

  if (frame.kind === 'hello') {
    return paint(`[connected] server time ${formatClock(frame.serverTime)}`, 'dim', color);
  }

  if (frame.kind === 'error') {
    return paint(`[server-error] ${frame.message}`, 'red', color);
  }

  if (frame.kind === 'crash-group-update') {
    const fp = frame.group.fingerprint ? frame.group.fingerprint.slice(0, 8) : 'unknown';
    const msg = frame.group.message ?? '(no message)';
    return paint(`[crash-group ${fp}] ${msg}`, 'red', color);
  }

  // kind === 'event'
  const ev = frame.event;
  const sev: LiveSeverity =
    typeof ev.severity === 'string' && isSeverity(ev.severity) ? ev.severity : 'info';
  const tag = SEVERITY_TAG[sev];
  const clock = formatClock(ev.timestamp);
  const screen = ev.screen ? ` @${ev.screen}` : '';
  const platform = ev.platform ? ` (${ev.platform})` : '';
  const summary = summarizePayload(ev);

  const line = `${clock} ${tag} ${ev.type}${screen}${platform}${summary ? ` — ${summary}` : ''}`;
  return paint(line, SEVERITY_COLOR[sev], color);
}

/** Best-effort one-liner from common payload fields (message/name/status). */
function summarizePayload(ev: LiveEventRecord): string {
  const p = ev.payload;
  if (!p) return '';
  const candidates = ['message', 'name', 'url', 'status', 'reason'];
  for (const key of candidates) {
    const v = p[key];
    if (typeof v === 'string' && v.length > 0) return v;
    if (typeof v === 'number') return String(v);
  }
  return '';
}

/** Parses a raw socket message into a LiveFrame, or null when invalid. */
export function parseLiveFrame(raw: string): LiveFrame | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const o = obj as Record<string, unknown>;
  switch (o.kind) {
    case 'hello':
      return { kind: 'hello', serverTime: Number(o.serverTime) || 0 };
    case 'event':
      if (typeof o.event === 'object' && o.event !== null) {
        const e = o.event as Record<string, unknown>;
        if (typeof e.type === 'string') {
          return { kind: 'event', event: e as unknown as LiveEventRecord };
        }
      }
      return null;
    case 'crash-group-update':
      if (typeof o.group === 'object' && o.group !== null) {
        return {
          kind: 'crash-group-update',
          group: o.group as { fingerprint?: string; message?: string },
        };
      }
      return null;
    case 'error':
      return { kind: 'error', message: typeof o.message === 'string' ? o.message : 'unknown' };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Connection lifecycle state machine

export type LiveConnectionState =
  | 'idle'
  | 'connecting'
  | 'streaming'
  | 'reconnecting'
  | 'closed';

/** Minimal socket surface the controller depends on (global WebSocket fits). */
export interface LiveSocket {
  onopen: ((this: unknown, ev: unknown) => void) | null;
  onmessage: ((this: unknown, ev: { data: unknown }) => void) | null;
  onerror: ((this: unknown, ev: unknown) => void) | null;
  onclose: ((this: unknown, ev: unknown) => void) | null;
  close(): void;
}

export type SocketFactory = (url: string) => LiveSocket;

export interface LiveControllerDeps {
  /** Builds a socket for a given subscribe URL. */
  socketFactory: SocketFactory;
  /** Emits a fully-rendered line to the terminal. */
  onLine: (line: string) => void;
  /** Color toggle, threaded into the formatter. */
  color?: boolean;
  /** Max reconnect attempts before giving up. Default 5. */
  maxReconnects?: number;
  /** Schedules a delayed reconnect — injectable for tests (default setTimeout). */
  schedule?: (fn: () => void, ms: number) => void;
}

/**
 * Drives a single live subscription. The controller is transport-agnostic:
 * everything it touches (the socket, the clock, the sink) is injected, so the
 * whole connect → stream → drop → reconnect → exhaust lifecycle is tested with
 * a synchronous fake socket and no real server.
 */
export class LiveStreamController {
  private socket: LiveSocket | null = null;
  private _state: LiveConnectionState = 'idle';
  private reconnects = 0;
  private stopped = false;
  private url = '';

  private readonly factory: SocketFactory;
  private readonly onLine: (line: string) => void;
  private readonly color: boolean;
  private readonly maxReconnects: number;
  private readonly schedule: (fn: () => void, ms: number) => void;

  constructor(deps: LiveControllerDeps) {
    this.factory = deps.socketFactory;
    this.onLine = deps.onLine;
    this.color = deps.color ?? false;
    this.maxReconnects = deps.maxReconnects ?? 5;
    this.schedule = deps.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  }

  get state(): LiveConnectionState {
    return this._state;
  }

  get reconnectAttempts(): number {
    return this.reconnects;
  }

  /** Opens the subscription to the given `/ws/subscribe` URL. */
  connect(url: string): void {
    this.url = url;
    this.stopped = false;
    this.open();
  }

  private open(): void {
    this._state = this.reconnects === 0 ? 'connecting' : 'reconnecting';
    const socket = this.factory(this.url);
    this.socket = socket;

    socket.onopen = () => {
      this._state = 'streaming';
      this.reconnects = 0;
      this.onLine(paint('listening for live events...', 'dim', this.color));
    };

    socket.onmessage = (ev) => {
      const data = typeof ev.data === 'string' ? ev.data : String(ev.data);
      const frame = parseLiveFrame(data);
      if (frame) this.onLine(formatLiveEvent(frame, { color: this.color }));
    };

    socket.onerror = () => {
      // Errors precede close; the close handler owns reconnect logic.
    };

    socket.onclose = () => {
      this.socket = null;
      if (this.stopped) {
        this._state = 'closed';
        return;
      }
      if (this.reconnects >= this.maxReconnects) {
        this._state = 'closed';
        this.onLine(
          `connection lost — gave up after ${this.maxReconnects} reconnect attempts.`,
        );
        return;
      }
      this.reconnects += 1;
      this._state = 'reconnecting';
      const delayMs = backoffDelay(this.reconnects);
      this.onLine(
        `connection lost — reconnecting (attempt ${this.reconnects}/${this.maxReconnects}) in ${delayMs}ms…`,
      );
      this.schedule(() => {
        if (!this.stopped) this.open();
      }, delayMs);
    };
  }

  /** Cleanly tears down the subscription (e.g. on Ctrl-C). */
  stop(): void {
    this.stopped = true;
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this._state = 'closed';
  }
}

/** Exponential backoff capped at 10s: 500, 1000, 2000, 4000, 8000, 10000…. */
export function backoffDelay(attempt: number): number {
  const base = 500 * 2 ** (attempt - 1);
  return Math.min(base, 10_000);
}

// ---------------------------------------------------------------------------
// URL helpers

/**
 * Derives the `/ws/subscribe` WebSocket URL from a dashboard http(s) base URL.
 * Appends `?apiKey=` only when a key is supplied (Task 117.101 gating).
 */
export function subscribeUrl(dashboardUrl: string, apiKey?: string): string {
  let base = dashboardUrl.trim();
  if (base.startsWith('https://')) base = 'wss://' + base.slice('https://'.length);
  else if (base.startsWith('http://')) base = 'ws://' + base.slice('http://'.length);
  else if (!base.startsWith('ws://') && !base.startsWith('wss://')) base = 'ws://' + base;
  base = base.replace(/\/+$/, '');
  const path = `${base}/ws/subscribe`;
  return apiKey ? `${path}?apiKey=${encodeURIComponent(apiKey)}` : path;
}

// ---------------------------------------------------------------------------
// CLI shell

export interface ParsedLiveArgs {
  url: string;
  apiKey: string | null;
  color: boolean;
  help: boolean;
}

const DEFAULT_DASHBOARD_URL = 'http://127.0.0.1:3333';

export function parseLiveArgs(argv: readonly string[]): ParsedLiveArgs {
  let url = DEFAULT_DASHBOARD_URL;
  let apiKey: string | null = null;
  let color = true;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token) continue;
    if (token === '--help' || token === '-h') {
      help = true;
      continue;
    }
    if (token === '--no-color') {
      color = false;
      continue;
    }
    if (token === '--url') {
      const next = argv[i + 1];
      if (!next) throw new Error('--url expects a value');
      url = next;
      i += 1;
      continue;
    }
    if (token.startsWith('--url=')) {
      url = token.slice('--url='.length);
      continue;
    }
    if (token === '--api-key') {
      const next = argv[i + 1];
      if (!next) throw new Error('--api-key expects a value');
      apiKey = next;
      i += 1;
      continue;
    }
    if (token.startsWith('--api-key=')) {
      apiKey = token.slice('--api-key='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return { url, apiKey, color, help };
}

export function renderLiveHelp(): string {
  return [
    'Usage: npx @erne/monitor monitor live [flags]',
    '',
    'Streams live events from a running dashboard to your terminal,',
    'compact and color-coded by severity. Reconnects automatically on drop.',
    '',
    'Flags:',
    '  --url <url>        Dashboard base URL (default: http://127.0.0.1:3333)',
    '  --api-key <key>    API key for a guarded /ws/subscribe endpoint',
    '  --no-color         Disable ANSI colors',
    '  -h, --help         Show this message',
    '',
    'Press Ctrl-C to stop.',
  ].join('\n');
}

export interface LiveCliDeps {
  logger?: { info: (msg: string) => void; error: (msg: string) => void };
  socketFactory?: SocketFactory;
  /** Resolves when the CLI should shut down (default wires SIGINT/SIGTERM). */
  waitForExit?: () => Promise<void>;
}

/**
 * Live command entry. Returns the exit code Node should use. Connects, streams
 * until SIGINT, then tears down. Arg-parse errors return 1.
 */
export async function runLiveCommand(
  argv: readonly string[],
  deps: LiveCliDeps = {},
): Promise<number> {
  const logger = deps.logger ?? {
    info: (msg: string) => console.log(msg),
    error: (msg: string) => console.error(msg),
  };

  let parsed: ParsedLiveArgs;
  try {
    parsed = parseLiveArgs(argv);
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
    logger.error(renderLiveHelp());
    return 1;
  }

  if (parsed.help) {
    logger.info(renderLiveHelp());
    return 0;
  }

  const factory = deps.socketFactory ?? defaultSocketFactory;
  const waitForExit = deps.waitForExit ?? defaultWaitForExit;

  const wsUrl = subscribeUrl(parsed.url, parsed.apiKey ?? undefined);
  logger.info(`[@erne/monitor] connecting to ${wsUrl}`);
  logger.info('[@erne/monitor] press Ctrl-C to stop');

  const controller = new LiveStreamController({
    socketFactory: factory,
    onLine: (line) => logger.info(line),
    color: parsed.color,
  });
  controller.connect(wsUrl);

  await waitForExit();
  controller.stop();
  return 0;
}

// ---------------------------------------------------------------------------
// Default wiring — only used outside tests.

function defaultSocketFactory(url: string): LiveSocket {
  // Node 20+ ships a global WebSocket; cast to our minimal shape.
  const Ctor = (globalThis as { WebSocket?: new (u: string) => unknown }).WebSocket;
  if (!Ctor) {
    throw new Error(
      'global WebSocket is unavailable — upgrade to Node 20+ or run the dashboard in a newer runtime.',
    );
  }
  return new Ctor(url) as unknown as LiveSocket;
}

function defaultWaitForExit(): Promise<void> {
  return new Promise<void>((resolve) => {
    const once = (): void => {
      process.off('SIGINT', once);
      process.off('SIGTERM', once);
      resolve();
    };
    process.once('SIGINT', once);
    process.once('SIGTERM', once);
  });
}
