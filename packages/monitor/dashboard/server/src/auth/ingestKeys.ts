// Task 117.62 — server-side ingest key management: rotation + revocation.
//
// SDKs in shipped apps authenticate to the WS ingest path (`/ws/ingest`)
// with an opaque bearer token. Distributing one token to a whole fleet
// means a leaked token can't simply be "changed" — you need rotation
// (issue a new token while the old one keeps working long enough for the
// fleet to pick it up) and revocation (kill a token instantly when it
// leaks). This module is the PURE core behind that surface: no I/O, no
// http, no store — just the key-set state machine, with an injectable
// clock so every transition is unit-testable.
//
// The REST layer (server.ts) and the key/value store (server_settings)
// wrap this, exactly like remoteConfig.ts wraps RemoteConfig:
//
//   generateKey()             — mint a fresh opaque token + its record.
//   createKeySet() / rotate() — set operations returning a new IngestKeySet.
//   revoke(set, id, now)      — move a key to revoked immediately.
//   isValid(set, key, now)    — active + not-revoked + within grace?
//   parseIngestKeySet(raw)    — stored JSON → set, SAFE fallback to empty.
//   serializeIngestKeySet     — set → JSON string for storage.
//
// SECURITY: we store the SHA-256 *hash* of each token, never the raw
// token. The raw token is returned exactly once — by `generateKey()` /
// `rotate()` — and the operator must capture it then; it is unrecoverable
// afterwards. This is a deliberate upgrade over the legacy single raw
// `ws_auth_token` setting (which the ingest path validates for backward
// compat — see server.ts), because an ingest token is a bearer secret
// fanned out to many clients and a DB dump should never leak live tokens.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Storage key under which the JSON key-set blob lives in server_settings. */
export const INGEST_KEYS_SETTING_KEY = 'ingest_keys';

/**
 * Default grace window a rotated-out key stays valid: 24 hours. Long enough
 * for an SDK fleet polling for the new token (or shipping it in the next
 * release/OTA) to migrate before the old one stops working; short enough
 * that a rotated-out token isn't a long-lived liability.
 */
export const DEFAULT_GRACE_MS = 24 * 60 * 60 * 1000;

/** Number of random bytes behind each token. 32 bytes → 256 bits of entropy. */
const TOKEN_BYTES = 32;

/** Cap the number of stored keys so a buggy / hostile caller can't pin
 *  unbounded JSON in the settings row. Generous for the real use case
 *  (a handful of live + recently-rotated + revoked keys). */
const MAX_KEYS = 256;

/** A single ingest key as persisted. The raw token is NEVER stored here —
 *  only its SHA-256 hash. */
export interface IngestKeyRecord {
  /** Stable, non-secret id surfaced in listings + revoke calls. */
  id: string;
  /** SHA-256 hex of the raw token. The matching secret. */
  hash: string;
  /** ms timestamp the key was created. */
  createdAt: number;
  /**
   * For a key rotated out of active duty: the ms timestamp after which it
   * is no longer accepted (createdAt-of-rotation + grace). `undefined` for
   * a currently-active key.
   */
  retiredAt?: number;
  /** ms timestamp the key was explicitly revoked. `undefined` unless revoked. */
  revokedAt?: number;
  /** Free-form operator label (e.g. "ios-prod"). Optional. */
  label?: string;
}

/**
 * The full key set: active keys (currently issued) + retired keys (rotated
 * out, valid until their `retiredAt`) + revoked keys (killed, never valid).
 * Persisted as one JSON blob in `server_settings`.
 */
export interface IngestKeySet {
  /** Active keys — accepted with no time bound. */
  active: IngestKeyRecord[];
  /**
   * Rotated-out keys still inside their grace window. Each carries a
   * `retiredAt`; once `now >= retiredAt` it's effectively dead (the GC pass
   * in `pruneExpired` removes it). Kept separate from `active` so listings
   * can show "grace" status.
   */
  retired: IngestKeyRecord[];
  /** Revoked keys — never valid again. Retained for audit/listing only. */
  revoked: IngestKeyRecord[];
}

/** The public-safe view of a key for `GET /api/keys` — never the hash. */
export type IngestKeyStatus = 'active' | 'grace' | 'expired' | 'revoked';

export interface IngestKeySummary {
  id: string;
  status: IngestKeyStatus;
  createdAt: number;
  retiredAt?: number;
  revokedAt?: number;
  label?: string;
}

/** Result of minting a new key — the ONLY place the raw token is exposed. */
export interface GeneratedKey {
  record: IngestKeyRecord;
  /** The raw opaque token. Returned once; capture it now or lose it. */
  token: string;
}

/** Hash a raw token for storage / comparison. SHA-256 hex. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Generate a short, non-secret, collision-resistant key id. */
function generateKeyId(): string {
  return `key_${randomBytes(8).toString('hex')}`;
}

