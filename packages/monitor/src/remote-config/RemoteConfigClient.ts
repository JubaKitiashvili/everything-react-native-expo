// Task 117.55 / 117.17-SDK — the polling client for /v1/config.
//
// Fetches the server's RemoteConfig, polls it on an interval, exposes the
// current config + an onChange subscription, and is fully resilient: any
// network / HTTP / parse error keeps the last-good (or default) config and is
// NEVER thrown into the host app. The first successful fetch fires onChange;
// subsequent fetches only fire when the effective config actually changed
// (per `remoteConfigEquals`, which ignores `updatedAt`).
//
// Both fetch and the timer are injectable so the client is unit-testable with
// no real I/O and no real clock.

import {
  DEFAULT_REMOTE_CONFIG,
  remoteConfigEquals,
  validateRemoteConfig,
  type RemoteConfig,
} from './RemoteConfig';

/** Default poll cadence: 5 minutes. */
export const DEFAULT_POLL_INTERVAL_MS = 5 * 60_000;

/** Minimal timer surface — lets tests inject a fake scheduler. */
export interface RemoteConfigTimer {
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

const realTimer: RemoteConfigTimer = {
  setInterval: (handler, ms) => setInterval(handler, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

export type RemoteConfigListener = (config: RemoteConfig) => void;

export interface RemoteConfigClientDeps {
  /**
   * Base URL the SDK already uses to talk to the dashboard server. May be the
   * runtime WS URL (`ws://host:port/...`) or an http(s) origin; the client
   * derives the `/v1/config` endpoint from it (scheme normalised to http(s)).
   * Mutually exclusive with `url` — when both are given, `url` wins.
   */
  readonly baseUrl?: string;
  /** Fully-qualified config endpoint. Overrides `baseUrl` derivation. */
  readonly url?: string;
  /** Injectable fetch (defaults to globalThis.fetch). */
  readonly fetchImpl?: typeof fetch;
  /** Injectable timer (defaults to global setInterval/clearInterval). */
  readonly timer?: RemoteConfigTimer;
  /** Poll cadence in ms. Defaults to 5 minutes. */
  readonly intervalMs?: number;
  /** Optional sink for diagnostics (never throws). */
  readonly onError?: (error: unknown) => void;
}

/**
 * Derive the `GET /v1/config` URL from a base. Accepts a WS runtime URL
 * (`ws://`/`wss://` → `http://`/`https://`) or an http(s) origin; strips any
 * path / query / hash and appends `/v1/config`. Returns null if unparseable.
 */
const KNOWN_SCHEMES = new Set(['ws:', 'wss:', 'http:', 'https:']);

export function deriveConfigUrl(baseUrl: string): string | null {
  try {
    const u = new URL(baseUrl);
    // Only trust a parsed URL when it carries a recognised web/ws scheme AND
    // a host. `new URL('localhost:1234')` parses `localhost:` as the protocol
    // with an empty host — that must fall through to the naive path below.
    if (KNOWN_SCHEMES.has(u.protocol) && u.host.length > 0) {
      if (u.protocol === 'ws:') u.protocol = 'http:';
      else if (u.protocol === 'wss:') u.protocol = 'https:';
      return `${u.protocol}//${u.host}/v1/config`;
    }
  } catch {
    // fall through
  }
  // Naive string surgery for schemeless bases (e.g. "host:port").
  const trimmed = baseUrl.replace(/^(wss?|https?):\/\//i, '').replace(/\/.*/, '');
  if (trimmed.length === 0) return null;
  return `http://${trimmed}/v1/config`;
}

export class RemoteConfigClient {
  private readonly endpoint: string | null;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly timer: RemoteConfigTimer;
  private readonly intervalMs: number;
  private readonly onError: ((error: unknown) => void) | undefined;

  private current: RemoteConfig = DEFAULT_REMOTE_CONFIG;
  private listeners = new Set<RemoteConfigListener>();
  private handle: unknown = null;
  private running = false;

  constructor(deps: RemoteConfigClientDeps) {
    this.endpoint =
      deps.url ?? (deps.baseUrl ? deriveConfigUrl(deps.baseUrl) : null);
    this.fetchImpl = deps.fetchImpl ?? globalThis.fetch?.bind(globalThis);
    this.timer = deps.timer ?? realTimer;
    this.intervalMs = deps.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.onError = deps.onError;
  }

  /** The most recently applied config (defaults until the first fetch). */
  getConfig(): RemoteConfig {
    return this.current;
  }

  /**
   * Subscribe to config changes. The listener is invoked immediately with the
   * current config, then again whenever a fetched config differs. Returns an
   * unsubscribe function.
   */
  onChange(listener: RemoteConfigListener): () => void {
    this.listeners.add(listener);
    try {
      listener(this.current);
    } catch (error) {
      this.reportError(error);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Fetch the config once. Always resolves — on any error it keeps the last
   * config and returns it (the error is routed to `onError`, never thrown).
   * Returns the (possibly unchanged) current config.
   */
  async fetchNow(): Promise<RemoteConfig> {
    if (!this.endpoint || !this.fetchImpl) {
      return this.current;
    }
    try {
      const res = await this.fetchImpl(this.endpoint, { method: 'GET' });
      if (!res || typeof res.ok !== 'boolean' || !res.ok) {
        this.reportError(
          new Error(
            `[monitor] remote config fetch failed: HTTP ${
              res && typeof res.status === 'number' ? res.status : '???'
            }`,
          ),
        );
        return this.current;
      }
      const body: unknown = await res.json();
      // The server wraps the config as `{ config: RemoteConfig }`. Accept
      // either the envelope or a bare config object for forward-compat.
      const raw =
        body && typeof body === 'object' && 'config' in body
          ? (body as { config: unknown }).config
          : body;
      const next = validateRemoteConfig(raw);
      this.applyFetched(next);
      return this.current;
    } catch (error) {
      this.reportError(error);
      return this.current;
    }
  }

  /**
   * Begin polling. Fires an immediate fetch, then re-fetches every
   * `intervalMs`. Idempotent — a second `start()` is a no-op. The initial
   * fetch is fire-and-forget (its result lands via onChange) so `start()`
   * never blocks the host app boot.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    void this.fetchNow();
    this.handle = this.timer.setInterval(() => {
      void this.fetchNow();
    }, this.intervalMs);
  }

  /** Stop polling and clear the timer. Idempotent. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.handle !== null) {
      this.timer.clearInterval(this.handle);
      this.handle = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  private applyFetched(next: RemoteConfig): void {
    if (remoteConfigEquals(this.current, next)) return;
    this.current = next;
    for (const listener of this.listeners) {
      try {
        listener(next);
      } catch (error) {
        this.reportError(error);
      }
    }
  }

  private reportError(error: unknown): void {
    if (!this.onError) return;
    try {
      this.onError(error);
    } catch {
      // diagnostics sink must never escalate
    }
  }
}
