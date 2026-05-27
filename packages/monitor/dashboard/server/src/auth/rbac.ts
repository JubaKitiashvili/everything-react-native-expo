// Task 117.18 — multi-tenant RBAC: 3-role access control for the dashboard's
// MANAGEMENT surface (the `/api/*` endpoints a human operator hits), distinct
// from the SDK INGEST surface (`/v1/*` + WS), which keeps its own bearer-token
// auth in ingestKeys.ts. The two never share credentials: an SDK fleet token
// can read/write events but can't administer the dashboard, and a dashboard
// JWT can't be used as an ingest token.
//
// This module is the PURE core — no I/O, no http, no store, injectable clock —
// exactly like ingestKeys.ts / remoteConfig.ts. The REST layer (server.ts)
// wraps it and persists the state as one JSON blob under the `rbac` key in
// server_settings.
//
// MODEL
//   Tenant   — an isolation boundary. The default self-host deployment has
//              exactly one tenant; multi-tenant hosting adds more.
//   User     — belongs to exactly one tenant, identified by a GLOBALLY-unique
//              email (so login is just email+password, no tenant picker), with
//              one role.
//   Role     — owner > member > viewer:
//                viewer — read-only (GET dashboards/exports).
//                member — read + operational writes (resolve symbols, change
//                         crash status, ack notifications) but NOT admin.
//                owner  — everything: user mgmt, ingest keys, remote config,
//                         deletes, settings.
//
// BOOTSTRAP / BACKWARD COMPAT
//   isEnforcing(set) is false until the FIRST user is created. While not
//   enforcing, server.ts treats every caller as a synthetic Owner of the
//   `default` tenant — so a fresh single-tenant self-host (and every existing
//   test) works with no login at all. Creating the first user "turns on" auth;
//   from then on a valid JWT is required. This mirrors ingestKeys' fail-open
//   empty-set default: opt-in, never a surprise lockout.
//
// SECURITY
//   - Passwords: scrypt with a per-user random salt; the plaintext is never
//     stored and never leaves the login call. Verification is constant-time.
//   - JWT: compact HS256 (HMAC-SHA256) signed with a server secret; signature
//     comparison is constant-time and `exp` is always checked. We roll our own
//     over node:crypto rather than add a dependency — the token shape is the
//     standard three base64url segments, nothing exotic.
//   - A DB dump leaks only scrypt hashes + salts, never plaintext or live JWTs.

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** Storage key under which the JSON RBAC blob lives in server_settings. */
export const RBAC_SETTING_KEY = 'rbac';

/** Storage key under which the lazily-generated JWT signing secret lives. */
export const RBAC_JWT_SECRET_SETTING_KEY = 'rbac_jwt_secret';

/** Default access-token lifetime: 12 hours. Long enough for a working day,
 *  short enough that a leaked localStorage token self-expires. */
export const DEFAULT_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

/** scrypt output length in bytes (64 → 512-bit derived key). */
const SCRYPT_KEYLEN = 64;
/** Per-user salt length in bytes. */
const SALT_BYTES = 16;
/** Cap on stored tenants/users so a hostile/buggy caller can't pin unbounded
 *  JSON in the settings row. Generous for the real use case. */
const MAX_TENANTS = 1024;
const MAX_USERS = 8192;
/** Bound the accepted password length — scrypt on a multi-MB string is a DoS
 *  vector, and no legitimate password is anywhere near this. */
const MAX_PASSWORD_LEN = 1024;

/** The three roles, highest privilege first. */
export type Role = 'owner' | 'member' | 'viewer';

/** Privilege rank — higher satisfies lower. */
const ROLE_RANK: Record<Role, number> = { owner: 3, member: 2, viewer: 1 };

/** Type guard for a role string coming off the wire / out of storage. */
export function isRole(value: unknown): value is Role {
  return value === 'owner' || value === 'member' || value === 'viewer';
}

/**
 * Does `actual` satisfy the `required` minimum role? owner satisfies member
 * and viewer; member satisfies viewer; viewer satisfies only viewer.
 */
