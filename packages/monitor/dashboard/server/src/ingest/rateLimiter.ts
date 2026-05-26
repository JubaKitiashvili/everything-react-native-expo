// Task 117.64 — per-tenant ingest rate limiting.
//
// The WS ingest path already enforces a coarse per-CONNECTION event count
// (see `IngestWebSocketHandler.checkRate`). That guard protects a single
// socket but says nothing about a noisy tenant fanning a flood across many
// connections — exactly the abuse a multi-tenant dashboard must contain so
// one app can't starve ingest for everyone else.
//
// This module is a pure, deterministic token-bucket limiter keyed by an
// opaque tenant key. It owns no timers and reads no wall clock — every
// method takes `now` so tests drive refill via an injected clock and the
// hot path passes the handler's existing `now()` provider. Token buckets
// (vs. fixed/sliding windows) are chosen deliberately: they allow short
// bursts up to `capacity` while bounding the long-run rate to
// `refillPerSec`, which matches how SDKs flush — quiet, then a batch on
// reconnect, then quiet again.
//
// `tryConsume(key, now)` is the only state-mutating call. It refills the
// bucket lazily based on elapsed time, then either spends a token (allowed)
// or reports how long until the next token frees up (`retryAfterMs`). Keys
// are isolated: consuming for tenant A never touches tenant B's bucket.

/** Per-call result. `remaining` is the post-decision token count (floored). */
export interface RateLimitDecision {
  allowed: boolean;
  /** Tokens left in the bucket after this decision (0 when blocked + empty). */
  remaining: number;
  /**
   * Only present when `allowed === false`: milliseconds until at least one
   * token will have refilled. Lets the caller surface a `Retry-After`-style
   * hint so a well-behaved SDK backs off instead of hammering.
   */
  retryAfterMs?: number;
}

export interface RateLimiterConfig {
  /**
   * Maximum tokens a single tenant's bucket can hold — the largest burst
   * accepted after an idle period. Must be a positive finite number.
   */
  capacity: number;
  /**
   * Steady-state refill rate in tokens per second. The long-run accepted
   * rate converges to this value once the burst allowance is spent. Must be
   * a positive finite number.
   */
  refillPerSec: number;
}

/** Default ingest limits: 100-event burst, sustained 50 events/sec/tenant. */
export const DEFAULT_RATE_LIMITER_CONFIG: Readonly<RateLimiterConfig> = Object.freeze({
  capacity: 100,
  refillPerSec: 50,
});

interface Bucket {
  /** Fractional tokens currently available. */
  tokens: number;
  /** Timestamp (ms) of the last refill computation. */
  lastRefill: number;
}

/**
 * Deterministic token-bucket rate limiter keyed by an opaque tenant key.
 * Time is always injected — the limiter never reads the clock itself, so
 * tests are reproducible with no real timers.
 */
export class TokenBucketRateLimiter {
  private readonly capacity: number;
  private readonly refillPerSec: number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(config: RateLimiterConfig = DEFAULT_RATE_LIMITER_CONFIG) {
    if (!(config.capacity > 0) || !Number.isFinite(config.capacity)) {
      throw new Error(`rate limiter capacity must be a positive number, got ${config.capacity}`);
    }
    if (!(config.refillPerSec > 0) || !Number.isFinite(config.refillPerSec)) {
      throw new Error(
        `rate limiter refillPerSec must be a positive number, got ${config.refillPerSec}`,
      );
    }
    this.capacity = config.capacity;
    this.refillPerSec = config.refillPerSec;
  }

