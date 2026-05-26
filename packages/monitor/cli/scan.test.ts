import { Project } from 'ts-morph';
import {
  analyzeProject,
  buildReportFromFiles,
  parseScanArgs,
  renderScanHelp,
  renderScanReport,
  runScanCommand,
  type ScanReport,
} from './scan';

// Helper: build a ts-morph Project from in-memory { path: contents } files
// and run the pure analyzer over it — no filesystem touched.
function analyzeFixtures(files: Record<string, string>): ScanReport {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [p, src] of Object.entries(files)) {
    project.createSourceFile(p, src);
  }
  return analyzeProject(project.getSourceFiles());
}

describe('analyzeProject — signal detection', () => {
  test('detects expo-router navigation', () => {
    const report = analyzeFixtures({
      'app/_layout.tsx': `import { Stack } from 'expo-router';\nexport default function L(){ return <Stack/>; }`,
    });
    expect(report.detected.navigationLibrary).toBe('expo-router');
    expect(report.recommendations.some((r) => r.feature === 'navigation')).toBe(true);
  });

  test('detects react-navigation via @react-navigation/* prefix', () => {
    const report = analyzeFixtures({
      'src/Nav.tsx': `import { createStackNavigator } from '@react-navigation/stack';\nconst S = createStackNavigator();`,
    });
    expect(report.detected.navigationLibrary).toBe('react-navigation');
  });

  test('prefers expo-router when both navigators are present', () => {
    const report = analyzeFixtures({
      'a.ts': `import 'expo-router';`,
      'b.ts': `import '@react-navigation/native';`,
    });
    expect(report.detected.navigationLibrary).toBe('expo-router');
  });

  test('detects fetch() but not .prefetch()/refetch()', () => {
    const report = analyzeFixtures({
      'api.ts': `export async function load(){ return fetch('https://x.dev/api'); }`,
      'image.ts': `Image.prefetch('x'); query.refetch();`,
    });
    expect(report.detected.usesFetch).toBe(true);
    expect(report.recommendations.some((r) => r.feature === 'network')).toBe(true);
  });

  test('does not flag network when only prefetch/refetch appear', () => {
    const report = analyzeFixtures({
      'only.ts': `Image.prefetch('x'); const q = useQuery(); q.refetch();`,
    });
    expect(report.detected.usesFetch).toBe(false);
    expect(report.recommendations.some((r) => r.feature === 'network')).toBe(false);
  });

  test('detects axios import', () => {
    const report = analyzeFixtures({ 'client.ts': `import axios from 'axios';` });
    expect(report.detected.usesAxios).toBe(true);
    expect(report.recommendations.some((r) => r.feature === 'network')).toBe(true);
  });

  test('detects AsyncStorage, MMKV, and SecureStore', () => {
    const report = analyzeFixtures({
      'a.ts': `import AsyncStorage from '@react-native-async-storage/async-storage';`,
      'b.ts': `import { MMKV } from 'react-native-mmkv';`,
      'c.ts': `import * as SecureStore from 'expo-secure-store';`,
    });
    expect(report.detected.storage).toEqual({
      asyncStorage: true,
      mmkv: true,
      secureStore: true,
    });
    expect(report.recommendations.some((r) => r.feature === 'storage')).toBe(true);
  });

  test('detects <Image> JSX usage and expo-image import', () => {
    const jsx = analyzeFixtures({
      'Card.tsx': `import { Image } from 'react-native';\nexport const C = () => <Image source={{ uri: 'x' }} />;`,
    });
    expect(jsx.detected.usesImage).toBe(true);

    const expo = analyzeFixtures({ 'x.ts': `import { Image } from 'expo-image';` });
    expect(expo.detected.usesImage).toBe(true);
    expect(expo.recommendations.some((r) => r.feature === 'image')).toBe(true);
  });

  test('detects redux, zustand, and mobx state management', () => {
    const report = analyzeFixtures({
      'store.ts': `import { configureStore } from '@reduxjs/toolkit';`,
      'ui.ts': `import { create } from 'zustand';`,
      'obs.ts': `import { observable } from 'mobx';`,
    });
    expect(report.detected.stateManagement).toEqual({
      redux: true,
      zustand: true,
      mobx: true,
    });
    expect(report.recommendations.some((r) => r.feature === 'state')).toBe(true);
  });

  test('detects require() specifiers in JS files', () => {
    const report = analyzeFixtures({
      'metro.config.js': `const axios = require('axios');`,
    });
    expect(report.detected.usesAxios).toBe(true);
  });

  test('always recommends crash and reports files scanned', () => {
    const report = analyzeFixtures({ 'index.ts': `export const x = 1;` });
    expect(report.recommendations[0]?.feature).toBe('crash');
    expect(report.detected.filesScanned).toBe(1);
  });

  test('a clean project recommends only crash', () => {
    const report = analyzeFixtures({ 'pure.ts': `export const add = (a: number, b: number) => a + b;` });
    expect(report.recommendations.map((r) => r.feature)).toEqual(['crash']);
    expect(report.detected.navigationLibrary).toBeNull();
  });

  test('assigns overhead tiers per collector', () => {
    const report = analyzeFixtures({
      'all.ts': `import 'expo-router'; import axios from 'axios'; import { create } from 'zustand'; import { Image } from 'expo-image'; import { MMKV } from 'react-native-mmkv';`,
    });
    const tier = (f: string) =>
      report.recommendations.find((r) => r.feature === f)?.estimatedOverhead;
    expect(tier('crash')).toBe('minimal');
    expect(tier('navigation')).toBe('low');
    expect(tier('network')).toBe('moderate');
    expect(tier('image')).toBe('moderate');
    expect(tier('state')).toBe('high');
    expect(tier('storage')).toBe('low');
  });
});

