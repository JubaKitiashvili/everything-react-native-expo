import { describe, expect, test } from 'vitest';
import {
  DEFAULT_REMOTE_CONFIG,
  cloneDefaultRemoteConfig,
  mergeRemoteConfig,
  parseRemoteConfig,
  serializeRemoteConfig,
  validateRemoteConfig,
  type RemoteConfig,
} from './remoteConfig.js';

describe('validateRemoteConfig', () => {
  test('accepts an empty object and yields all-default sections', () => {
    const result = validateRemoteConfig({});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.config.sampling).toEqual({});
    expect(result.config.piiRules).toEqual([]);
    expect(result.config.featureFlags).toEqual({});
    expect(result.config.updatedAt).toBe(0);
    expect(result.present).toEqual({ sampling: false, piiRules: false, featureFlags: false });
  });

  test('accepts a full valid config and reports sections present', () => {
    const result = validateRemoteConfig({
      sampling: { default: 0.5, crash: 1, log: 0.1 },
      piiRules: ['email', 'authorization'],
      featureFlags: { newPipeline: true, betaUi: false },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.config.sampling).toEqual({ default: 0.5, crash: 1, log: 0.1 });
    expect(result.config.piiRules).toEqual(['email', 'authorization']);
    expect(result.config.featureFlags).toEqual({ newPipeline: true, betaUi: false });
    expect(result.present).toEqual({ sampling: true, piiRules: true, featureFlags: true });
  });

  test('clamps sampling rates above 1 and below 0 instead of rejecting', () => {
    const result = validateRemoteConfig({ sampling: { a: 1.5, b: -0.3, c: 0.42 } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.config.sampling).toEqual({ a: 1, b: 0, c: 0.42 });
  });

  test('rejects a non-object input', () => {
    for (const bad of [null, undefined, 42, 'str', [], true]) {
      const result = validateRemoteConfig(bad);
      expect(result.ok).toBe(false);
    }
  });

  test('rejects an unknown top-level key', () => {
    const result = validateRemoteConfig({ sampling: {}, bogus: 1 });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.errors.some((e) => e.includes('unknown key'))).toBe(true);
  });

  test('rejects sampling that is not an object', () => {
    const result = validateRemoteConfig({ sampling: [0.5] });
    expect(result.ok).toBe(false);
  });

  test('rejects a non-finite / non-numeric sampling rate', () => {
    expect(validateRemoteConfig({ sampling: { a: 'x' } }).ok).toBe(false);
    expect(validateRemoteConfig({ sampling: { a: Number.NaN } }).ok).toBe(false);
    expect(validateRemoteConfig({ sampling: { a: Infinity } }).ok).toBe(false);
  });

  test('rejects piiRules that is not an array', () => {
    expect(validateRemoteConfig({ piiRules: 'email' }).ok).toBe(false);
    expect(validateRemoteConfig({ piiRules: { 0: 'email' } }).ok).toBe(false);
  });

  test('rejects non-string piiRules entries', () => {
    expect(validateRemoteConfig({ piiRules: ['ok', 5] }).ok).toBe(false);
  });

  test('de-dupes piiRules entries silently', () => {
    const result = validateRemoteConfig({ piiRules: ['email', 'email', 'token'] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.config.piiRules).toEqual(['email', 'token']);
  });

  test('rejects featureFlags that is not an object of booleans', () => {
    expect(validateRemoteConfig({ featureFlags: ['a'] }).ok).toBe(false);
    expect(validateRemoteConfig({ featureFlags: { a: 'yes' } }).ok).toBe(false);
    expect(validateRemoteConfig({ featureFlags: { a: 1 } }).ok).toBe(false);
  });

  test('rejects oversized collections', () => {
    const sampling: Record<string, number> = {};
    for (let i = 0; i < 300; i += 1) sampling[`t${i}`] = 0.5;
    expect(validateRemoteConfig({ sampling }).ok).toBe(false);

    const piiRules = Array.from({ length: 300 }, (_, i) => `r${i}`);
    expect(validateRemoteConfig({ piiRules }).ok).toBe(false);
  });

  test('rejects keys / rules with invalid length', () => {
    expect(validateRemoteConfig({ sampling: { '': 0.5 } }).ok).toBe(false);
    expect(validateRemoteConfig({ piiRules: [''] }).ok).toBe(false);
    expect(validateRemoteConfig({ piiRules: ['x'.repeat(600)] }).ok).toBe(false);
  });

  test('ignores caller-supplied updatedAt (always 0 from validate)', () => {
    const result = validateRemoteConfig({ sampling: {}, updatedAt: 999 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.config.updatedAt).toBe(0);
  });
});

describe('serializeRemoteConfig / parseRemoteConfig round-trip', () => {
  test('round-trips a populated config', () => {
    const config: RemoteConfig = {
      sampling: { default: 0.25, crash: 1 },
      piiRules: ['email'],
      featureFlags: { x: true },
      updatedAt: 1700000000000,
    };
    const round = parseRemoteConfig(serializeRemoteConfig(config));
    expect(round).toEqual(config);
  });

  test('parse falls back to defaults on null / empty / malformed input', () => {
    expect(parseRemoteConfig(null)).toEqual(cloneDefaultRemoteConfig());
    expect(parseRemoteConfig(undefined)).toEqual(cloneDefaultRemoteConfig());
    expect(parseRemoteConfig('')).toEqual(cloneDefaultRemoteConfig());
    expect(parseRemoteConfig('{ not json')).toEqual(cloneDefaultRemoteConfig());
  });

  test('parse repairs an out-of-range stored sampling rate', () => {
    const config = parseRemoteConfig(
      JSON.stringify({ sampling: { a: 5 }, piiRules: [], featureFlags: {}, updatedAt: 10 }),
    );
    expect(config.sampling).toEqual({ a: 1 });
    expect(config.updatedAt).toBe(10);
  });

  test('parse drops a structurally invalid stored blob back to defaults', () => {
    // An entirely wrong shape (unknown key) → validate fails → defaults.
    const config = parseRemoteConfig(JSON.stringify({ bogus: true, updatedAt: 42 }));
    // Falls back to a clean default config (updatedAt from the corrupt
    // blob is not trusted when the rest is invalid).
    expect(config.sampling).toEqual({});
    expect(config.piiRules).toEqual([]);
    expect(config.featureFlags).toEqual({});
  });

  test('parse preserves a valid stored updatedAt', () => {
    const config = parseRemoteConfig(
      JSON.stringify({ sampling: {}, piiRules: [], featureFlags: {}, updatedAt: 12345 }),
    );
    expect(config.updatedAt).toBe(12345);
  });
});

describe('mergeRemoteConfig', () => {
  const base: RemoteConfig = {
    sampling: { default: 0.5 },
    piiRules: ['email'],
    featureFlags: { a: true },
    updatedAt: 100,
  };

  test('replaces only sections marked present', () => {
    const patch: RemoteConfig = {
      sampling: {},
      piiRules: [],
      featureFlags: { b: false },
      updatedAt: 0,
    };
    const merged = mergeRemoteConfig(base, patch, {
      sampling: false,
      piiRules: false,
      featureFlags: true,
    });
    expect(merged.sampling).toEqual({ default: 0.5 }); // kept from base
    expect(merged.piiRules).toEqual(['email']); // kept from base
    expect(merged.featureFlags).toEqual({ b: false }); // replaced from patch
    expect(merged.updatedAt).toBe(100); // never from patch
  });

  test('an explicitly-present empty section clears it', () => {
    const patch: RemoteConfig = { sampling: {}, piiRules: [], featureFlags: {}, updatedAt: 0 };
    const merged = mergeRemoteConfig(base, patch, {
      sampling: true,
      piiRules: false,
      featureFlags: false,
    });
    expect(merged.sampling).toEqual({}); // cleared
    expect(merged.piiRules).toEqual(['email']); // kept
  });
});

describe('DEFAULT_REMOTE_CONFIG', () => {
  test('is frozen and matches a fresh clone', () => {
    expect(Object.isFrozen(DEFAULT_REMOTE_CONFIG)).toBe(true);
    expect(cloneDefaultRemoteConfig()).toEqual(DEFAULT_REMOTE_CONFIG);
  });
});
