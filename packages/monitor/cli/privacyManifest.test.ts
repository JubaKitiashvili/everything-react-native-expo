import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  analyzePrivacyManifest,
  analyzePrivacyManifestAtPath,
  parsePrivacyManifestArgs,
  readProjectDependencies,
  renderPrivacyManifest,
  renderPrivacyManifestHelp,
  runPrivacyManifestCommand,
  type CollectedDataType,
  type PrivacyManifest,
} from './privacyManifest';

// Helper: collect the dependencies attributed to a collected-data category.
function depsForCategory(manifest: PrivacyManifest, category: CollectedDataType): string[] {
  return manifest.collectedDataTypes.find((e) => e.category === category)?.dependencies ?? [];
}

function categories(manifest: PrivacyManifest): string[] {
  return manifest.collectedDataTypes.map((e) => e.category);
}

describe('analyzePrivacyManifest — known SDK mapping', () => {
  test('expo-location maps to the location data type', () => {
    const m = analyzePrivacyManifest(['expo-location']);
    expect(categories(m)).toEqual(['location']);
    expect(depsForCategory(m, 'location')).toEqual(['expo-location']);
    expect(m.unknown).toEqual([]);
  });

  test('expo-contacts maps to contacts', () => {
    const m = analyzePrivacyManifest(['expo-contacts']);
    expect(depsForCategory(m, 'contacts')).toEqual(['expo-contacts']);
  });

  test('expo-device maps to identifiers', () => {
    const m = analyzePrivacyManifest(['expo-device']);
    expect(depsForCategory(m, 'identifiers')).toEqual(['expo-device']);
  });

  test('expo-tracking-transparency maps to identifiers (tracking purpose)', () => {
    const m = analyzePrivacyManifest(['expo-tracking-transparency']);
    expect(depsForCategory(m, 'identifiers')).toEqual(['expo-tracking-transparency']);
  });

  test('a scoped firebase package matches the @react-native-firebase/ prefix', () => {
    const m = analyzePrivacyManifest(['@react-native-firebase/analytics']);
    // Firebase touches identifiers + usageData + diagnostics.
    expect(categories(m).sort()).toEqual(['diagnostics', 'identifiers', 'usageData']);
    expect(depsForCategory(m, 'identifiers')).toEqual(['@react-native-firebase/analytics']);
    expect(m.unknown).toEqual([]);
  });

  test('multiple firebase packages collapse onto shared categories', () => {
    const m = analyzePrivacyManifest([
      '@react-native-firebase/app',
      '@react-native-firebase/crashlytics',
    ]);
    expect(depsForCategory(m, 'diagnostics')).toEqual([
      '@react-native-firebase/app',
      '@react-native-firebase/crashlytics',
    ]);
  });
});

describe('analyzePrivacyManifest — required-reason APIs + tracking domains', () => {
  test('AsyncStorage is flagged as a UserDefaults required-reason API user', () => {
    const m = analyzePrivacyManifest(['@react-native-async-storage/async-storage']);
    expect(m.requiredReasonApis).toEqual([
      { api: 'userDefaults', dependencies: ['@react-native-async-storage/async-storage'] },
    ]);
    // No collected data — it only touches a required-reason API.
    expect(m.collectedDataTypes).toEqual([]);
  });

  test('expo-file-system reports file-timestamp + disk-space APIs, sorted', () => {
    const m = analyzePrivacyManifest(['expo-file-system']);
    expect(m.requiredReasonApis.map((e) => e.api)).toEqual(['diskSpace', 'fileTimestamp']);
  });

  test('analytics SDKs surface tracking domains attributed to their package', () => {
    const m = analyzePrivacyManifest(['@segment/analytics-react-native']);
    expect(m.trackingDomains).toEqual([
      { domain: 'api.segment.io', dependencies: ['@segment/analytics-react-native'] },
    ]);
  });
});

