import { describe, expect, test } from 'vitest';
import {
  DEFAULT_TOKEN_TTL_MS,
  authenticate,
  createTenant,
  createUser,
  emptyRbac,
  findUserByEmail,
  hashPassword,
  isEnforcing,
  isRole,
  normalizeEmail,
  parseRbac,
  removeUser,
  roleSatisfies,
  serializeRbac,
  setRole,
  signToken,
  summarizeUsers,
  verifyPassword,
  verifyToken,
  type RbacSet,
} from './rbac.js';

const T0 = 1_700_000_000_000;
const SECRET = 'test-secret-please-ignore';

/** Build an enforcing set with one owner of one tenant. */
function seedOwner(now = T0): { set: RbacSet; tenantId: string; userId: string } {
  let set = emptyRbac();
  const t = createTenant(set, 'Acme', now);
  set = t.set;
  const u = createUser(set, { tenantId: t.tenant.id, email: 'Owner@Acme.io', password: 'hunter2pass', role: 'owner' }, now);
  if ('error' in u) throw new Error(`seed failed: ${u.error}`);
  return { set: u.set, tenantId: t.tenant.id, userId: u.user.id };
}

describe('role hierarchy', () => {
  test('isRole guards the three roles only', () => {
    expect(isRole('owner')).toBe(true);
    expect(isRole('member')).toBe(true);
    expect(isRole('viewer')).toBe(true);
    expect(isRole('admin')).toBe(false);
    expect(isRole(null)).toBe(false);
    expect(isRole(3)).toBe(false);
  });

  test('owner satisfies everything, viewer satisfies only viewer', () => {
    expect(roleSatisfies('owner', 'viewer')).toBe(true);
    expect(roleSatisfies('owner', 'member')).toBe(true);
    expect(roleSatisfies('owner', 'owner')).toBe(true);
    expect(roleSatisfies('member', 'viewer')).toBe(true);
    expect(roleSatisfies('member', 'owner')).toBe(false);
    expect(roleSatisfies('viewer', 'member')).toBe(false);
    expect(roleSatisfies('viewer', 'viewer')).toBe(true);
  });
});

describe('password hashing', () => {
  test('hash + verify round-trips, salts are unique per call', () => {
    const a = hashPassword('correct horse battery');
    const b = hashPassword('correct horse battery');
    expect(a.salt).not.toBe(b.salt); // random salt
    expect(a.passwordHash).not.toBe(b.passwordHash); // different salt → different hash
    expect(verifyPassword('correct horse battery', a.passwordHash, a.salt)).toBe(true);
    expect(verifyPassword('correct horse battery', b.passwordHash, b.salt)).toBe(true);
  });

  test('verify rejects wrong password + malformed inputs without throwing', () => {
    const { passwordHash, salt } = hashPassword('s3cret-password');
    expect(verifyPassword('wrong', passwordHash, salt)).toBe(false);
    expect(verifyPassword('s3cret-password', '', salt)).toBe(false);
    expect(verifyPassword('s3cret-password', passwordHash, '')).toBe(false);
    expect(verifyPassword('s3cret-password', 'not-hex-zzzz', salt)).toBe(false);
    // @ts-expect-error — exercising the runtime guard on non-string input
    expect(verifyPassword(undefined, passwordHash, salt)).toBe(false);
  });
});