export function roleSatisfies(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

/** A tenant (isolation boundary). */
export interface TenantRecord {
  id: string;
  name: string;
  createdAt: number;
}

/** A user as persisted. Plaintext password is NEVER stored — only the scrypt
 *  hash + its salt. */
export interface UserRecord {
  id: string;
  tenantId: string;
  /** Lowercased, globally unique. */
  email: string;
  /** scrypt(password, salt) as hex. */
  passwordHash: string;
  /** Per-user random salt as hex. */
  salt: string;
  role: Role;
  createdAt: number;
}

/** The full RBAC state, persisted as one JSON blob. */
export interface RbacSet {
  tenants: TenantRecord[];
  users: UserRecord[];
}

/** Public-safe view of a user for listings — never hash/salt. */
export interface UserSummary {
  id: string;
  tenantId: string;
  email: string;
  role: Role;
  createdAt: number;
}

/** The verified identity attached to a request after auth. */
export interface Principal {
  userId: string;
  tenantId: string;
  email: string;
  role: Role;
}

/** A fresh, empty RBAC state — the not-enforcing dev default. */
export function emptyRbac(): RbacSet {
  return { tenants: [], users: [] };
}

/**
 * Whether RBAC is enforced. Empty (no users) → not enforcing: server.ts
 * treats callers as a synthetic Owner of the default tenant (single-tenant
 * dev default). Creating the first user flips this to true.
 */
export function isEnforcing(set: RbacSet): boolean {
  return set.users.length > 0;
}

// ---------------------------------------------------------------------------
// Password hashing (scrypt)
// ---------------------------------------------------------------------------

/** Hash a plaintext password with a fresh random salt. Returns hex hash+salt. */
export function hashPassword(password: string): { passwordHash: string; salt: string } {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const passwordHash = scryptSync(normalizePassword(password), salt, SCRYPT_KEYLEN).toString('hex');
  return { passwordHash, salt };
}

/**
 * Constant-time verify of a plaintext password against a stored hash+salt.
 * Returns false (never throws) on any malformed input.
 */
export function verifyPassword(password: string, passwordHash: string, salt: string): boolean {
  if (typeof password !== 'string' || typeof passwordHash !== 'string' || typeof salt !== 'string') {
    return false;
  }
  if (passwordHash.length === 0 || salt.length === 0) return false;
  let derived: Buffer;
  try {
    derived = scryptSync(normalizePassword(password), salt, SCRYPT_KEYLEN);
  } catch {
    return false;
  }
  let stored: Buffer;
  try {
    stored = Buffer.from(passwordHash, 'hex');
  } catch {
    return false;
  }
  if (derived.length !== stored.length) return false;
  return timingSafeEqual(derived, stored);
}

/** Clamp the password to a sane max before feeding it to scrypt (DoS guard). */
function normalizePassword(password: string): string {
  return typeof password === 'string' ? password.slice(0, MAX_PASSWORD_LEN) : '';
}

// ---------------------------------------------------------------------------
// JWT (compact HS256 over node:crypto — zero dependency)
// ---------------------------------------------------------------------------

interface JwtPayload {
  sub: string; // userId
  tid: string; // tenantId
  email: string;
  role: Role;
  iat: number; // issued-at (ms epoch)
  exp: number; // expiry (ms epoch)
}

function base64url(input: Buffer | string): string {
  return (typeof input === 'string' ? Buffer.from(input, 'utf8') : input).toString('base64url');
}

function signSegment(secret: string, headerB64: string, payloadB64: string): string {
  return createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest('base64url');
}

/**
 * Issue a signed token for a user. `now`/`ttlMs` injectable so expiry is
 * unit-testable. The token is the standard `header.payload.signature` of
 * base64url segments.
 */
export function signToken(
  user: Pick<UserRecord, 'id' | 'tenantId' | 'email' | 'role'>,
  secret: string,
  now: number,
  ttlMs: number = DEFAULT_TOKEN_TTL_MS,
): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload: JwtPayload = {
    sub: user.id,
    tid: user.tenantId,
    email: user.email,
    role: user.role,
    iat: now,
    exp: now + Math.max(0, ttlMs),
  };
  const payloadB64 = base64url(JSON.stringify(payload));
  const sig = signSegment(secret, header, payloadB64);
  return `${header}.${payloadB64}.${sig}`;
}

/**
 * Verify a token's signature + expiry and return the Principal, or null on any
 * problem (malformed, bad signature, expired). Never throws. Signature compare
 * is constant-time.
 */
