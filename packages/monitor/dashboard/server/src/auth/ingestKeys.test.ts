import { describe, expect, test } from 'vitest';
import {
  DEFAULT_GRACE_MS,
  addKey,
  emptyKeySet,
  generateKey,
  hashToken,
  isEnforcing,
  isValid,
  parseIngestKeySet,
  pruneExpired,
  revoke,
  rotate,
  serializeIngestKeySet,
  summarizeKeys,
  type IngestKeySet,
} from './ingestKeys.js';

const T0 = 1_770_000_000_000;

describe('ingest key manager — generation (Task 117.62)', () => {
  test('generateKey returns a raw token + a record that stores only its hash', () => {
    const { record, token } = generateKey(T0, 'ios-prod');
    expect(token.length).toBeGreaterThan(20);
    expect(record.id).toMatch(/^key_[0-9a-f]+$/);
    expect(record.createdAt).toBe(T0);
    expect(record.label).toBe('ios-prod');
    // The record never carries the raw token — only its SHA-256 hash.
    expect(record.hash).toBe(hashToken(token));
    expect(JSON.stringify(record)).not.toContain(token);
  });

  test('two generated tokens are distinct', () => {
    const a = generateKey(T0);
    const b = generateKey(T0);
    expect(a.token).not.toBe(b.token);
    expect(a.record.id).not.toBe(b.record.id);
  });
});

describe('ingest key manager — isValid + enforcement', () => {
  test('an empty set does not enforce and validates nothing', () => {
    const set = emptyKeySet();
    expect(isEnforcing(set)).toBe(false);
    expect(isValid(set, 'anything', T0)).toBe(false);
    expect(isValid(set, null, T0)).toBe(false);
  });

  test('an active key validates its own token and rejects others', () => {
    const { set, generated } = addKey(emptyKeySet(), T0);
    expect(isEnforcing(set)).toBe(true);
    expect(isValid(set, generated.token, T0)).toBe(true);
    expect(isValid(set, 'wrong-token', T0)).toBe(false);
    expect(isValid(set, '', T0)).toBe(false);
  });
});

describe('ingest key manager — rotation grace window', () => {
  test('rotate mints a new active key while the old one stays valid in grace, then retires', () => {
    // Seed with one active key.
    const seeded = addKey(emptyKeySet(), T0);
    const oldToken = seeded.generated.token;

    // Rotate at T0 + 1h with the default 24h grace.
    const rotateAt = T0 + 60 * 60 * 1000;
    const { set: rotated, generated } = rotate(seeded.set, rotateAt);
    const newToken = generated.token;

    // New key is active immediately.
    expect(rotated.active).toHaveLength(1);
    expect(isValid(rotated, newToken, rotateAt)).toBe(true);

    // Old key moved to retired with a grace deadline.
    expect(rotated.retired).toHaveLength(1);
    expect(rotated.retired[0]?.retiredAt).toBe(rotateAt + DEFAULT_GRACE_MS);

    // Old key STILL valid mid-grace.
    expect(isValid(rotated, oldToken, rotateAt + 1000)).toBe(true);
    expect(isValid(rotated, oldToken, rotateAt + DEFAULT_GRACE_MS - 1)).toBe(true);

    // Old key INVALID exactly at and after the grace deadline.
    const expiry = rotateAt + DEFAULT_GRACE_MS;
    expect(isValid(rotated, oldToken, expiry)).toBe(false);
    expect(isValid(rotated, oldToken, expiry + 5_000)).toBe(false);

    // New key remains valid past the old one's expiry.
    expect(isValid(rotated, newToken, expiry + 5_000)).toBe(true);
  });

  test('a custom grace window is honoured (injected clock)', () => {
    const seeded = addKey(emptyKeySet(), T0);
    const oldToken = seeded.generated.token;
    const { set: rotated } = rotate(seeded.set, T0, 5_000); // 5s grace

    expect(isValid(rotated, oldToken, T0 + 4_999)).toBe(true);
    expect(isValid(rotated, oldToken, T0 + 5_000)).toBe(false);
  });

  test('rotating an empty set just creates the first active key (nothing retired)', () => {
    const { set, generated } = rotate(emptyKeySet(), T0);
    expect(set.active).toHaveLength(1);
    expect(set.retired).toHaveLength(0);
    expect(isValid(set, generated.token, T0)).toBe(true);
  });

  test('pruneExpired drops retired keys past their grace deadline', () => {
    const seeded = addKey(emptyKeySet(), T0);
    const { set: rotated } = rotate(seeded.set, T0, 10_000);
    expect(rotated.retired).toHaveLength(1);

    const beforeExpiry = pruneExpired(rotated, T0 + 9_999);
    expect(beforeExpiry.retired).toHaveLength(1);

    const afterExpiry = pruneExpired(rotated, T0 + 10_000);
    expect(afterExpiry.retired).toHaveLength(0);
    // Active key untouched.
    expect(afterExpiry.active).toHaveLength(1);
  });
});