describe('analyzePrivacyManifest — unknown / unaudited deps', () => {
  test('unmapped dependencies are flagged as unknown, not silently dropped', () => {
    const m = analyzePrivacyManifest(['some-random-lib', 'react']);
    expect(m.unknown).toEqual(['react', 'some-random-lib']);
    expect(m.collectedDataTypes).toEqual([]);
    expect(m.requiredReasonApis).toEqual([]);
    expect(m.trackingDomains).toEqual([]);
  });

  test('a near-miss of a prefixed family without the trailing slash stays unknown', () => {
    // '@react-native-firebase' (no slash) is NOT a prefix match for
    // '@react-native-firebase/' — it must remain unaudited.
    const m = analyzePrivacyManifest(['@react-native-firebase']);
    expect(m.unknown).toEqual(['@react-native-firebase']);
  });

  test('a mixed project separates known categories from the unknown list', () => {
    const m = analyzePrivacyManifest(['expo-location', 'expo-router', 'lodash']);
    expect(depsForCategory(m, 'location')).toEqual(['expo-location']);
    expect(m.unknown).toEqual(['expo-router', 'lodash']);
  });
});

describe('analyzePrivacyManifest — edge cases + determinism', () => {
  test('empty input yields an empty, well-formed manifest', () => {
    const m = analyzePrivacyManifest([]);
    expect(m.collectedDataTypes).toEqual([]);
    expect(m.requiredReasonApis).toEqual([]);
    expect(m.trackingDomains).toEqual([]);
    expect(m.unknown).toEqual([]);
    expect(m.dependenciesScanned).toBe(0);
  });

  test('duplicate dependency names are deduped before mapping', () => {
    const m = analyzePrivacyManifest(['expo-location', 'expo-location']);
    expect(m.dependenciesScanned).toBe(1);
    expect(depsForCategory(m, 'location')).toEqual(['expo-location']);
  });

  test('blank dependency names are ignored', () => {
    const m = analyzePrivacyManifest(['', 'expo-location', '']);
    expect(m.dependenciesScanned).toBe(1);
  });

  test('output is deterministic regardless of input order', () => {
    const deps = ['expo-location', '@segment/analytics-react-native', 'zzz-unknown', 'aaa-unknown'];
    const forward = analyzePrivacyManifest(deps);
    const reversed = analyzePrivacyManifest([...deps].reverse());
    expect(forward).toEqual(reversed);
    // Categories and unknowns are sorted.
    expect(forward.unknown).toEqual(['aaa-unknown', 'zzz-unknown']);
    expect(categories(forward)).toEqual([...categories(forward)].sort());
  });
});

describe('parsePrivacyManifestArgs', () => {
  test('defaults to cwd, no json, no help', () => {
    const parsed = parsePrivacyManifestArgs([]);
    expect(parsed.json).toBe(false);
    expect(parsed.help).toBe(false);
    expect(parsed.path).toBe(process.cwd());
  });

  test('accepts a positional path and --json', () => {
    const parsed = parsePrivacyManifestArgs(['/some/app', '--json']);
    expect(parsed.path).toBe('/some/app');
    expect(parsed.json).toBe(true);
  });

  test('-h sets help', () => {
    expect(parsePrivacyManifestArgs(['-h']).help).toBe(true);
  });

  test('rejects unknown flags and extra positionals', () => {
    expect(() => parsePrivacyManifestArgs(['--bogus'])).toThrow(/Unknown argument/);
    expect(() => parsePrivacyManifestArgs(['/a', '/b'])).toThrow(/extra argument/);
  });
});

describe('renderPrivacyManifest', () => {
  test('renders categories, APIs, domains, and the unaudited list', () => {
    const manifest = analyzePrivacyManifest([
      'expo-location',
      '@segment/analytics-react-native',
      'mystery-lib',
    ]);
    const out = renderPrivacyManifest(manifest);
    expect(out).toContain('@erne/monitor privacy-manifest');
    expect(out).toContain('Location');
    expect(out).toContain('api.segment.io');
    expect(out).toContain('[?] mystery-lib');
    // The starter-set caveat must be visible.
    expect(out).toContain('NON-EXHAUSTIVE');
  });

  test('shows (none) placeholders for empty categories', () => {
    const out = renderPrivacyManifest(analyzePrivacyManifest([]));
    expect(out).toMatch(/Collected data types \(0\):\s+\(none from known SDKs\)/);
    expect(out).toMatch(/Required-reason APIs \(0\):\s+\(none from known SDKs\)/);
    expect(out).toMatch(/Tracking domains \(0\):\s+\(none from known SDKs\)/);
  });

  test('makes the unaudited dependency list a prominent first-class output', () => {
    const out = renderPrivacyManifest(analyzePrivacyManifest(['mystery-lib']));
    expect(out).toContain('Unaudited dependencies (1):');
    expect(out).toContain('UNVERIFIED');
    expect(out).toContain('[?] mystery-lib');
  });
});