export function verifyToken(
  token: string | null | undefined,
  secret: string,
  now: number,
): Principal | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sig] = parts as [string, string, string];

  const expected = signSegment(secret, headerB64, payloadB64);
  if (!constantTimeStringEquals(sig, expected)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (
    typeof p.sub !== 'string' ||
    typeof p.tid !== 'string' ||
    typeof p.email !== 'string' ||
    !isRole(p.role) ||
    typeof p.exp !== 'number' ||
    !Number.isFinite(p.exp)
  ) {
    return null;
  }
  if (now >= p.exp) return null; // expired
  return { userId: p.sub, tenantId: p.tid, email: p.email, role: p.role };
}

/** Constant-time string compare for equal-length base64url signatures. */
function constantTimeStringEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// Set operations (pure — never mutate the input set)
// ---------------------------------------------------------------------------

function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

/** Normalize an email for storage + lookup: trim + lowercase. */
export function normalizeEmail(email: string): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/** Create a tenant. Pure (aside from id RNG). */
export function createTenant(
  set: RbacSet,
  name: string,
  now: number,
): { set: RbacSet; tenant: TenantRecord } {
  const tenant: TenantRecord = {
    id: generateId('tnt'),
    name: typeof name === 'string' && name.length > 0 ? name.slice(0, 200) : 'default',
    createdAt: now,
  };
  return { set: { tenants: [...set.tenants, tenant], users: [...set.users] }, tenant };
}

export interface CreateUserInput {
  tenantId: string;
  email: string;
  password: string;
  role: Role;
}

/** Why a createUser call was rejected. */
export type CreateUserError =
  | 'invalid-email'
  | 'invalid-password'
  | 'invalid-role'
  | 'duplicate-email'
  | 'unknown-tenant'
  | 'limit-reached';

/**
 * Create a user. Enforces: globally-unique email, known tenant, non-empty
 * password, capacity limit. Returns either the next set + user, or an error
 * code (never throws). Pure aside from id RNG + crypto.
 */
export function createUser(
  set: RbacSet,
  input: CreateUserInput,
  now: number,
): { set: RbacSet; user: UserRecord } | { error: CreateUserError } {
  const email = normalizeEmail(input.email);
  if (email.length === 0 || !email.includes('@')) return { error: 'invalid-email' };
  if (typeof input.password !== 'string' || input.password.length < 8) {
    return { error: 'invalid-password' };
  }
  if (!isRole(input.role)) return { error: 'invalid-role' };
  if (set.users.length >= MAX_USERS) return { error: 'limit-reached' };
  if (!set.tenants.some((t) => t.id === input.tenantId)) return { error: 'unknown-tenant' };
  if (set.users.some((u) => u.email === email)) return { error: 'duplicate-email' };

  const { passwordHash, salt } = hashPassword(input.password);
  const user: UserRecord = {
    id: generateId('usr'),
    tenantId: input.tenantId,
    email,
    passwordHash,
    salt,
    role: input.role,
    createdAt: now,
  };
  return { set: { tenants: [...set.tenants], users: [...set.users, user] }, user };
}

/** Find a user by (globally-unique) email. Returns null if absent. */
export function findUserByEmail(set: RbacSet, email: string): UserRecord | null {
  const norm = normalizeEmail(email);
  return set.users.find((u) => u.email === norm) ?? null;
}

/**
 * Authenticate email+password. Returns the user on success, null otherwise.
 * Always runs a constant-time verify against SOME hash even when the email is
 * unknown, so timing doesn't reveal whether an email exists.
 */
export function authenticate(set: RbacSet, email: string, password: string): UserRecord | null {
  const user = findUserByEmail(set, email);
  if (!user) {
    // Dummy verify against a throwaway hash to equalize timing.
    verifyPassword(typeof password === 'string' ? password : '', DUMMY_HASH, DUMMY_SALT);
    return null;
  }
  return verifyPassword(password, user.passwordHash, user.salt) ? user : null;
}

// A fixed throwaway hash/salt for the unknown-email timing-equalization path.
const DUMMY_SALT = '00000000000000000000000000000000';
const DUMMY_HASH = scryptSync(' dummy', DUMMY_SALT, SCRYPT_KEYLEN).toString('hex');

/** Change a user's role. Returns next set + whether the user matched. Guards
 *  against demoting the last owner of a tenant (would orphan administration). */
