// `npx @erne/monitor scan [path]` — static analysis of a consumer's RN/Expo
// app source. We walk the project's TypeScript/JavaScript with `ts-morph`,
// look for usage signals (navigation lib, fetch/axios, AsyncStorage/MMKV,
// <Image>, redux/zustand, …) and recommend which ERNE collectors to enable
// plus a rough per-collector runtime-overhead estimate.
//
// The analysis core — `analyzeProject(sourceFiles)` — is a pure function over
// an in-memory `ts-morph` Project, so the whole detection matrix is unit
// testable with virtual source files (no disk, no real RN app). The CLI shell
// (`runScanCommand`) wires up argument parsing, a real on-disk `ts-morph`
// Project, JSON / pretty output, and an injectable logger for tests.

import { Project, type SourceFile, type ImportDeclaration } from 'ts-morph';

// ---------------------------------------------------------------------------
// Report model

/**
 * A collector key matches the canonical names accepted by
 * `MonitorConfig.collectors` (see src/core/Config.ts).
 */
export type CollectorFeature =
  | 'navigation'
  | 'network'
  | 'storage'
  | 'image'
  | 'state'
  | 'crash'
  | 'render'
  | 'frameDrop'
  | 'memory'
  | 'startup';

/** Coarse buckets for the runtime cost a collector adds when enabled. */
export type OverheadTier = 'minimal' | 'low' | 'moderate' | 'high';

export interface ScanRecommendation {
  /** Canonical collector key to enable in monitor.config. */
  feature: CollectorFeature;
  /** Human-readable why — references the concrete signal we found. */
  reason: string;
  /** Estimated runtime overhead bucket for this collector. */
  estimatedOverhead: OverheadTier;
}

export interface DetectedSignals {
  navigationLibrary: 'expo-router' | 'react-navigation' | null;
  usesFetch: boolean;
  usesAxios: boolean;
  storage: { asyncStorage: boolean; mmkv: boolean; secureStore: boolean };
  usesImage: boolean;
  stateManagement: { redux: boolean; zustand: boolean; mobx: boolean };
  filesScanned: number;
}

export interface ScanReport {
  recommendations: ScanRecommendation[];
  detected: DetectedSignals;
}

// ---------------------------------------------------------------------------
// Detection helpers — pure, operate on already-parsed source files.

interface MutableSignals {
  navExpoRouter: boolean;
  navReactNavigation: boolean;
  usesFetch: boolean;
  usesAxios: boolean;
  asyncStorage: boolean;
  mmkv: boolean;
  secureStore: boolean;
  usesImage: boolean;
  redux: boolean;
  zustand: boolean;
  mobx: boolean;
}

function emptySignals(): MutableSignals {
  return {
    navExpoRouter: false,
    navReactNavigation: false,
    usesFetch: false,
    usesAxios: false,
    asyncStorage: false,
    mmkv: false,
    secureStore: false,
    usesImage: false,
    redux: false,
    zustand: false,
    mobx: false,
  };
}

/**
 * Maps an import module specifier onto the signals it implies. Covers both
 * exact matches and prefix matches (e.g. `@react-navigation/*`).
 */
function applyModuleSignal(moduleSpecifier: string, s: MutableSignals): void {
  const m = moduleSpecifier;

  // Navigation
  if (m === 'expo-router' || m.startsWith('expo-router/')) s.navExpoRouter = true;
  if (m === '@react-navigation/native' || m.startsWith('@react-navigation/')) {
    s.navReactNavigation = true;
  }

  // Network
  if (m === 'axios') s.usesAxios = true;

  // Storage
  if (m === '@react-native-async-storage/async-storage') s.asyncStorage = true;
  if (m === 'react-native-mmkv') s.mmkv = true;
  if (m === 'expo-secure-store') s.secureStore = true;

  // State management
  if (m === 'redux' || m === '@reduxjs/toolkit' || m === 'react-redux') s.redux = true;
  if (m === 'zustand' || m.startsWith('zustand/')) s.zustand = true;
  if (m === 'mobx' || m === 'mobx-react' || m === 'mobx-react-lite') s.mobx = true;

  // Image — both core and expo-image count.
  if (m === 'expo-image') s.usesImage = true;
}

/** Pulls every import module specifier from a source file. */
function importSpecifiers(sf: SourceFile): string[] {
  const out: string[] = [];
  const decls: ImportDeclaration[] = sf.getImportDeclarations();
  for (const decl of decls) {
    out.push(decl.getModuleSpecifierValue());
  }
  // `require('x')` calls — common in babel.config and JS files.
  const text = sf.getFullText();
  const requireRe = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = requireRe.exec(text)) !== null) {
    if (match[1]) out.push(match[1]);
  }
  return out;
}

/**
 * Scans the raw text of a file for runtime-call signals that aren't carried
 * by imports: `fetch(`, JSX `<Image`, and named React Native `Image` use.
 */
