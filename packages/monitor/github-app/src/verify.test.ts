import { describe, expect, it } from 'vitest';
import { verifySignature } from './verify.js';
import { signBody } from './test-helpers.js';

const SECRET = 'super-secret-webhook-key';
const BODY = JSON.stringify({ action: 'opened', hello: 'world', n: 42 });

describe('verifySignature', () => {
  it('accepts a valid signature', () => {
    const sig = signBody(BODY, SECRET);
    expect(verifySignature(BODY, sig, SECRET)).toBe(true);
  });

  it('accepts a valid signature when body is a Buffer', () => {
    const sig = signBody(BODY, SECRET);
    expect(verifySignature(Buffer.from(BODY, 'utf8'), sig, SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const sig = signBody(BODY, SECRET);
    expect(verifySignature(BODY + ' ', sig, SECRET)).toBe(false);
  });

  it('rejects a tampered signature hex', () => {
    const sig = signBody(BODY, SECRET);
    // flip the last hex char
    const last = sig.slice(-1) === '0' ? '1' : '0';
    const tampered = sig.slice(0, -1) + last;
    expect(verifySignature(BODY, tampered, SECRET)).toBe(false);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const sig = signBody(BODY, 'wrong-secret');
    expect(verifySignature(BODY, sig, SECRET)).toBe(false);
  });

  it('rejects a blank / missing signature header', () => {
    expect(verifySignature(BODY, '', SECRET)).toBe(false);
    expect(verifySignature(BODY, null, SECRET)).toBe(false);
    expect(verifySignature(BODY, undefined, SECRET)).toBe(false);
  });

  it('rejects a header without the sha256= prefix', () => {
    const raw = signBody(BODY, SECRET).slice('sha256='.length);
    expect(verifySignature(BODY, raw, SECRET)).toBe(false);
  });

  it('rejects when the secret is empty', () => {
    const sig = signBody(BODY, SECRET);
    expect(verifySignature(BODY, sig, '')).toBe(false);
  });

  it('rejects a malformed (non-hex / wrong length) digest without throwing', () => {
    expect(verifySignature(BODY, 'sha256=not-hex', SECRET)).toBe(false);
    expect(verifySignature(BODY, 'sha256=abc', SECRET)).toBe(false);
  });
});