describe('renderPrivacyManifestHelp', () => {
  test('documents path argument and flags', () => {
    const help = renderPrivacyManifestHelp();
    expect(help).toContain('[path]');
    expect(help).toContain('--json');
    expect(help).toContain('--help');
  });
});

describe('readProjectDependencies + analyzePrivacyManifestAtPath (disk)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-privacy-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('reads dependency + devDependency names from package.json', () => {
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({
        dependencies: { 'expo-location': '^17.0.0', react: '19.0.0' },
        devDependencies: { jest: '^29.0.0' },
      }),
    );
    const names = readProjectDependencies(tmp).sort();
    expect(names).toEqual(['expo-location', 'jest', 'react']);
  });

  test('returns an empty list when package.json is missing or malformed', () => {
    expect(readProjectDependencies(tmp)).toEqual([]);
    fs.writeFileSync(path.join(tmp, 'package.json'), 'not json{');
    expect(readProjectDependencies(tmp)).toEqual([]);
  });

  test('analyzePrivacyManifestAtPath maps the on-disk deps end-to-end', () => {
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({
        dependencies: { 'expo-location': '^17.0.0', 'mystery-lib': '1.0.0' },
      }),
    );
    const manifest = analyzePrivacyManifestAtPath(tmp);
    expect(manifest.collectedDataTypes.map((e) => e.category)).toEqual(['location']);
    expect(manifest.unknown).toEqual(['mystery-lib']);
  });
});

describe('runPrivacyManifestCommand', () => {
  function makeLogger() {
    const info: string[] = [];
    const error: string[] = [];
    return {
      info,
      error,
      logger: { info: (m: string) => info.push(m), error: (m: string) => error.push(m) },
    };
  }

  test('--help prints usage and exits 0 without analyzing', () => {
    const { info, logger } = makeLogger();
    const analyze = jest.fn();
    const code = runPrivacyManifestCommand(['--help'], { logger, analyze });
    expect(code).toBe(0);
    expect(analyze).not.toHaveBeenCalled();
    expect(info.join('\n')).toContain('Usage: npx @erne/monitor privacy-manifest');
  });

  test('runs the analyzer and prints a pretty report by default', () => {
    const { info, logger } = makeLogger();
    const manifest = analyzePrivacyManifest(['expo-location']);
    const analyze = jest.fn(() => manifest);
    const code = runPrivacyManifestCommand(['/app'], { logger, analyze });
    expect(code).toBe(0);
    expect(analyze).toHaveBeenCalledWith('/app');
    expect(info.join('\n')).toContain('Collected data types (1):');
  });

  test('--json emits machine-readable output', () => {
    const { info, logger } = makeLogger();
    const manifest = analyzePrivacyManifest(['expo-location', 'mystery-lib']);
    const analyze = jest.fn(() => manifest);
    const code = runPrivacyManifestCommand(['--json'], { logger, analyze });
    expect(code).toBe(0);
    const parsed = JSON.parse(info.join('\n')) as PrivacyManifest;
    expect(parsed.unknown).toEqual(['mystery-lib']);
  });

  test('reports a clear error and exits 1 when the analyzer throws', () => {
    const { error, logger } = makeLogger();
    const analyze = jest.fn(() => {
      throw new Error('ENOENT: no such directory');
    });
    const code = runPrivacyManifestCommand(['/missing'], { logger, analyze });
    expect(code).toBe(1);
    expect(error.some((l) => l.includes('ENOENT'))).toBe(true);
  });

  test('exits 1 on bad args', () => {
    const { error, logger } = makeLogger();
    const code = runPrivacyManifestCommand(['--nope'], { logger });
    expect(code).toBe(1);
    expect(error.some((l) => l.includes('Unknown argument'))).toBe(true);
  });
});