export function setRole(
  set: RbacSet,
  userId: string,
  role: Role,
): { set: RbacSet; ok: boolean; error?: 'unknown-user' | 'last-owner' } {
  const user = set.users.find((u) => u.id === userId);
  if (!user) return { set, ok: false, error: 'unknown-user' };
  if (user.role === 'owner' && role !== 'owner' && isLastOwner(set, user)) {
    return { set, ok: false, error: 'last-owner' };
  }
  const users = set.users.map((u) => (u.id === userId ? { ...u, role } : u));
  return { set: { tenants: [...set.tenants], users }, ok: true };
}

/** Remove a user. Guards against removing the last owner of a tenant. */
export function removeUser(
  set: RbacSet,
  userId: string,
): { set: RbacSet; ok: boolean; error?: 'unknown-user' | 'last-owner' } {
  const user = set.users.find((u) => u.id === userId);
  if (!user) return { set, ok: false, error: 'unknown-user' };
  if (user.role === 'owner' && isLastOwner(set, user)) {
    return { set, ok: false, error: 'last-owner' };
  }
  const users = set.users.filter((u) => u.id !== userId);
  return { set: { tenants: [...set.tenants], users }, ok: true };
}

/** Is `user` the only owner of its tenant? */
function isLastOwner(set: RbacSet, user: UserRecord): boolean {
  const owners = set.users.filter((u) => u.tenantId === user.tenantId && u.role === 'owner');
  return owners.length <= 1;
}

/** Public-safe user listing, optionally scoped to one tenant. Never hash/salt. */
export function summarizeUsers(set: RbacSet, tenantId?: string): UserSummary[] {
  return set.users
    .filter((u) => tenantId === undefined || u.tenantId === tenantId)
    .map((u) => ({
      id: u.id,
      tenantId: u.tenantId,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
    }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

// ---------------------------------------------------------------------------
// Serialize / parse (SAFE — corrupt input never bricks auth)
// ---------------------------------------------------------------------------

export function serializeRbac(set: RbacSet): string {
  return JSON.stringify({ tenants: set.tenants, users: set.users });
}

/**
 * Parse a stored RBAC blob. SAFE: malformed input falls back to empty (which
 * means "not enforcing" — fail-open to the single-tenant dev default, never a
 * surprise lockout from a corrupt row). Drops malformed records and caps size.
 */
export function parseRbac(raw: string | null | undefined): RbacSet {
  if (raw === null || raw === undefined || raw.length === 0) return emptyRbac();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyRbac();
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return emptyRbac();
  const obj = parsed as Record<string, unknown>;
  const tenants = parseTenantArray(obj.tenants).slice(0, MAX_TENANTS);
  const users = parseUserArray(obj.users).slice(0, MAX_USERS);
  return { tenants, users };
}

function parseTenantArray(value: unknown): TenantRecord[] {
  if (!Array.isArray(value)) return [];
  const out: TenantRecord[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const o = entry as Record<string, unknown>;
    if (typeof o.id !== 'string' || o.id.length === 0) continue;
    if (typeof o.name !== 'string') continue;
    if (typeof o.createdAt !== 'number' || !Number.isFinite(o.createdAt)) continue;
    out.push({ id: o.id, name: o.name, createdAt: o.createdAt });
  }
  return out;
}

function parseUserArray(value: unknown): UserRecord[] {
  if (!Array.isArray(value)) return [];
  const out: UserRecord[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const o = entry as Record<string, unknown>;
    if (typeof o.id !== 'string' || o.id.length === 0) continue;
    if (typeof o.tenantId !== 'string' || o.tenantId.length === 0) continue;
    if (typeof o.email !== 'string' || o.email.length === 0) continue;
    if (typeof o.passwordHash !== 'string' || o.passwordHash.length === 0) continue;
    if (typeof o.salt !== 'string' || o.salt.length === 0) continue;
    if (!isRole(o.role)) continue;
    if (typeof o.createdAt !== 'number' || !Number.isFinite(o.createdAt)) continue;
    out.push({
      id: o.id,
      tenantId: o.tenantId,
      email: o.email,
      passwordHash: o.passwordHash,
      salt: o.salt,
      role: o.role,
      createdAt: o.createdAt,
    });
  }
  return out;
}