function applyTextSignals(sf: SourceFile, s: MutableSignals): void {
  const text = sf.getFullText();

  // fetch( — global, no import. Avoid matching `.prefetch(` / `refetch(`
  // by requiring a non-word char (or start of string) before `fetch`.
  if (/(^|[^\w.])fetch\s*\(/.test(text)) s.usesFetch = true;

  // JSX <Image ...> or <Image.* — covers RN core Image and expo-image alike.
  if (/<Image[\s/>]/.test(text)) s.usesImage = true;
}

/**
 * Pure analysis core. Accepts the already-built `ts-morph` source files so
 * tests can feed virtual files with no filesystem.
 */
export function analyzeProject(sourceFiles: readonly SourceFile[]): ScanReport {
  const s = emptySignals();

  for (const sf of sourceFiles) {
    for (const spec of importSpecifiers(sf)) {
      applyModuleSignal(spec, s);
    }
    applyTextSignals(sf, s);
  }

  const detected: DetectedSignals = {
    navigationLibrary: s.navExpoRouter
      ? 'expo-router'
      : s.navReactNavigation
        ? 'react-navigation'
        : null,
    usesFetch: s.usesFetch,
    usesAxios: s.usesAxios,
    storage: {
      asyncStorage: s.asyncStorage,
      mmkv: s.mmkv,
      secureStore: s.secureStore,
    },
    usesImage: s.usesImage,
    stateManagement: { redux: s.redux, zustand: s.zustand, mobx: s.mobx },
    filesScanned: sourceFiles.length,
  };

  const recommendations = buildRecommendations(detected);
  return { recommendations, detected };
}

/**
 * Convenience analyzer over raw `{ path: contents }` file maps. Builds an
 * in-memory `ts-morph` Project so callers (and tests) never need to touch
 * disk or construct a Project themselves.
 */
export function buildReportFromFiles(files: Readonly<Record<string, string>>): ScanReport {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [p, src] of Object.entries(files)) {
    project.createSourceFile(p, src, { overwrite: true });
  }
  return analyzeProject(project.getSourceFiles());
}