describe('buildReportFromFiles', () => {
  test('analyzes raw file contents without ts-morph in the caller', () => {
    const report = buildReportFromFiles({
      'App.tsx': `import 'expo-router';`,
    });
    expect(report.detected.navigationLibrary).toBe('expo-router');
  });
});

describe('parseScanArgs', () => {
  test('defaults to cwd, no json, no help', () => {
    const parsed = parseScanArgs([]);
    expect(parsed.json).toBe(false);
    expect(parsed.help).toBe(false);
    expect(parsed.path).toBe(process.cwd());
  });

  test('accepts a positional path and --json', () => {
    const parsed = parseScanArgs(['/some/app', '--json']);
    expect(parsed.path).toBe('/some/app');
    expect(parsed.json).toBe(true);
  });

  test('-h sets help', () => {
    expect(parseScanArgs(['-h']).help).toBe(true);
  });

  test('rejects unknown flags and extra positionals', () => {
    expect(() => parseScanArgs(['--bogus'])).toThrow(/Unknown argument/);
    expect(() => parseScanArgs(['/a', '/b'])).toThrow(/extra argument/);
  });
});

describe('renderScanReport', () => {
  test('renders detected sections and recommendations', () => {
    const report = buildReportFromFiles({
      'a.ts': `import 'expo-router'; import axios from 'axios';`,
    });
    const out = renderScanReport(report);
    expect(out).toContain('@erne/monitor scan');
    expect(out).toContain('expo-router');
    expect(out).toContain('axios');
    expect(out).toContain('Recommended collectors:');
    expect(out).toContain('[+] navigation');
    expect(out).toContain('[+] network');
  });

  test('shows (none) for absent signals', () => {
    const report = buildReportFromFiles({ 'pure.ts': `export const x = 1;` });
    const out = renderScanReport(report);
    expect(out).toMatch(/Navigation:\s+\(none\)/);
    expect(out).toMatch(/Network:\s+\(none\)/);
  });
});

describe('runScanCommand', () => {
  function makeLogger() {
    const info: string[] = [];
    const error: string[] = [];
    return { info, error, logger: { info: (m: string) => info.push(m), error: (m: string) => error.push(m) } };
  }

  test('--help prints usage and exits 0 without analyzing', () => {
    const { info, logger } = makeLogger();
    const analyze = jest.fn();
    const code = runScanCommand(['--help'], { logger, analyze });
    expect(code).toBe(0);
    expect(analyze).not.toHaveBeenCalled();
    expect(info.join('\n')).toContain('Usage: npx @erne/monitor scan');
  });

  test('runs the analyzer and prints a pretty report by default', () => {
    const { info, logger } = makeLogger();
    const report = buildReportFromFiles({ 'a.ts': `import 'expo-router';` });
    const analyze = jest.fn(() => report);
    const code = runScanCommand(['/app'], { logger, analyze });
    expect(code).toBe(0);
    expect(analyze).toHaveBeenCalledWith('/app');
    expect(info.join('\n')).toContain('Recommended collectors:');
  });

  test('--json emits machine-readable output', () => {
    const { info, logger } = makeLogger();
    const report = buildReportFromFiles({ 'a.ts': `import axios from 'axios';` });
    const analyze = jest.fn(() => report);
    const code = runScanCommand(['--json'], { logger, analyze });
    expect(code).toBe(0);
    const parsed = JSON.parse(info.join('\n')) as ScanReport;
    expect(parsed.detected.usesAxios).toBe(true);
  });

  test('reports a clear error and exits 1 when the analyzer throws', () => {
    const { error, logger } = makeLogger();
    const analyze = jest.fn(() => {
      throw new Error('ENOENT: no such directory');
    });
    const code = runScanCommand(['/missing'], { logger, analyze });
    expect(code).toBe(1);
    expect(error.some((l) => l.includes('ENOENT'))).toBe(true);
  });

  test('exits 1 on bad args', () => {
    const { error, logger } = makeLogger();
    const code = runScanCommand(['--nope'], { logger });
    expect(code).toBe(1);
    expect(error.some((l) => l.includes('Unknown argument'))).toBe(true);
  });
});

describe('renderScanHelp', () => {
  test('documents path argument and flags', () => {
    const help = renderScanHelp();
    expect(help).toContain('[path]');
    expect(help).toContain('--json');
    expect(help).toContain('--help');
  });
});