/** A fresh, empty key set (no keys configured — the dev-friendly default). */
export function emptyKeySet(): IngestKeySet {
  return { active: [], retired: [], revoked: [] };
}

/**
 * Mint a brand-new opaque token + its record. The token is base64url so it
 * is URL-safe (it travels as `?apiKey=` / `?ws_auth_token=` on the WS
 * upgrade URL as well as `Authorization: Bearer`). Pure aside from the
 * crypto RNG.
 */
export function generateKey(now: number, label?: string): GeneratedKey {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const record: IngestKeyRecord = {
    id: generateKeyId(),
    hash: hashToken(token),
    createdAt: now,
  };
  if (label !== undefined && label.length > 0) record.label = label;
  return { record, token };
}

/**
 * Whether the set currently enforces ingest auth. Empty set → no enforcement
 * (any SDK connects, matching the legacy/dev default). A set with at least
 * one key that could still be valid (active or in-grace) enforces. A set
 * containing only revoked / expired keys still enforces — an operator who
 * revoked every key clearly wants the door shut, not wide open.
 */
export function isEnforcing(set: IngestKeySet): boolean {
  return set.active.length > 0 || set.retired.length > 0 || set.revoked.length > 0;
}

/**
 * Rotate: every currently-active key is moved to `retired` with a
 * `retiredAt = now + graceMs`, and a brand-new active key is minted. The
 * old keys keep validating until their grace window closes; the new key is
 * valid immediately. Returns the next set + the freshly-minted key (raw
 * token included, once).
 *
 * Pure (aside from crypto RNG): does not mutate the input set.
 */
export function rotate(
  set: IngestKeySet,
  now: number,
  graceMs: number = DEFAULT_GRACE_MS,
  label?: string,
): { set: IngestKeySet; generated: GeneratedKey } {
  const generated = generateKey(now, label);
  const newlyRetired: IngestKeyRecord[] = set.active.map((k) => ({
    ...k,
    retiredAt: now + Math.max(0, graceMs),
  }));
  const next: IngestKeySet = {
    active: [generated.record],
    // Keep previously-retired keys; append the newly-retired actives.
    retired: [...set.retired, ...newlyRetired],
    revoked: [...set.revoked],
  };
  return { set: pruneExpired(next, now), generated };
}

/**
 * Add a freshly-minted active key WITHOUT rotating out the existing actives.
 * Used by `POST /api/keys` style "issue an additional key" flows so an
 * operator can run two live keys side by side. Returns the next set + the
 * generated key.
 */
export function addKey(
  set: IngestKeySet,
  now: number,
  label?: string,
): { set: IngestKeySet; generated: GeneratedKey } {
  const generated = generateKey(now, label);
  const next: IngestKeySet = {
    active: [...set.active, generated.record],
    retired: [...set.retired],
    revoked: [...set.revoked],
  };
  return { set: next, generated };
}

/**
 * Revoke a key by id. The key is removed from `active`/`retired` and moved
 * to `revoked` with a `revokedAt` stamp, so it is rejected *immediately* —
 * no grace, regardless of where it was. Returns the next set + whether a key
 * actually matched (false → unknown id, set unchanged).
 *
 * Pure: does not mutate the input set.
 */
export function revoke(
  set: IngestKeySet,
  id: string,
  now: number,
): { set: IngestKeySet; revoked: boolean } {
  const fromActive = set.active.find((k) => k.id === id);
  const fromRetired = set.retired.find((k) => k.id === id);
  const target = fromActive ?? fromRetired;
  if (!target) {
    // Already revoked? Treat as a no-op success-ish: return revoked=false so
    // the caller can 404, but never throw.
    return { set, revoked: false };
  }
  const revokedRecord: IngestKeyRecord = {
    ...target,
    revokedAt: now,
  };
  // Drop the grace marker — a revoked key is dead, not in grace.
  delete revokedRecord.retiredAt;
  const next: IngestKeySet = {
    active: set.active.filter((k) => k.id !== id),
    retired: set.retired.filter((k) => k.id !== id),
    revoked: [...set.revoked, revokedRecord],
  };
  return { set: next, revoked: true };
}

/**
 * Garbage-collect keys whose grace window has fully elapsed. A retired key
 * with `now >= retiredAt` is dropped (it can never validate again, so there
 * is no reason to keep it in `retired`). Revoked keys are retained for the
 * audit listing. Returns a new set; pure.
 */
export function pruneExpired(set: IngestKeySet, now: number): IngestKeySet {
  return {
    active: [...set.active],
    retired: set.retired.filter((k) => k.retiredAt === undefined || now < k.retiredAt),
    revoked: [...set.revoked],
  };
}