  /**
   * Attempt to spend one token for `key` at time `now` (ms). Refills the
   * bucket lazily for the elapsed interval first. When a token is available
   * it is spent and `allowed` is true; otherwise `allowed` is false and
   * `retryAfterMs` reports the wait until the next token.
   */
  tryConsume(key: string, now: number): RateLimitDecision {
    const bucket = this.refill(key, now);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true, remaining: Math.floor(bucket.tokens) };
    }
    // Tokens refill at refillPerSec/1000 per ms; time to reach a full token
    // from the current fractional balance:
    const deficit = 1 - bucket.tokens;
    const retryAfterMs = Math.ceil((deficit / this.refillPerSec) * 1000);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  /**
   * Read the current (refilled) token count for `key` without spending one.
   * Useful for diagnostics / metrics. Does not create a bucket entry when
   * the key is unknown — returns the full capacity (a never-seen tenant has
   * spent nothing).
   */
  peek(key: string, now: number): number {
    const existing = this.buckets.get(key);
    if (!existing) return this.capacity;
    return Math.floor(this.refill(key, now).tokens);
  }

  /** Drop a tenant's bucket — e.g. on eviction. Safe to call for unknown keys. */
  forget(key: string): void {
    this.buckets.delete(key);
  }

  /** Number of tenants with live buckets — exposed for tests / observability. */
  get size(): number {
    return this.buckets.size;
  }

  private refill(key: string, now: number): Bucket {
    const existing = this.buckets.get(key);
    if (!existing) {
      // A brand-new tenant starts with a full bucket so the first burst is
      // accepted up to `capacity`.
      const fresh: Bucket = { tokens: this.capacity, lastRefill: now };
      this.buckets.set(key, fresh);
      return fresh;
    }
    // Guard against a non-monotonic clock (now < lastRefill): never add
    // negative tokens, just advance the marker.
    const elapsedMs = Math.max(0, now - existing.lastRefill);
    if (elapsedMs > 0) {
      const refilled = (elapsedMs / 1000) * this.refillPerSec;
      existing.tokens = Math.min(this.capacity, existing.tokens + refilled);
      existing.lastRefill = now;
    }
    return existing;
  }
}

/**
 * Minimal request shape needed to derive a tenant key. Matches the subset
 * of `node:http`'s `IncomingMessage` we read on the WS upgrade — kept
 * structural so the helper stays pure and trivially unit-testable without
 * spinning up a socket.
 */
export interface TenantKeyRequest {
  headers: { authorization?: string | string[] | undefined };
  socket: { remoteAddress?: string | undefined };
}

/**
 * Derive an opaque tenant key for ingest rate limiting.
 *
 * Preference order:
 *   1. An SDK/API key carried on the ingest connection — the most precise
 *      tenant identity. Accepted as `?apiKey=` / `?ws_auth_token=` (browsers
 *      can't set arbitrary WS headers) or `Authorization: Bearer <key>`
 *      (Node/CLI clients). Keyed as `key:<value>`.
 *   2. The client IP (honouring `x-forwarded-for`'s first hop behind a
 *      proxy, else the socket's remote address). Keyed as `ip:<value>`.
 *   3. `anon` when nothing is resolvable — collapses unidentifiable traffic
 *      into a single shared bucket rather than letting it bypass the limit.
 *
 * The `key:` / `ip:` / `anon` namespacing prevents an IP literal from ever
 * colliding with an SDK key that happens to look like an address.
 */
export function deriveTenantKey(req: TenantKeyRequest, url: URL): string {
  const fromHeader = bearerToken(req.headers.authorization);
  const fromQuery =
    url.searchParams.get('apiKey') ?? url.searchParams.get('ws_auth_token') ?? undefined;
  const sdkKey = fromHeader ?? (fromQuery && fromQuery.length > 0 ? fromQuery : undefined);
  if (sdkKey) return `key:${sdkKey}`;

  const ip = clientIpFromHeaders(req);
  if (ip) return `ip:${ip}`;

  return 'anon';
}

function bearerToken(header: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(header) ? header[0] : header;
  if (typeof raw !== 'string') return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : undefined;
}

function clientIpFromHeaders(req: {
  headers: { authorization?: string | string[] | undefined } & Record<string, unknown>;
  socket: { remoteAddress?: string | undefined };
}): string | undefined {
  const forwarded = (req.headers as Record<string, unknown>)['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  } else if (Array.isArray(forwarded) && typeof forwarded[0] === 'string' && forwarded[0]) {
    return forwarded[0];
  }
  return req.socket.remoteAddress ?? undefined;
}
