import type { MonitorEvent } from '../types';
import type { SignalBus } from '../core/SignalBus';

/**
 * Minimum surface of the global WebSocket constructor. Declared locally so
 * the bridge compiles under both browser and React Native type lib sets.
 */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

export type WebSocketCtor = new (url: string) => WebSocketLike;

export interface DashboardBridgeOptions {
  signalBus: SignalBus;
  /** ws:// or wss:// URL of the ERNE dashboard runtime endpoint. */
  url: string;
  /**
   * When true, the bridge is active only in dev. The dashboard is a dev
   * tool; production apps should ship with the bridge disabled.
   */
  isDev: boolean;
  /** WebSocket constructor. Defaults to globalThis.WebSocket. */
  WebSocket?: WebSocketCtor | null;
  /** Initial reconnect delay in ms. Backs off exponentially. Default 1000. */
  reconnectDelayMs?: number;
  /** Hard cap on reconnect backoff. Default 30_000. */
  maxReconnectDelayMs?: number;
  /** How many events to buffer while offline. Default 500. */
  bufferSize?: number;
  /** Optional tag that lets the dashboard group multiple client sessions. */
  clientId?: string;
  /** Clock for tests. Defaults to Date.now. */
  now?: () => number;
  /**
   * Device + app-version metadata included in the initial `monitor:hello`
   * frame. Lets the dashboard's Device Switcher / Sessions panels render
   * a real card instead of an anonymous "unknown" entry. All fields are
   * optional — the bridge falls back to undefined so dashboards on older
   * servers ignore them.
   */
  deviceInfo?: {
    platform?: 'ios' | 'android' | 'web';
    model?: string;
    systemVersion?: string;
    osVersion?: string;
    appVersion?: string;
    runtimeVersion?: string;
    channel?: string;
    userId?: string;
  };
}

const READY_OPEN = 1;

interface QueuedMessage {
  kind: 'event' | 'hello';
  data: unknown;
}

/**
 * DashboardBridge streams SignalBus events to the ERNE dashboard over a
 * WebSocket connection. It is a pure observer — every message is a
 * fire-and-forget JSON payload, and the connection transparently
 * reconnects with exponential backoff when the server goes away.
 *
 * Flow:
 *   - start(): subscribe to SignalBus, open WebSocket
 *   - on 'open': drain any queued events then keep sending in real time
 *   - on 'close'/'error': buffer new events up to `bufferSize`, reconnect
 *   - stop(): unsubscribe and close the socket
 *
 * Messages sent upstream:
 *   { type: 'monitor:hello', clientId, ts }               — on connect
 *   { type: 'monitor:event', clientId, event: MonitorEvent }
 */
export class DashboardBridge {
  private readonly bus: SignalBus;
  private readonly url: string;
  private readonly isDev: boolean;
  private readonly Ctor: WebSocketCtor | null;
  private readonly baseDelay: number;
  private readonly maxDelay: number;
  private readonly bufferSize: number;
  private readonly clientId: string;
  private readonly now: () => number;
  private readonly deviceInfo: DashboardBridgeOptions['deviceInfo'];

  private ws: WebSocketLike | null = null;
  private running = false;
  private reconnecting = false;
  private currentDelay: number;
  private buffer: QueuedMessage[] = [];
  private unsubscribe: (() => void) | null = null;
  private reconnectHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(options: DashboardBridgeOptions) {
    this.bus = options.signalBus;
    this.url = options.url;
    this.isDev = options.isDev;
    const defaultCtor =
      typeof (globalThis as { WebSocket?: WebSocketCtor }).WebSocket ===
      'function'
        ? ((globalThis as { WebSocket: WebSocketCtor }).WebSocket)
        : null;
    this.Ctor =
      options.WebSocket !== undefined ? options.WebSocket : defaultCtor;
    this.baseDelay = options.reconnectDelayMs ?? 1000;
    this.maxDelay = options.maxReconnectDelayMs ?? 30_000;
    this.currentDelay = this.baseDelay;
    this.bufferSize = options.bufferSize ?? 500;
    this.clientId =
      options.clientId ??
      `monitor-${Math.random().toString(36).slice(2, 10)}`;
    this.now = options.now ?? Date.now;
    this.deviceInfo = options.deviceInfo;
  }

  start(): void {
    if (!this.isDev) return;
    if (this.running) return;
    if (!this.Ctor) return; // no WebSocket in this environment — silent no-op
    this.running = true;
    this.unsubscribe = this.bus.onAll((event) => this.handleEvent(event));
    this.connect();
  }

  stop(): void {
    this.running = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.reconnectHandle !== null) {
      clearTimeout(this.reconnectHandle);
      this.reconnectHandle = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.buffer = [];
  }

  isConnected(): boolean {
    return !!this.ws && this.ws.readyState === READY_OPEN;
  }

  /** Test hook: number of buffered events waiting for reconnect. */
  bufferedCount(): number {
    return this.buffer.length;
  }

  private handleEvent(event: MonitorEvent): void {
    const payload: QueuedMessage = {
      kind: 'event',
      data: {
        type: 'monitor:event',
        clientId: this.clientId,
        event,
      },
    };
    this.enqueueOrSend(payload);
  }

  private enqueueOrSend(msg: QueuedMessage): void {
    if (this.isConnected()) {
      this.send(msg);
      return;
    }
    if (this.buffer.length >= this.bufferSize) {
      // Drop oldest non-hello entries first to preserve the hello payload
      // so late subscribers still see a client identifier when we reconnect.
      const idx = this.buffer.findIndex((m) => m.kind === 'event');
      if (idx !== -1) {
        this.buffer.splice(idx, 1);
      } else {
        this.buffer.shift();
      }
    }
    this.buffer.push(msg);
  }

  private send(msg: QueuedMessage): void {
    try {
      this.ws?.send(JSON.stringify(msg.data));
    } catch {
      // Move back to buffer so we retry on reconnect.
      this.buffer.unshift(msg);
    }
  }

  private connect(): void {
    if (!this.running || !this.Ctor) return;
    try {
      const ws = new this.Ctor(this.url);
      this.ws = ws;
      ws.onopen = () => {
        this.currentDelay = this.baseDelay;
        // Send the hello first, then drain buffered events.
        this.send({
          kind: 'hello',
          data: {
            type: 'monitor:hello',
            clientId: this.clientId,
            ts: this.now(),
            ...(this.deviceInfo ? { device: this.deviceInfo } : {}),
          },
        });
        const drained = this.buffer;
        this.buffer = [];
        for (const msg of drained) this.send(msg);
      };
      ws.onerror = () => {
        // onclose will follow — let it handle reconnect scheduling.
      };
      ws.onclose = () => {
        this.ws = null;
        if (this.running) this.scheduleReconnect();
      };
      ws.onmessage = null;
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnecting || !this.running) return;
    this.reconnecting = true;
    const delay = this.currentDelay;
    this.currentDelay = Math.min(this.currentDelay * 2, this.maxDelay);
    this.reconnectHandle = setTimeout(() => {
      this.reconnectHandle = null;
      this.reconnecting = false;
      this.connect();
    }, delay);
  }
}
