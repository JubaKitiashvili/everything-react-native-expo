import { describe, expect, test } from 'vitest';
import {
  DEFAULT_RATE_LIMITER_CONFIG,
  TokenBucketRateLimiter,
  deriveTenantKey,
  type TenantKeyRequest,
} from './rateLimiter.js';

describe('TokenBucketRateLimiter', () => {
  test('allows consumption up to capacity within an instant (no refill)', () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 5, refillPerSec: 1 });
    const now = 1_000;
    for (let i = 0; i < 5; i++) {
      const d = limiter.tryConsume('t', now);
      expect(d.allowed).toBe(true);
      expect(d.remaining).toBe(5 - 1 - i);
    }
  });

  test('blocks once the bucket is drained and reports retryAfterMs', () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 2, refillPerSec: 10 });
    const now = 1_000;
    expect(limiter.tryConsume('t', now).allowed).toBe(true);
    expect(limiter.tryConsume('t', now).allowed).toBe(true);

    const blocked = limiter.tryConsume('t', now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    // 10 tokens/sec → 100ms per token. Empty bucket needs a full token.
    expect(blocked.retryAfterMs).toBe(100);
  });

  test('refills over time via the injected clock', () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 2, refillPerSec: 10 });
    // Drain.
    expect(limiter.tryConsume('t', 0).allowed).toBe(true);
    expect(limiter.tryConsume('t', 0).allowed).toBe(true);
    expect(limiter.tryConsume('t', 0).allowed).toBe(false);

    // 100ms later → exactly one token refilled at 10/sec.
    expect(limiter.tryConsume('t', 100).allowed).toBe(true);
    // Immediately empty again.
    expect(limiter.tryConsume('t', 100).allowed).toBe(false);
  });

  test('refill never exceeds capacity even after a long idle period', () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 3, refillPerSec: 100 });
    limiter.tryConsume('t', 0); // bucket: 2 left, lastRefill=0
    // 10 seconds idle would refill 1000 tokens — but capacity clamps to 3.
    expect(limiter.peek('t', 10_000)).toBe(3);
    // Confirm we can only spend `capacity` despite the huge elapsed time.
    let allowed = 0;
    for (let i = 0; i < 10; i++) {
      if (limiter.tryConsume('t', 10_000).allowed) allowed++;
    }
    expect(allowed).toBe(3);
  });

  test('per-key isolation: draining one tenant does not affect another', () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 2, refillPerSec: 1 });
    const now = 500;
    // Drain tenant A.
    expect(limiter.tryConsume('A', now).allowed).toBe(true);
    expect(limiter.tryConsume('A', now).allowed).toBe(true);
    expect(limiter.tryConsume('A', now).allowed).toBe(false);

    // Tenant B starts fresh — full burst available.
    expect(limiter.tryConsume('B', now).allowed).toBe(true);
    expect(limiter.tryConsume('B', now).allowed).toBe(true);
    expect(limiter.tryConsume('B', now).allowed).toBe(false);

    expect(limiter.size).toBe(2);
  });

  test('peek reports full capacity for an unseen key without creating a bucket', () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 4, refillPerSec: 1 });
    expect(limiter.peek('never-seen', 0)).toBe(4);
    expect(limiter.size).toBe(0);
  });

  test('forget drops a tenant bucket so its burst allowance resets', () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 1, refillPerSec: 1 });
    expect(limiter.tryConsume('t', 0).allowed).toBe(true);
    expect(limiter.tryConsume('t', 0).allowed).toBe(false);
    limiter.forget('t');
    // Fresh bucket → full again.
    expect(limiter.tryConsume('t', 0).allowed).toBe(true);
  });

  test('non-monotonic clock (now < lastRefill) never adds negative tokens', () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 2, refillPerSec: 10 });
    expect(limiter.tryConsume('t', 1_000).allowed).toBe(true); // 1 left
    // Clock jumps backwards — must not grant a refill nor go negative.
    expect(limiter.tryConsume('t', 500).allowed).toBe(true); // spends the last token
    expect(limiter.tryConsume('t', 500).allowed).toBe(false);
  });

  test('rejects invalid configs', () => {
    expect(() => new TokenBucketRateLimiter({ capacity: 0, refillPerSec: 1 })).toThrow(/capacity/);
    expect(() => new TokenBucketRateLimiter({ capacity: -1, refillPerSec: 1 })).toThrow(/capacity/);
    expect(() => new TokenBucketRateLimiter({ capacity: 1, refillPerSec: 0 })).toThrow(
      /refillPerSec/,
    );
    expect(
      () => new TokenBucketRateLimiter({ capacity: Infinity, refillPerSec: 1 }),
    ).toThrow(/capacity/);
  });

  test('defaults: 100-event burst, sustained 50/sec', () => {
    expect(DEFAULT_RATE_LIMITER_CONFIG.capacity).toBe(100);
    expect(DEFAULT_RATE_LIMITER_CONFIG.refillPerSec).toBe(50);
    const limiter = new TokenBucketRateLimiter();
    let allowed = 0;
    for (let i = 0; i < 150; i++) {
      if (limiter.tryConsume('t', 0).allowed) allowed++;
    }
    expect(allowed).toBe(100); // only the burst capacity at t=0
  });
});

describe('deriveTenantKey', () => {
  function req(
    headers: Record<string, string | string[] | undefined> = {},
    remoteAddress?: string,
  ): TenantKeyRequest {
    return {
      headers: headers as TenantKeyRequest['headers'],
      socket: { remoteAddress },
    };
  }
  const base = new URL('ws://internal/ws/ingest');

  test('prefers the Bearer token from Authorization header', () => {
    const key = deriveTenantKey(req({ authorization: 'Bearer sdk-abc' }, '10.0.0.1'), base);
    expect(key).toBe('key:sdk-abc');
  });

  test('falls back to the apiKey query param', () => {
    const url = new URL('ws://internal/ws/ingest?apiKey=qparam-key');
    expect(deriveTenantKey(req({}, '10.0.0.1'), url)).toBe('key:qparam-key');
  });

  test('accepts ws_auth_token query param as the SDK key', () => {
    const url = new URL('ws://internal/ws/ingest?ws_auth_token=tok-123');
    expect(deriveTenantKey(req({}, '10.0.0.1'), url)).toBe('key:tok-123');
  });

  test('falls back to client IP when no key is present', () => {
    expect(deriveTenantKey(req({}, '203.0.113.7'), base)).toBe('ip:203.0.113.7');
  });

  test('honours x-forwarded-for first hop over the socket address', () => {
    const key = deriveTenantKey(
      req({ 'x-forwarded-for': '198.51.100.4, 10.0.0.1' }, '10.0.0.1'),
      base,
    );
    expect(key).toBe('ip:198.51.100.4');
  });

  test('returns anon when nothing identifies the tenant', () => {
    expect(deriveTenantKey(req({}, undefined), base)).toBe('anon');
  });

  test('key/ip namespacing prevents collisions between an IP literal and an SDK key', () => {
    const asKey = deriveTenantKey(req({ authorization: 'Bearer 203.0.113.7' }), base);
    const asIp = deriveTenantKey(req({}, '203.0.113.7'), base);
    expect(asKey).toBe('key:203.0.113.7');
    expect(asIp).toBe('ip:203.0.113.7');
    expect(asKey).not.toBe(asIp);
  });
});
