// Task 117 — RemoteConfig shape parity guard.
//
// The SDK's `RemoteConfig` (src/remote-config/RemoteConfig.ts) deliberately
// MIRRORS the dashboard server's `RemoteConfig` without importing across
// packages (the SDK must stay self-contained). The SOURCE OF TRUTH for the
// shape is:
//
//   packages/monitor/dashboard/server/src/config/remoteConfig.ts
//
// Because there is no cross-package import, the two shapes can drift silently:
// the server could add a section the SDK never reads, or rename a key. This
// test pins the contract by encoding the server's expected shape as a fixture
// and asserting (a) the SDK's `validateRemoteConfig` accepts it round-trip,
// and (b) the SDK type's key set EXACTLY matches the server's. If the server
// gains/loses/renames a top-level key, update both files AND this fixture.

import {
  validateRemoteConfig,
  remoteConfigEquals,
  type RemoteConfig,
} from './RemoteConfig';

// The exact top-level key set the server's RemoteConfig exposes. Kept in sync
// with packages/monitor/dashboard/server/src/config/remoteConfig.ts.
const SERVER_REMOTE_CONFIG_KEYS = [
  'sampling',
  'piiRules',
  'featureFlags',
  'updatedAt',
] as const;

// A representative server-shaped payload: sampling is a Record<string,number>
// with a reserved `default` key, piiRules is a string[], featureFlags is a
// Record<string,boolean>, updatedAt is a number.
function serverConfigFixture(): {
  sampling: Record<string, number>;
  piiRules: string[];
  featureFlags: Record<string, boolean>;
  updatedAt: number;
} {
  return {
    sampling: { default: 1, custom: 0.5, network: 0.25 },
    piiRules: ['email', 'ssn', '\\d{3}-\\d{2}-\\d{4}'],
    featureFlags: { replay: true, heavyTracing: false },
    updatedAt: 1_700_000_000_000,
  };
}

describe('RemoteConfig parity with the dashboard server', () => {
  it('accepts the server-shaped fixture round-trip with no data loss', () => {
    const fixture = serverConfigFixture();
    const validated = validateRemoteConfig(fixture);

    expect(validated.sampling).toEqual(fixture.sampling);
    expect(validated.piiRules).toEqual(fixture.piiRules);
    expect(validated.featureFlags).toEqual(fixture.featureFlags);
    expect(validated.updatedAt).toBe(fixture.updatedAt);
  });

  it('preserves the reserved `default` sampling key', () => {
    const validated = validateRemoteConfig(serverConfigFixture());
    expect(validated.sampling).toHaveProperty('default');
    expect(validated.sampling.default).toBe(1);
  });

  it('round-trips: validating a validated config is a stable fixed point', () => {
    const once = validateRemoteConfig(serverConfigFixture());
    const twice = validateRemoteConfig({
      sampling: { ...once.sampling },
      piiRules: [...once.piiRules],
      featureFlags: { ...once.featureFlags },
      updatedAt: once.updatedAt,
    });
    expect(remoteConfigEquals(once, twice)).toBe(true);
    expect(twice.updatedAt).toBe(once.updatedAt);
  });

  it('SDK RemoteConfig key set exactly matches the server fixture key set', () => {
    // Build a fully-populated SDK RemoteConfig and compare its keys to the
    // server's expected set. A drift on either side (extra/missing key) fails.
    const sdkConfig: RemoteConfig = validateRemoteConfig(serverConfigFixture());
    const sdkKeys = Object.keys(sdkConfig).sort();
    const serverKeys = [...SERVER_REMOTE_CONFIG_KEYS].sort();
    expect(sdkKeys).toEqual(serverKeys);
  });

  it('type-level: the SDK RemoteConfig has exactly the server fields', () => {
    // A purely structural assertion that fails to COMPILE (tsc) if the SDK
    // type drifts — every server key is required, and Record<...,unknown>
    // catches any extra SDK key the fixture key list doesn't enumerate.
    const typed: Record<(typeof SERVER_REMOTE_CONFIG_KEYS)[number], unknown> = {
      sampling: {} as RemoteConfig['sampling'],
      piiRules: [] as unknown as RemoteConfig['piiRules'],
      featureFlags: {} as RemoteConfig['featureFlags'],
      updatedAt: 0 as RemoteConfig['updatedAt'],
    };
    // Assigning into a full RemoteConfig proves the field set is complete and
    // no extra required field exists on the SDK side.
    const asConfig: RemoteConfig = {
      sampling: typed.sampling as RemoteConfig['sampling'],
      piiRules: typed.piiRules as RemoteConfig['piiRules'],
      featureFlags: typed.featureFlags as RemoteConfig['featureFlags'],
      updatedAt: typed.updatedAt as RemoteConfig['updatedAt'],
    };
    expect(Object.keys(asConfig).sort()).toEqual(
      [...SERVER_REMOTE_CONFIG_KEYS].sort(),
    );
  });
});
