/**
 * peerDependencies audit — keeps the semver ranges in package.json
 * honest. Every peer we declare should reflect an actual tested matrix:
 *
 *   - react              18.2.x–19.x              (React 19 adds ref-as-prop, Activity)
 *   - react-native       0.74–0.89                (New Arch mandatory since 0.82)
 *   - expo               SDK 51–56                (expo-modules-core 1.11+ required)
 *   - expo-sqlite        14+  (optional)          (EventStore persistence adapter)
 *   - expo-modules-core  1.11+                    (native module)
 *   - @expo/config-plugins 7+                     (prebuild plugin)
 *
 * If a consumer installs a version outside these ranges we'd rather
 * they see an npm peer warning than hit a runtime crash.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

type PackageJson = {
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  engines?: Record<string, string>;
};

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const pkg = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'),
) as PackageJson;

const EXPECTED_PEERS: Record<
  string,
  { range: string; optional: boolean; why: string }
> = {
  react: {
    range: '>=18.2.0 <20',
    optional: false,
    why: 'React 19 features (ref-as-prop, Activity) used; RN < 0.74 doesn\'t support 18.2.',
  },
  'react-native': {
    range: '>=0.74.0 <0.90',
    optional: false,
    why: 'New Architecture mandatory since 0.82 — our native modules rely on it.',
  },
  expo: {
    range: '>=51.0.0 <57',
    optional: true,
    why: 'Config plugin targets SDK 51-56; non-Expo RN apps work without this peer.',
  },
  'expo-sqlite': {
    range: '>=14.0.0 <17',
    optional: true,
    why: 'Optional EventStore persistence adapter — consumers can BYO backend.',
  },
  'expo-modules-core': {
    range: '>=1.11.0 <3',
    optional: true,
    why: 'Required when native module is wired; bare RN apps can live without it.',
  },
  '@expo/config-plugins': {
    range: '>=7.0.0 <10',
    optional: true,
    why: 'Only needed when consumers use the Expo config plugin; optional peer.',
  },
};

describe('peerDependencies audit', () => {
  it('declares every expected peer', () => {
    const declared = Object.keys(pkg.peerDependencies ?? {});
    for (const name of Object.keys(EXPECTED_PEERS)) {
      expect(declared).toContain(name);
    }
  });

  it('ranges match the tested matrix exactly', () => {
    for (const [name, expected] of Object.entries(EXPECTED_PEERS)) {
      expect(pkg.peerDependencies?.[name]).toBe(expected.range);
    }
  });

  it('marks optional peers as optional', () => {
    for (const [name, expected] of Object.entries(EXPECTED_PEERS)) {
      const isOptional =
        pkg.peerDependenciesMeta?.[name]?.optional === true;
      expect({ name, isOptional }).toEqual({
        name,
        isOptional: expected.optional,
      });
    }
  });

  it('has no undeclared peers in peerDependenciesMeta', () => {
    for (const name of Object.keys(pkg.peerDependenciesMeta ?? {})) {
      expect(pkg.peerDependencies?.[name]).toBeDefined();
    }
  });

  it('every peer range is a valid semver expression', () => {
    // Accepts 1-part (`<20`), 2-part (`<0.90`), or 3-part (`>=18.2.0`)
    // with optional pre-release tag. Matches npm semver's `<N` / `<N.M`
    // shorthand for "anything before major N" / "anything before major.minor N.M".
    const comparator = /^(\*|[<>]=?|\^|~)?\d+(\.\d+){0,2}([A-Za-z0-9.-]*)?$/;
    for (const range of Object.values(pkg.peerDependencies ?? {})) {
      for (const token of range.split(/\s+/)) {
        expect(token).toMatch(comparator);
      }
    }
  });

  it('every peer range has both lower and upper bound', () => {
    for (const [name, range] of Object.entries(pkg.peerDependencies ?? {})) {
      // Each range should contain at least one `>=` and one `<` so
      // consumers on a bleeding-edge major see a peer warning instead
      // of silently "working" against untested versions.
      expect({ name, range, hasLower: /(>=|\^|~)/.test(range) }).toEqual({
        name,
        range,
        hasLower: true,
      });
      expect({ name, range, hasUpper: /<\s*\d/.test(range) }).toEqual({
        name,
        range,
        hasUpper: true,
      });
    }
  });

  it('declares a Node engine floor that matches the tooling (Node 20+)', () => {
    expect(pkg.engines?.node).toBe('>=20');
  });
});