describe('JWT sign/verify', () => {
  test('signs + verifies a token, recovering the principal', () => {
    const user = { id: 'usr_1', tenantId: 'tnt_1', email: 'a@b.io', role: 'member' as const };
    const token = signToken(user, SECRET, T0);
    const principal = verifyToken(token, SECRET, T0 + 1000);
    expect(principal).toEqual({ userId: 'usr_1', tenantId: 'tnt_1', email: 'a@b.io', role: 'member' });
  });

  test('rejects an expired token', () => {
    const user = { id: 'usr_1', tenantId: 'tnt_1', email: 'a@b.io', role: 'owner' as const };
    const token = signToken(user, SECRET, T0, 1000);
    expect(verifyToken(token, SECRET, T0 + 999)).not.toBeNull();
    expect(verifyToken(token, SECRET, T0 + 1000)).toBeNull(); // exactly at exp → expired
    expect(verifyToken(token, SECRET, T0 + 5000)).toBeNull();
  });

  test('rejects a tampered payload (signature mismatch)', () => {
    const user = { id: 'usr_1', tenantId: 'tnt_1', email: 'a@b.io', role: 'viewer' as const };
    const token = signToken(user, SECRET, T0);
    const [h, , s] = token.split('.');
    // Forge a payload claiming owner; keep the original signature.
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: 'usr_1', tid: 'tnt_1', email: 'a@b.io', role: 'owner', iat: T0, exp: T0 + DEFAULT_TOKEN_TTL_MS }),
    ).toString('base64url');
    const forged = `${h}.${forgedPayload}.${s}`;
    expect(verifyToken(forged, SECRET, T0 + 1)).toBeNull();
  });

  test('rejects a token signed with a different secret', () => {
    const user = { id: 'usr_1', tenantId: 'tnt_1', email: 'a@b.io', role: 'owner' as const };
    const token = signToken(user, SECRET, T0);
    expect(verifyToken(token, 'different-secret', T0 + 1)).toBeNull();
  });

  test('rejects malformed tokens without throwing', () => {
    expect(verifyToken(null, SECRET, T0)).toBeNull();
    expect(verifyToken(undefined, SECRET, T0)).toBeNull();
    expect(verifyToken('', SECRET, T0)).toBeNull();
    expect(verifyToken('only.two', SECRET, T0)).toBeNull();
    expect(verifyToken('a.b.c.d', SECRET, T0)).toBeNull();
    expect(verifyToken('notbase64!.notbase64!.notbase64!', SECRET, T0)).toBeNull();
  });
});

describe('enforcement gate', () => {
  test('empty set is not enforcing; one user flips it on', () => {
    expect(isEnforcing(emptyRbac())).toBe(false);
    const { set } = seedOwner();
    expect(isEnforcing(set)).toBe(true);
  });
});

describe('user management', () => {
  test('createUser normalizes email + is immutable on input set', () => {
    const before = emptyRbac();
    const t = createTenant(before, 'Acme', T0);
    const res = createUser(t.set, { tenantId: t.tenant.id, email: '  Mixed@Case.IO ', password: 'longenough', role: 'viewer' }, T0);
    expect('user' in res).toBe(true);
    if ('error' in res) throw new Error(res.error);
    expect(res.user.email).toBe('mixed@case.io');
    expect(t.set.users).toHaveLength(0); // input set untouched
  });

  test('rejects duplicate email globally', () => {
    const { set, tenantId } = seedOwner();
    const dup = createUser(set, { tenantId, email: 'owner@acme.io', password: 'anotherpass', role: 'member' }, T0);
    expect(dup).toEqual({ error: 'duplicate-email' });
  });

  test('rejects unknown tenant, short password, invalid email', () => {
    const { set, tenantId } = seedOwner();
    expect(createUser(set, { tenantId: 'tnt_nope', email: 'x@y.io', password: 'longenough', role: 'viewer' }, T0)).toEqual({ error: 'unknown-tenant' });
    expect(createUser(set, { tenantId, email: 'x@y.io', password: 'short', role: 'viewer' }, T0)).toEqual({ error: 'invalid-password' });
    expect(createUser(set, { tenantId, email: 'no-at-sign', password: 'longenough', role: 'viewer' }, T0)).toEqual({ error: 'invalid-email' });
  });

  test('findUserByEmail is case-insensitive', () => {
    const { set } = seedOwner();
    expect(findUserByEmail(set, 'OWNER@ACME.IO')?.email).toBe('owner@acme.io');
    expect(findUserByEmail(set, 'ghost@acme.io')).toBeNull();
  });
});

describe('authenticate', () => {
  test('accepts correct creds, rejects wrong password + unknown email', () => {
    const { set } = seedOwner();
    expect(authenticate(set, 'owner@acme.io', 'hunter2pass')?.role).toBe('owner');
    expect(authenticate(set, 'owner@acme.io', 'wrongpass')).toBeNull();
    expect(authenticate(set, 'ghost@acme.io', 'whatever')).toBeNull(); // unknown email → no throw
  });
});

