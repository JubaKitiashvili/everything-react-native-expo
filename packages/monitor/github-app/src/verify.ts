// Task 117.75 — GitHub webhook signature verification.
//
// GitHub signs each webhook delivery with HMAC-SHA256 over the raw
// request body using the App's webhook secret, and sends it in the
// `X-Hub-Signature-256` header as `sha256=<hex>`. We recompute the
// digest and compare in constant time. node:crypto only — no deps.

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verify a GitHub webhook signature.
 *
 * @param rawBody          The exact raw request body bytes/string GitHub sent.
 *                         Must be the unparsed body — re-serializing JSON can
 *                         change bytes and break the signature.
 * @param signatureHeader  Value of the `X-Hub-Signature-256` header,
 *                         e.g. `sha256=abc123...`.
 * @param secret           The App's configured webhook secret.
 * @returns                true only when the signature is valid. Never throws.
 */
export function verifySignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  try {
    if (!signatureHeader || !secret) {
      return false;
    }

    const prefix = 'sha256=';
    if (!signatureHeader.startsWith(prefix)) {
      return false;
    }

    const provided = signatureHeader.slice(prefix.length);
    // Hex of a SHA-256 digest is always 64 chars; reject obvious garbage early.
    if (provided.length !== 64 || !/^[0-9a-f]+$/i.test(provided)) {
      return false;
    }

    const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
    const expected = createHmac('sha256', secret).update(body).digest('hex');

    const expectedBuf = Buffer.from(expected, 'utf8');
    const providedBuf = Buffer.from(provided, 'utf8');

    // timingSafeEqual throws on length mismatch — both are 64 here, but
    // guard anyway so we never throw.
    if (expectedBuf.length !== providedBuf.length) {
      return false;
    }

    return timingSafeEqual(expectedBuf, providedBuf);
  } catch {
    return false;
  }
}