/**
 * The core authorization predicate. A raw token is valid iff its hash
 * matches an active key, OR a retired key still inside its grace window
 * (`now < retiredAt`). Revoked keys never match; expired-grace keys never
 * match. Hash comparison is constant-time to avoid leaking which prefix of
 * a guessed token was correct.
 *
 * Returns false for an empty/blank token. Callers gate enforcement on
 * `isEnforcing(set)` first — an empty set means "no auth configured", which
 * is a separate decision from "this token is invalid".
 */
export function isValid(set: IngestKeySet, token: string | null | undefined, now: number): boolean {
  if (!token || token.length === 0) return false;
  const candidate = hashToken(token);
  for (const key of set.active) {
    if (constantTimeHashEquals(candidate, key.hash)) return true;
  }
  for (const key of set.retired) {
    if (key.retiredAt !== undefined && now >= key.retiredAt) continue;
    if (constantTimeHashEquals(candidate, key.hash)) return true;
  }
  return false;
}

/** Constant-time hex-hash comparison. Both inputs are SHA-256 hex (64 chars). */
function constantTimeHashEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Public-safe summary of every key for `GET /api/keys`. Computes each key's
 * status against `now` (a retired key past its grace shows `expired`).
 * Never includes the hash or any secret material.
 */
export function summarizeKeys(set: IngestKeySet, now: number): IngestKeySummary[] {
  const out: IngestKeySummary[] = [];
  for (const k of set.active) {
    out.push(toSummary(k, 'active'));
  }
  for (const k of set.retired) {
    const status: IngestKeyStatus =
      k.retiredAt !== undefined && now >= k.retiredAt ? 'expired' : 'grace';
    out.push(toSummary(k, status));
  }
  for (const k of set.revoked) {
    out.push(toSummary(k, 'revoked'));
  }
  // Newest first by createdAt for a stable, operator-friendly listing.
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

function toSummary(k: IngestKeyRecord, status: IngestKeyStatus): IngestKeySummary {
  const summary: IngestKeySummary = { id: k.id, status, createdAt: k.createdAt };
  if (k.retiredAt !== undefined) summary.retiredAt = k.retiredAt;
  if (k.revokedAt !== undefined) summary.revokedAt = k.revokedAt;
  if (k.label !== undefined) summary.label = k.label;
  return summary;
}

/** Serialise a key set to a storage string. Pure. */
export function serializeIngestKeySet(set: IngestKeySet): string {
  return JSON.stringify({
    active: set.active,
    retired: set.retired,
    revoked: set.revoked,
  });
}

/**
 * Parse a stored key-set string back into an `IngestKeySet`. SAFE: any
 * missing / malformed / partially-corrupt input falls back to an empty set
 * rather than throwing — a corrupt `server_settings` row must never brick
 * the ingest path (it would just disable enforcement, the fail-open dev
 * default, never deny every SDK). Drops keys missing an id/hash and caps the
 * total at MAX_KEYS.
 */
export function parseIngestKeySet(raw: string | null | undefined): IngestKeySet {
  if (raw === null || raw === undefined || raw.length === 0) return emptyKeySet();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyKeySet();
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return emptyKeySet();
  }
  const obj = parsed as Record<string, unknown>;
  const set: IngestKeySet = {
    active: parseKeyArray(obj.active),
    retired: parseKeyArray(obj.retired),
    revoked: parseKeyArray(obj.revoked),
  };
  const total = set.active.length + set.retired.length + set.revoked.length;
  if (total > MAX_KEYS) {
    // Truncate defensively — keep actives first, then retired, then revoked.
    let budget = MAX_KEYS;
    set.active = set.active.slice(0, budget);
    budget -= set.active.length;
    set.retired = set.retired.slice(0, Math.max(0, budget));
    budget -= set.retired.length;
    set.revoked = set.revoked.slice(0, Math.max(0, budget));
  }
  return set;
}

function parseKeyArray(value: unknown): IngestKeyRecord[] {
  if (!Array.isArray(value)) return [];
  const out: IngestKeyRecord[] = [];
  for (const entry of value) {
    const rec = parseKeyRecord(entry);
    if (rec) out.push(rec);
  }
  return out;
}

function parseKeyRecord(value: unknown): IngestKeyRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.id !== 'string' || obj.id.length === 0) return null;
  if (typeof obj.hash !== 'string' || obj.hash.length === 0) return null;
  if (typeof obj.createdAt !== 'number' || !Number.isFinite(obj.createdAt)) return null;
  const rec: IngestKeyRecord = { id: obj.id, hash: obj.hash, createdAt: obj.createdAt };
  if (typeof obj.retiredAt === 'number' && Number.isFinite(obj.retiredAt)) {
    rec.retiredAt = obj.retiredAt;
  }
  if (typeof obj.revokedAt === 'number' && Number.isFinite(obj.revokedAt)) {
    rec.revokedAt = obj.revokedAt;
  }
  if (typeof obj.label === 'string' && obj.label.length > 0) rec.label = obj.label;
  return rec;
}
