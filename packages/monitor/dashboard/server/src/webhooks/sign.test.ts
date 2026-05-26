// Task 117.63 — webhook HMAC signature unit tests.

import { createHmac } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import {
  signPayload,
  verifySignature,
  X_ERNE_SIGNATURE_HEADER,
  SIGNATURE_PREFIX,
} from './sign.js';

const SECRET = 'super-secret-shared-key';

describe('signPayload', () => {
  test('produces a sha256=<hex> signature matching a hand-rolled HMAC', () => {
    const body = JSON.stringify({ hello: 'world' });
    const sig = signPayload(SECRET, body);
    const expectedHex = createHmac('sha256', SECRET).update(body).digest('hex');
    expect(sig).toBe(`sha256=${expectedHex}`);
    expect(sig.startsWith(SIGNATURE_PREFIX)).toBe(true);
    // sha256 hex digest is 64 chars; + the `sha256=` prefix.
    expect(sig).toHaveLength(SIGNATURE_PREFIX.length + 64);
  });

  test('is deterministic for the same secret + body', () => {
    const body = 'payload-bytes';
    expect(signPayload(SECRET, body)).toBe(signPayload(SECRET, body));
  });

  test('changes when the body changes', () => {
    expect(signPayload(SECRET, 'a')).not.toBe(signPayload(SECRET, 'b'));
  });

  test('changes when the secret changes', () => {
    const body = 'same-body';
    expect(signPayload(SECRET, body)).not.toBe(signPayload('other-secret', body));
  });

  test('hashes a Buffer body verbatim (matches the string form for UTF-8)', () => {
    const text = 'binary-ish-😀';
    expect(signPayload(SECRET, Buffer.from(text, 'utf8'))).toBe(signPayload(SECRET, text));
  });

  test('throws on an empty secret', () => {
    expect(() => signPayload('', 'body')).toThrow(/non-empty/);
  });

  test('exports the lower-cased header constant', () => {
    expect(X_ERNE_SIGNATURE_HEADER).toBe('x-erne-signature');
  });
});

describe('verifySignature', () => {
  test('round-trips: a freshly signed body verifies true', () => {
    const body = JSON.stringify({ source: 'erne-monitor', test: true });
    const sig = signPayload(SECRET, body);
    expect(verifySignature(SECRET, body, sig)).toBe(true);
  });

  test('detects a tampered body', () => {
    const body = JSON.stringify({ amount: 1 });
    const sig = signPayload(SECRET, body);
    const tampered = JSON.stringify({ amount: 1000 });
    expect(verifySignature(SECRET, tampered, sig)).toBe(false);
  });

  test('detects a tampered signature (flipped hex char)', () => {
    const body = 'body';
    const sig = signPayload(SECRET, body);
    const lastChar = sig.at(-1);
    const flipped = sig.slice(0, -1) + (lastChar === 'a' ? 'b' : 'a');
    expect(verifySignature(SECRET, body, flipped)).toBe(false);
  });

  test('fails when verifying with the wrong secret', () => {
    const body = 'body';
    const sig = signPayload(SECRET, body);
    expect(verifySignature('wrong-secret', body, sig)).toBe(false);
  });

  test('returns false (never throws) for missing / empty / null headers', () => {
    expect(verifySignature(SECRET, 'body', null)).toBe(false);
    expect(verifySignature(SECRET, 'body', undefined)).toBe(false);
    expect(verifySignature(SECRET, 'body', '')).toBe(false);
  });

  test('returns false for an empty secret', () => {
    expect(verifySignature('', 'body', signPayload(SECRET, 'body'))).toBe(false);
  });

  test('returns false for a malformed header without the sha256= prefix', () => {
    const hex = createHmac('sha256', SECRET).update('body').digest('hex');
    expect(verifySignature(SECRET, 'body', hex)).toBe(false);
  });

  test('a correct same-length signature passes the constant-time compare', () => {
    // Same-length candidate that only differs in content must still
    // verify false — proving the compare is over content, not length.
    const body = 'constant-time-body';
    const sig = signPayload(SECRET, body);
    expect(verifySignature(SECRET, body, sig)).toBe(true);

    const wrongSameLength = `${SIGNATURE_PREFIX}${'0'.repeat(64)}`;
    expect(wrongSameLength).toHaveLength(sig.length);
    expect(verifySignature(SECRET, body, wrongSameLength)).toBe(false);
  });

  test('short-circuits on a length mismatch without throwing', () => {
    // timingSafeEqual throws on unequal buffer lengths; the guard must
    // return false instead of propagating that throw.
    expect(() => verifySignature(SECRET, 'body', 'sha256=short')).not.toThrow();
    expect(verifySignature(SECRET, 'body', 'sha256=short')).toBe(false);
  });
});