function buildRecommendations(d: DetectedSignals): ScanRecommendation[] {
  const recs: ScanRecommendation[] = [];

  // crash is always recommended — it's the baseline value of the SDK and
  // costs almost nothing until something actually crashes.
  recs.push({
    feature: 'crash',
    reason: 'Crash reporting is the SDK baseline — enable it regardless of stack.',
    estimatedOverhead: 'minimal',
  });

  if (d.navigationLibrary) {
    recs.push({
      feature: 'navigation',
      reason: `Detected ${d.navigationLibrary} — NavigationCollector tracks screen transitions and time-to-interactive.`,
      estimatedOverhead: 'low',
    });
  }

  if (d.usesFetch || d.usesAxios) {
    const which = [d.usesFetch ? 'fetch' : null, d.usesAxios ? 'axios' : null]
      .filter(Boolean)
      .join(' + ');
    recs.push({
      feature: 'network',
      reason: `Detected ${which} usage — NetworkCollector captures request timing, status codes, and failures.`,
      estimatedOverhead: 'moderate',
    });
  }

  if (d.storage.asyncStorage || d.storage.mmkv || d.storage.secureStore) {
    const which = [
      d.storage.asyncStorage ? 'AsyncStorage' : null,
      d.storage.mmkv ? 'MMKV' : null,
      d.storage.secureStore ? 'expo-secure-store' : null,
    ]
      .filter(Boolean)
      .join(' + ');
    recs.push({
      feature: 'storage',
      reason: `Detected ${which} — StorageCollector flags slow reads/writes and oversized payloads.`,
      estimatedOverhead: 'low',
    });
  }

  if (d.usesImage) {
    recs.push({
      feature: 'image',
      reason: 'Detected <Image> usage — ImageCollector surfaces decode time and oversized source dimensions.',
      estimatedOverhead: 'moderate',
    });
  }

  if (d.stateManagement.redux || d.stateManagement.zustand || d.stateManagement.mobx) {
    const which = [
      d.stateManagement.redux ? 'Redux' : null,
      d.stateManagement.zustand ? 'Zustand' : null,
      d.stateManagement.mobx ? 'MobX' : null,
    ]
      .filter(Boolean)
      .join(' + ');
    recs.push({
      feature: 'state',
      reason: `Detected ${which} — StateCollector records action/selector churn and slow updates.`,
      estimatedOverhead: 'high',
    });
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Pretty renderer — pure string output (testable).

const OVERHEAD_LABEL: Record<OverheadTier, string> = {
  minimal: 'minimal (~0%)',
  low: 'low (~1%)',
  moderate: 'moderate (~2-4%)',
  high: 'high (~5%+)',
};

export function renderScanReport(report: ScanReport): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('@erne/monitor scan');
  lines.push(`Files scanned: ${report.detected.filesScanned}`);
  lines.push('');
  lines.push('Detected:');
  lines.push(
    `  Navigation:  ${report.detected.navigationLibrary ?? '(none)'}`,
  );
  const net = [
    report.detected.usesFetch ? 'fetch' : null,
    report.detected.usesAxios ? 'axios' : null,
  ].filter(Boolean);
  lines.push(`  Network:     ${net.length ? net.join(', ') : '(none)'}`);
  const stores = [
    report.detected.storage.asyncStorage ? 'AsyncStorage' : null,
    report.detected.storage.mmkv ? 'MMKV' : null,
    report.detected.storage.secureStore ? 'SecureStore' : null,
  ].filter(Boolean);
  lines.push(`  Storage:     ${stores.length ? stores.join(', ') : '(none)'}`);
  lines.push(`  Image:       ${report.detected.usesImage ? 'yes' : '(none)'}`);
  const states = [
    report.detected.stateManagement.redux ? 'Redux' : null,
    report.detected.stateManagement.zustand ? 'Zustand' : null,
    report.detected.stateManagement.mobx ? 'MobX' : null,
  ].filter(Boolean);
  lines.push(`  State:       ${states.length ? states.join(', ') : '(none)'}`);
  lines.push('');
  lines.push('Recommended collectors:');
  for (const rec of report.recommendations) {
    lines.push(`  [+] ${rec.feature}  —  overhead: ${OVERHEAD_LABEL[rec.estimatedOverhead]}`);
    lines.push(`      ${rec.reason}`);
  }
  lines.push('');
  lines.push(
    'Enable these in monitor.config under `collectors`. Run `npx @erne/monitor scan --json` for machine output.',
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI shell

export interface ParsedScanArgs {
  path: string;
  json: boolean;
  help: boolean;
}

const DEFAULT_GLOBS = ['**/*.{ts,tsx,js,jsx}'];
const IGNORE_GLOBS = [
  '!**/node_modules/**',
  '!**/dist/**',
  '!**/build/**',
  '!**/.expo/**',
  '!**/*.test.{ts,tsx,js,jsx}',
];

export function parseScanArgs(argv: readonly string[]): ParsedScanArgs {
  let path = process.cwd();
  let json = false;
  let help = false;
  let sawPath = false;

  for (const token of argv) {
    if (!token) continue;
    if (token === '--help' || token === '-h') {
      help = true;
      continue;
    }
    if (token === '--json') {
      json = true;
      continue;
    }
    if (token.startsWith('-')) {
      throw new Error(`Unknown argument: ${token}`);
    }
    if (sawPath) {
      throw new Error(`Unexpected extra argument: ${token}`);
    }
    path = token;
    sawPath = true;
  }

  return { path, json, help };
}

export function renderScanHelp(): string {
  return [
    'Usage: npx @erne/monitor scan [path] [flags]',
    '',
    'Statically analyses a React Native / Expo app and recommends which',
    'ERNE collectors to enable, with a per-collector overhead estimate.',
    '',
    'Arguments:',
    '  path           Project root to scan (default: current directory)',
    '',
    'Flags:',
    '  --json         Emit the structured report as JSON',
    '  -h, --help     Show this message',
  ].join('\n');
}

export interface ScanCliDeps {
  logger?: { info: (msg: string) => void; error: (msg: string) => void };
  /**
   * Injectable analyzer. Defaults to building a real on-disk `ts-morph`
   * Project rooted at the given path. Tests pass a stub to avoid disk I/O.
   */
  analyze?: (projectPath: string) => ScanReport;
}

/**
 * Builds a `ts-morph` Project from the real filesystem and runs
 * `analyzeProject`. Skips type-checking config (`skipFileDependencyResolution`
 * + no tsconfig) for speed — we only need the syntax tree.
 */
export function analyzeProjectAtPath(projectPath: string): ScanReport {
  const project = new Project({
    skipFileDependencyResolution: true,
    skipLoadingLibFiles: true,
    compilerOptions: { allowJs: true, noEmit: true },
  });
  project.addSourceFilesAtPaths([
    ...DEFAULT_GLOBS.map((g) => `${projectPath}/${g}`),
    ...IGNORE_GLOBS.map((g) => (g.startsWith('!') ? `!${projectPath}/${g.slice(1)}` : g)),
  ]);
  return analyzeProject(project.getSourceFiles());
}

export function runScanCommand(argv: readonly string[], deps: ScanCliDeps = {}): number {
  const logger = deps.logger ?? {
    info: (msg: string) => console.log(msg),
    error: (msg: string) => console.error(msg),
  };

  let parsed: ParsedScanArgs;
  try {
    parsed = parseScanArgs(argv);
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
    logger.error(renderScanHelp());
    return 1;
  }

  if (parsed.help) {
    logger.info(renderScanHelp());
    return 0;
  }

  const analyze = deps.analyze ?? analyzeProjectAtPath;
  let report: ScanReport;
  try {
    report = analyze(parsed.path);
  } catch (err) {
    logger.error(
      '[@erne/monitor] scan failed: ' + (err instanceof Error ? err.message : String(err)),
    );
    return 1;
  }

  if (parsed.json) {
    logger.info(JSON.stringify(report, null, 2));
  } else {
    logger.info(renderScanReport(report));
  }
  return 0;
}