describe('ingest key manager — revocation', () => {
  test('revoke immediately invalidates an active key (no grace)', () => {
    const { set, generated } = addKey(emptyKeySet(), T0);
    expect(isValid(set, generated.token, T0)).toBe(true);

    const { set: afterRevoke, revoked } = revoke(set, generated.record.id, T0 + 100);
    expect(revoked).toBe(true);
    // Rejected instantly — even one ms later.
    expect(isValid(afterRevoke, generated.token, T0 + 101)).toBe(false);
    expect(afterRevoke.active).toHaveLength(0);
    expect(afterRevoke.revoked).toHaveLength(1);
    expect(afterRevoke.revoked[0]?.revokedAt).toBe(T0 + 100);
    expect(afterRevoke.revoked[0]?.retiredAt).toBeUndefined();
    // The set still enforces (an operator who revoked everything wants the
    // door shut, not open).
    expect(isEnforcing(afterRevoke)).toBe(true);
  });

  test('revoke a key that is mid-grace kills it instantly, ahead of its grace deadline', () => {
    const seeded = addKey(emptyKeySet(), T0);
    const oldToken = seeded.generated.token;
    const { set: rotated } = rotate(seeded.set, T0, 100_000);
    const retiredId = rotated.retired[0]!.id;
    expect(isValid(rotated, oldToken, T0 + 50_000)).toBe(true);

    const { set: afterRevoke, revoked } = revoke(rotated, retiredId, T0 + 50_000);
    expect(revoked).toBe(true);
    expect(isValid(afterRevoke, oldToken, T0 + 50_001)).toBe(false);
    expect(afterRevoke.retired).toHaveLength(0);
  });

  test('revoke of an unknown id is a no-op returning revoked=false', () => {
    const { set } = addKey(emptyKeySet(), T0);
    const { set: same, revoked } = revoke(set, 'key_does_not_exist', T0);
    expect(revoked).toBe(false);
    expect(same).toBe(set);
  });
});

describe('ingest key manager — summaries (never leak secrets)', () => {
  test('summarizeKeys reports active / grace / expired / revoked and no hashes', () => {
    let set: IngestKeySet = emptyKeySet();
    set = addKey(set, T0).set; // active
    const rotated = rotate(set, T0 + 1_000, 5_000); // retires the active, mints a new one
    set = rotated.set;
    // Revoke the new active.
    set = revoke(set, rotated.generated.record.id, T0 + 2_000).set;

    // At T0+1000 the retired key is in grace; the previously-active is now revoked.
    const summaryInGrace = summarizeKeys(set, T0 + 3_000);
    const statuses = summaryInGrace.map((s) => s.status).sort();
    expect(statuses).toContain('grace');
    expect(statuses).toContain('revoked');
    // No hash / token surfaces.
    expect(JSON.stringify(summaryInGrace)).not.toMatch(/hash/);

    // After the grace deadline the retired key reads as expired.
    const summaryExpired = summarizeKeys(set, T0 + 1_000 + 5_000 + 1);
    expect(summaryExpired.some((s) => s.status === 'expired')).toBe(true);
  });
});

describe('ingest key manager — serialize / parse round-trip + safety', () => {
  test('serialize → parse is lossless and validation still works', () => {
    const seeded = addKey(emptyKeySet(), T0);
    const { set } = rotate(seeded.set, T0 + 1_000, 9_000);
    const raw = serializeIngestKeySet(set);
    const parsed = parseIngestKeySet(raw);
    expect(parsed).toEqual(set);
    expect(isValid(parsed, seeded.generated.token, T0 + 5_000)).toBe(true);
  });

  test('parse of null / corrupt input falls back to an empty (non-enforcing) set', () => {
    expect(parseIngestKeySet(null)).toEqual(emptyKeySet());
    expect(parseIngestKeySet(undefined)).toEqual(emptyKeySet());
    expect(parseIngestKeySet('')).toEqual(emptyKeySet());
    expect(parseIngestKeySet('{ not json')).toEqual(emptyKeySet());
    expect(parseIngestKeySet('[]')).toEqual(emptyKeySet());
    expect(parseIngestKeySet('42')).toEqual(emptyKeySet());
    // A corrupt row must never brick ingest — it just disables enforcement.
    expect(isEnforcing(parseIngestKeySet('garbage'))).toBe(false);
  });

  test('parse drops malformed key records but keeps valid ones', () => {
    const raw = JSON.stringify({
      active: [
        { id: 'key_ok', hash: 'abc', createdAt: T0 },
        { id: '', hash: 'x', createdAt: T0 }, // bad id
        { id: 'key_nohash', createdAt: T0 }, // missing hash
        { hash: 'y', createdAt: T0 }, // missing id
        'nope',
      ],
      retired: 'not-an-array',
      revoked: [{ id: 'key_rev', hash: 'def', createdAt: T0, revokedAt: T0 + 1 }],
    });
    const parsed = parseIngestKeySet(raw);
    expect(parsed.active).toHaveLength(1);
    expect(parsed.active[0]?.id).toBe('key_ok');
    expect(parsed.retired).toHaveLength(0);
    expect(parsed.revoked).toHaveLength(1);
  });
});