describe('setRole / removeUser last-owner guard', () => {
  test('cannot demote or remove the only owner of a tenant', () => {
    const { set, userId } = seedOwner();
    expect(setRole(set, userId, 'viewer')).toMatchObject({ ok: false, error: 'last-owner' });
    expect(removeUser(set, userId)).toMatchObject({ ok: false, error: 'last-owner' });
  });

  test('can demote/remove an owner once a second owner exists', () => {
    const seeded = seedOwner();
    let set = seeded.set;
    const { tenantId, userId } = seeded;
    const second = createUser(set, { tenantId, email: 'owner2@acme.io', password: 'longenough', role: 'owner' }, T0);
    if ('error' in second) throw new Error(second.error);
    set = second.set;
    const demoted = setRole(set, userId, 'member');
    expect(demoted.ok).toBe(true);
    expect(demoted.set.users.find((u) => u.id === userId)?.role).toBe('member');
  });

  test('unknown user id is a no-op error', () => {
    const { set } = seedOwner();
    expect(setRole(set, 'usr_nope', 'viewer')).toMatchObject({ ok: false, error: 'unknown-user' });
    expect(removeUser(set, 'usr_nope')).toMatchObject({ ok: false, error: 'unknown-user' });
  });
});

describe('summarizeUsers', () => {
  test('omits secrets + scopes by tenant', () => {
    const seeded = seedOwner();
    let set = seeded.set;
    const { tenantId } = seeded;
    const t2 = createTenant(set, 'Beta', T0 + 1);
    set = t2.set;
    const other = createUser(set, { tenantId: t2.tenant.id, email: 'beta@beta.io', password: 'longenough', role: 'viewer' }, T0 + 2);
    if ('error' in other) throw new Error(other.error);
    set = other.set;

    const all = summarizeUsers(set);
    expect(all).toHaveLength(2);
    for (const u of all) {
      expect(u).not.toHaveProperty('passwordHash');
      expect(u).not.toHaveProperty('salt');
    }
    const scoped = summarizeUsers(set, tenantId);
    expect(scoped).toHaveLength(1);
    expect(scoped[0]?.email).toBe('owner@acme.io');
  });
});

describe('serialize / parse', () => {
  test('round-trips an enforcing set', () => {
    const { set } = seedOwner();
    const restored = parseRbac(serializeRbac(set));
    expect(restored).toEqual(set);
    expect(isEnforcing(restored)).toBe(true);
    // creds still verify after a storage round-trip
    expect(authenticate(restored, 'owner@acme.io', 'hunter2pass')).not.toBeNull();
  });

  test('SAFE: malformed / corrupt input falls back to empty (fail-open)', () => {
    expect(parseRbac(null)).toEqual(emptyRbac());
    expect(parseRbac('')).toEqual(emptyRbac());
    expect(parseRbac('not json')).toEqual(emptyRbac());
    expect(parseRbac('[1,2,3]')).toEqual(emptyRbac());
    expect(parseRbac('"a string"')).toEqual(emptyRbac());
    expect(isEnforcing(parseRbac('garbage'))).toBe(false);
  });

  test('drops malformed user/tenant records but keeps valid ones', () => {
    const blob = JSON.stringify({
      tenants: [
        { id: 'tnt_1', name: 'Acme', createdAt: T0 },
        { id: '', name: 'bad', createdAt: T0 }, // dropped — empty id
        { id: 'tnt_2', name: 'NoDate' }, // dropped — missing createdAt
      ],
      users: [
        { id: 'usr_1', tenantId: 'tnt_1', email: 'a@b.io', passwordHash: 'ab', salt: 'cd', role: 'owner', createdAt: T0 },
        { id: 'usr_2', tenantId: 'tnt_1', email: 'b@b.io', passwordHash: 'ab', salt: 'cd', role: 'wizard', createdAt: T0 }, // dropped — bad role
        { id: 'usr_3', tenantId: 'tnt_1', email: 'c@b.io', salt: 'cd', role: 'viewer', createdAt: T0 }, // dropped — no hash
      ],
    });
    const parsed = parseRbac(blob);
    expect(parsed.tenants.map((t) => t.id)).toEqual(['tnt_1']);
    expect(parsed.users.map((u) => u.id)).toEqual(['usr_1']);
  });

  test('normalizeEmail trims + lowercases, tolerates non-strings', () => {
    expect(normalizeEmail('  A@B.IO ')).toBe('a@b.io');
    // @ts-expect-error — runtime guard
    expect(normalizeEmail(undefined)).toBe('');
  });
});
