import type { CrashGroupRecord, EventRecord } from '../api/types';

export type RealtimeFrame =
  | { kind: 'hello'; serverTime: number }
  | { kind: 'event'; event: EventRecord }
  | { kind: 'crash-group-update'; group: CrashGroupRecord }
  | { kind: 'error'; message: string };

export type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface RealtimeClientOptions {
  /** Full `ws://…/ws/subscribe` URL, or a fn that returns it. */
  url: string | (() => string);
  /** Frame handler. Bad frames are silently dropped. */
  onFrame: (frame: RealtimeFrame) => void;
  /** Status-change handler (idle → connecting → open → closed/error → connecting …). */
  onStatus?: (status: RealtimeStatus, error?: string) => void;
  /** Custom WebSocket ctor — defaults to global `WebSocket` for jsdom/browser. */
  webSocketImpl?: typeof WebSocket;
  /** Initial backoff in ms (doubles up to `maxBackoffMs`). */
  initialBackoffMs?: number;
  /** Max backoff between retries. */
  maxBackoffMs?: number;
  /** Abort automatic reconnect after this many attempts. */
  maxRetries?: number;
  /** Scheduler for tests. Defaults to global `setTimeout`. */
  scheduleReconnect?: (fn: () => void, delayMs: number) => number;
  clearScheduled?: (handle: number) => void;
}

interface RealtimeClientInternals {
  ws: WebSocket | null;
  attempts: number;
  nextBackoff: number;
  stopped: boolean;
  pendingHandle: number | null;
}

/**
 * Thin wrapper around the browser WebSocket API:
 * - Opens the socket, parses every incoming text frame as JSON.
 * - Calls `onFrame` for every recognised frame kind.
 * - Reconnects with exponential backoff + jitter when the socket closes
 *   unexpectedly. Stops retrying after `maxRetries` or an explicit stop().
 * - Surfaces transitions via `onStatus` so the store + header pill stay
 *   in sync without polling.
 *
 * The handler is deliberately framework-agnostic. React wiring lives in
 * `useRealtime.ts`; the imperative class here is unit-testable with a
 * mock WebSocket impl.
 */
export class RealtimeClient {
  private readonly options: RealtimeClientOptions;
  private readonly Ctor: typeof WebSocket;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly maxRetries: number;
  private readonly schedule: (fn: () => void, delayMs: number) => number;
  private readonly clear: (handle: number) => void;

  private state: RealtimeClientInternals = {
    ws: null,
    attempts: 0,
    nextBackoff: 500,
    stopped: false,
    pendingHandle: null,
  };

  constructor(options: RealtimeClientOptions) {
    this.options = options;
    const ctor =
      options.webSocketImpl ??
      (typeof WebSocket !== 'undefined' ? (WebSocket as typeof WebSocket) : undefined);
    if (!ctor) {
      throw new Error(
        '[@erne/monitor] RealtimeClient requires a WebSocket implementation ' +
          '(browser/jsdom provides one by default; tests can pass `webSocketImpl`).',
      );
    }
    this.Ctor = ctor;
    this.initialBackoffMs = options.initialBackoffMs ?? 500;
    this.maxBackoffMs = options.maxBackoffMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? Infinity;
    this.schedule =
      options.scheduleReconnect ?? ((fn, delay) => setTimeout(fn, delay) as unknown as number);
    this.clear =
      options.clearScheduled ?? ((handle) => clearTimeout(handle as unknown as NodeJS.Timeout));
    this.state.nextBackoff = this.initialBackoffMs;
  }

  /** Open the WebSocket now and keep it open across transient failures. */
  start(): void {
    if (this.state.stopped) this.state.stopped = false;
    this.connect();
  }

  /** Permanently close the socket and cancel any pending reconnect. */
  stop(): void {
    this.state.stopped = true;
    if (this.state.pendingHandle !== null) {
      this.clear(this.state.pendingHandle);
      this.state.pendingHandle = null;
    }
    this.setStatus('closed');
    const ws = this.state.ws;
    this.state.ws = null;
    if (ws) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  }

  /** Number of reconnect attempts so far (reset to 0 on each successful open). */
  get attempts(): number {
    return this.state.attempts;
  }

  private connect(): void {
    const url = typeof this.options.url === 'string' ? this.options.url : this.options.url();
    this.setStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new this.Ctor(url);
    } catch (err) {
      this.setStatus('error', (err as Error).message);
      this.scheduleReconnect();
      return;
    }

    ws.addEventListener('open', () => {
      this.state.attempts = 0;
      this.state.nextBackoff = this.initialBackoffMs;
      this.setStatus('open');
    });

    ws.addEventListener('message', (event: MessageEvent) => {
      const data = typeof event.data === 'string' ? event.data : String(event.data);
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        return; // drop silently, SDKs shouldn't send garbage
      }
      const frame = parsed as RealtimeFrame;
      if (!frame || typeof frame.kind !== 'string') return;
      this.options.onFrame(frame);
    });

    ws.addEventListener('close', () => {
      this.state.ws = null;
      if (this.state.stopped) return;
      this.setStatus('closed');
      this.scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      this.setStatus('error', 'socket error');
      // 'close' follows — reconnect scheduling happens there
    });

    this.state.ws = ws;
  }

  private scheduleReconnect(): void {
    if (this.state.stopped) return;
    this.state.attempts += 1;
    if (this.state.attempts > this.maxRetries) return;
    const jitter = Math.random() * 0.3 * this.state.nextBackoff;
    const delay = Math.min(this.state.nextBackoff + jitter, this.maxBackoffMs);
    this.state.nextBackoff = Math.min(this.state.nextBackoff * 2, this.maxBackoffMs);
    this.state.pendingHandle = this.schedule(() => {
      this.state.pendingHandle = null;
      this.connect();
    }, delay);
  }

  private setStatus(status: RealtimeStatus, error?: string): void {
    this.options.onStatus?.(status, error);
  }
}
