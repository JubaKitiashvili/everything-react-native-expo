import {
  DEFAULT_REMOTE_CONFIG,
  validateRemoteConfig,
  remoteConfigEquals,
  type RemoteConfig,
} from './RemoteConfig';

describe('validateRemoteConfig', () => {
  it('returns defaults for non-object input', () => {
    for (const input of [null, undefined, 42, 'x', [], true]) {
      const c = validateRemoteConfig(input);
      expect(c.sampling).toEqual({});
      expect(c.piiRules).toEqual([]);
      expect(c.featureFlags).toEqual({});
      expect(c.updatedAt).toBe(0);
    }
  });

  it('accepts a fully-formed config', () => {
    const c = validateRemoteConfig({
      sampling: { network: 0.5, default: 0.1 },
      piiRules: ['email', '\\d{3}'],
      featureFlags: { render: false, network: true },
      updatedAt: 1700,
    });
    expect(c.sampling).toEqual({ network: 0.5, default: 0.1 });
    expect(c.piiRules).toEqual(['email', '\\d{3}']);
    expect(c.featureFlags).toEqual({ render: false, network: true });
    expect(c.updatedAt).toBe(1700);
  });

  it('clamps sampling rates into [0,1] rather than rejecting', () => {
    const c = validateRemoteConfig({
      sampling: { a: 1.7, b: -0.5, c: 0.3 },
    });
    expect(c.sampling).toEqual({ a: 1, b: 0, c: 0.3 });
  });

  it('drops non-finite / non-number sampling rates', () => {
    const c = validateRemoteConfig({
      sampling: { good: 0.4, nan: NaN, inf: Infinity, str: '0.5' },
    });
    expect(c.sampling).toEqual({ good: 0.4 });
  });

  it('drops a malformed sampling section entirely', () => {
    expect(validateRemoteConfig({ sampling: 'nope' }).sampling).toEqual({});
    expect(validateRemoteConfig({ sampling: [1, 2] }).sampling).toEqual({});
  });

  it('de-dupes piiRules and drops non-strings / bad lengths', () => {
    const c = validateRemoteConfig({
      piiRules: ['email', 'email', 42, '', 'phone'],
    });
    expect(c.piiRules).toEqual(['email', 'phone']);
  });

  it('drops a malformed piiRules section', () => {
    expect(validateRemoteConfig({ piiRules: 'email' }).piiRules).toEqual([]);
  });

  it('keeps only boolean feature flags', () => {
    const c = validateRemoteConfig({
      featureFlags: { on: true, off: false, weird: 1, str: 'yes' },
    });
    expect(c.featureFlags).toEqual({ on: true, off: false });
  });

  it('ignores unknown top-level keys without failing', () => {
    const c = validateRemoteConfig({
      sampling: { x: 0.2 },
      bogus: { hi: 1 },
    });
    expect(c.sampling).toEqual({ x: 0.2 });
  });

  it('reads through a valid updatedAt and rejects bad ones', () => {
    expect(validateRemoteConfig({ updatedAt: 999 }).updatedAt).toBe(999);
    expect(validateRemoteConfig({ updatedAt: -1 }).updatedAt).toBe(0);
    expect(validateRemoteConfig({ updatedAt: NaN }).updatedAt).toBe(0);
    expect(validateRemoteConfig({ updatedAt: 'x' }).updatedAt).toBe(0);
  });

  it('caps oversized sections (drops them rather than pinning memory)', () => {
    const sampling: Record<string, number> = {};
    for (let i = 0; i < 300; i++) sampling[`k${i}`] = 0.5;
    expect(validateRemoteConfig({ sampling }).sampling).toEqual({});

    const piiRules = Array.from({ length: 300 }, (_, i) => `r${i}`);
    expect(validateRemoteConfig({ piiRules }).piiRules).toEqual([]);
  });

  it('never throws for any input', () => {
    const inputs: unknown[] = [
      Symbol('x'),
      () => 0,
      { sampling: { '': 1 } },
      { featureFlags: { '': true } },
      { piiRules: ['x'.repeat(1000)] },
    ];
    for (const input of inputs) {
      expect(() => validateRemoteConfig(input)).not.toThrow();
    }
  });

  it('returns a frozen config (immutable)', () => {
    const c = validateRemoteConfig({ sampling: { x: 0.5 } });
    expect(Object.isFrozen(c)).toBe(true);
    expect(Object.isFrozen(c.sampling)).toBe(true);
  });
});

describe('remoteConfigEquals', () => {
  const base: RemoteConfig = validateRemoteConfig({
    sampling: { a: 0.5 },
    piiRules: ['email'],
    featureFlags: { render: true },
    updatedAt: 100,
  });

  it('is true for identical effective config (ignoring updatedAt)', () => {
    const other = validateRemoteConfig({
      sampling: { a: 0.5 },
      piiRules: ['email'],
      featureFlags: { render: true },
      updatedAt: 999, // different timestamp
    });
    expect(remoteConfigEquals(base, other)).toBe(true);
  });

  it('detects sampling, piiRules, and flag differences', () => {
    expect(
      remoteConfigEquals(base, validateRemoteConfig({ sampling: { a: 0.6 }, piiRules: ['email'], featureFlags: { render: true } })),
    ).toBe(false);
    expect(
      remoteConfigEquals(base, validateRemoteConfig({ sampling: { a: 0.5 }, piiRules: ['phone'], featureFlags: { render: true } })),
    ).toBe(false);
    expect(
      remoteConfigEquals(base, validateRemoteConfig({ sampling: { a: 0.5 }, piiRules: ['email'], featureFlags: { render: false } })),
    ).toBe(false);
  });

  it('treats the frozen DEFAULT as equal to a fresh default', () => {
    expect(remoteConfigEquals(DEFAULT_REMOTE_CONFIG, validateRemoteConfig({}))).toBe(true);
  });
});
