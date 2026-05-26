// Task 117.63 — Webhook HMAC signatures.
//
// Two directions, one shared scheme:
//
//   OUTBOUND — when the dashboard delivers an alert firing to a generic
//     `webhook:` channel, sign the exact request body with the channel's
//     shared secret so the receiver can verify the payload originated
//     from this dashboard and was not tampered with in transit. The
//     signature travels in the `X-ERNE-Signature` header.
//
//   INBOUND — when a future endpoint accepts pushes from a trusted
//     upstream (e.g. a CI webhook, a paging provider's status callback),
//     verify the presented `X-ERNE-Signature` header against the raw
//     request body before acting on it.
//
// Scheme: HMAC-SHA256 over the UTF-8 body bytes, hex-encoded, prefixed
// `sha256=`. This mirrors the de-facto standard used by GitHub, Stripe,
// Slack et al. so receivers can reuse existing verification helpers.
//
// Verification is constant-time: we compare the hex digests with
// `crypto.timingSafeEqual` so a network attacker cannot recover the
// secret one byte at a time by timing the comparison. A length mismatch
// short-circuits to `false` *before* the timing-safe compare (the digest
// length is fixed and public, so this leaks nothing).

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Header name carrying the hex HMAC-SHA256 signature of the request
 * body, prefixed `sha256=`. Lower-cased for direct use as a Node
 * `http` header key; receivers should match case-insensitively.
 */
export const X_ERNE_SIGNATURE_HEADER = 'x-erne-signature';

/** Prefix on every signature value — identifies the digest algorithm. */
export const SIGNATURE_PREFIX = 'sha256=';

/**
 * Sign a webhook body with the shared secret.
 *
 * @param secret  Shared HMAC secret. Must be non-empty.
 * @param body    The exact bytes that will be sent as the request body.
 *                A string is hashed as UTF-8; a Buffer is hashed verbatim.
 * @returns       `sha256=<hex>` — ready to drop into `X-ERNE-Signature`.
 */
export function signPayload(secret: string, body: string | Buffer): string {
  if (!secret) {
    throw new Error('signPayload: secret must be a non-empty string');
  }
  const hex = createHmac('sha256', secret).update(body).digest('hex');
  return `${SIGNATURE_PREFIX}${hex}`;
}

/**
 * Verify a presented signature header against the body.
 *
 * Returns `false` (never throws) for any failure mode — empty secret,
 * missing/malformed header, wrong prefix, length mismatch, or a genuine
 * digest mismatch — so callers can treat the result as a plain boolean
 * gate without a try/catch.
 *
 * The comparison is constant-time once the lengths match.
 *
 * @param secret  Shared HMAC secret used to re-derive the expected sig.
 * @param body    The exact received body bytes.
 * @param header  The presented `X-ERNE-Signature` value (with prefix).
 */
export function verifySignature(
  secret: string,
  body: string | Buffer,
  header: string | null | undefined,
): boolean {
  if (!secret) return false;
  if (typeof header !== 'string' || header.length === 0) return false;

  const expected = signPayload(secret, body);
  const expectedBuf = Buffer.from(expected, 'utf8');
  const presentedBuf = Buffer.from(header, 'utf8');

  // Length differs → definitely not a match. The expected length is a
  // fixed, public constant (`sha256=` + 64 hex chars = 71 bytes), so
  // short-circuiting here leaks nothing about the secret. timingSafeEqual
  // throws on length mismatch, so we must guard it ourselves.
  if (expectedBuf.length !== presentedBuf.length) return false;

  return timingSafeEqual(expectedBuf, presentedBuf);
}
