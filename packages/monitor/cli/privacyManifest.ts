// `npx @erne/monitor privacy-manifest [path]` — audits a project's
// dependencies and emits an Apple privacy-manifest-style report
// (App Store compliance, modeled on PrivacyInfo.xcprivacy).
//
// Apple requires apps and SDKs to declare three things in a privacy manifest:
//   - NSPrivacyCollectedDataTypes   — the kinds of user data collected
//   - NSPrivacyAccessedAPITypes     — "required reason" APIs that need a reason
//   - NSPrivacyTrackingDomains      — domains used for cross-app tracking
// This command maps a project's installed dependencies onto those categories
// using a CURATED, NON-EXHAUSTIVE known-SDK table (see KNOWN_SDKS below) and
// flags every dependency it does NOT recognise as `unknown` — an unaudited
// privacy posture that a human must review. The `unknown` list is a
// first-class output: an empty manifest is NOT proof of compliance.
//
// The analysis core — `analyzePrivacyManifest(deps)` — is a PURE function over
// an in-memory dependency-name list, so the whole mapping matrix is unit
// testable with virtual fixtures (no disk). The CLI shell
// (`runPrivacyManifestCommand`) wires up argument parsing, a real on-disk
// package.json read, JSON / pretty output, and an injectable logger for tests.

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Privacy categories (modeled on Apple's PrivacyInfo.xcprivacy)

/**
 * Apple `NSPrivacyCollectedDataType*` data categories. This is the subset most
 * relevant to RN/Expo apps — Apple's full enumeration is larger.
 */
export type CollectedDataType =
  | 'location'
  | 'contacts'
  | 'health'
  | 'financialInfo'
  | 'userContent'
  | 'browsingHistory'
  | 'searchHistory'
  | 'identifiers'
  | 'usageData'
  | 'diagnostics'
  | 'purchases'
  | 'contactInfo'
  | 'sensitiveInfo';

/**
 * Apple `NSPrivacyAccessedAPICategory*` "required reason" API groups — APIs
 * that require a declared reason code in the privacy manifest.
 */
export type RequiredReasonApi =
  | 'fileTimestamp'
  | 'systemBootTime'
  | 'diskSpace'
  | 'activeKeyboards'
  | 'userDefaults';

/** A purpose tag clarifying why an SDK touches a privacy category. */
export type TrackingPurpose = 'tracking' | 'thirdPartyAdvertising' | 'analytics';

/**
 * One entry in the curated known-SDK table. A dependency is matched either by
 * an exact package name or, when `prefix` is true, by a `name/`-prefix (for
 * scoped families like `@react-native-firebase/*`).
 */
export interface KnownSdk {
  /** Package name or scope prefix (e.g. '@react-native-firebase/'). */
  match: string;
  /** When true, `match` is treated as a prefix rather than an exact name. */
  prefix?: boolean;
  /** Apple collected-data categories this SDK is known to touch. */
  collects?: CollectedDataType[];
  /** Apple required-reason API groups this SDK is known to call. */
  requiredReasonApis?: RequiredReasonApi[];
  /** Tracking purpose, when the SDK is used for tracking/advertising. */
  purpose?: TrackingPurpose;
  /** Known tracking domains the SDK communicates with. */
  trackingDomains?: string[];
  /** Short human note for the report. */
  note: string;
}

// ---------------------------------------------------------------------------
// CURATED, NON-EXHAUSTIVE known-SDK table.
//
// This is a hand-maintained starter set covering common RN/Expo/analytics
// packages — it is intentionally INCOMPLETE. Any dependency not listed here is
// reported as `unknown` (unaudited), NOT as "collects nothing". Extend this
// table as your dependency set grows; always confirm against each SDK's own
// published privacy manifest before shipping.

export const KNOWN_SDKS: readonly KnownSdk[] = [
  // --- Device & sensors -----------------------------------------------------
  {
    match: 'expo-location',
    collects: ['location'],
    note: 'Precise/coarse location access.',
  },
  {
    match: 'react-native-geolocation-service',
    collects: ['location'],
    note: 'Background/foreground geolocation.',
  },
  {
    match: 'expo-contacts',
    collects: ['contacts'],
    note: 'Reads the device address book.',
  },
  {
    match: 'expo-device',
    collects: ['identifiers'],
    note: 'Exposes device model / OS identifiers.',
  },
  {
    match: 'expo-application',
    collects: ['identifiers'],
    requiredReasonApis: ['userDefaults'],
    note: 'Reads install IDs and app metadata.',
  },
  {
    match: 'react-native-device-info',
    collects: ['identifiers'],
    note: 'Unique device / vendor identifiers.',
  },

  // --- Tracking / ATT -------------------------------------------------------
  {
    match: 'expo-tracking-transparency',
    collects: ['identifiers'],
    purpose: 'tracking',
    note: 'App Tracking Transparency — IDFA access for cross-app tracking.',
  },
  {
    match: 'react-native-idfa-aaid',
    collects: ['identifiers'],
    purpose: 'tracking',
    note: 'Reads IDFA (iOS) / AAID (Android) advertising identifiers.',
  },

  // --- Analytics & crash ----------------------------------------------------
  {
    match: '@react-native-firebase/',
    prefix: true,
    collects: ['identifiers', 'usageData', 'diagnostics'],
    purpose: 'analytics',
    trackingDomains: ['firebase.googleapis.com', 'app-measurement.com'],
    note: 'Firebase family — analytics, crash, and identifier collection.',
  },
  {
    match: '@segment/analytics-react-native',
    collects: ['identifiers', 'usageData'],
    purpose: 'analytics',
    trackingDomains: ['api.segment.io'],
    note: 'Segment analytics pipeline.',
  },
  {
    match: '@amplitude/analytics-react-native',
    collects: ['identifiers', 'usageData'],
    purpose: 'analytics',
    trackingDomains: ['api2.amplitude.com'],
    note: 'Amplitude product analytics.',
  },
  {
    match: 'posthog-react-native',
    collects: ['identifiers', 'usageData'],
    purpose: 'analytics',
    trackingDomains: ['app.posthog.com'],
    note: 'PostHog product analytics.',
  },
  {
    match: 'mixpanel-react-native',
    collects: ['identifiers', 'usageData'],
    purpose: 'analytics',
    trackingDomains: ['api.mixpanel.com'],
    note: 'Mixpanel event analytics.',
  },
  {
    match: '@sentry/react-native',
    collects: ['diagnostics', 'identifiers'],
    purpose: 'analytics',
    trackingDomains: ['sentry.io'],
    note: 'Sentry crash + performance diagnostics.',
  },
  {
    match: 'react-native-appsflyer',
    collects: ['identifiers', 'usageData'],
    purpose: 'thirdPartyAdvertising',
    trackingDomains: ['appsflyer.com'],
    note: 'AppsFlyer attribution / advertising SDK.',
  },
  {
    match: 'react-native-facebook-sdk',
    prefix: true,
    collects: ['identifiers', 'usageData'],
    purpose: 'thirdPartyAdvertising',
    trackingDomains: ['graph.facebook.com'],
    note: 'Meta/Facebook SDK — advertising and attribution.',
  },
  {
    match: 'react-native-fbsdk-next',
    collects: ['identifiers', 'usageData'],
    purpose: 'thirdPartyAdvertising',
    trackingDomains: ['graph.facebook.com'],
    note: 'Meta/Facebook SDK — advertising and attribution.',
  },

  // --- Payments & purchases -------------------------------------------------
  {
    match: 'react-native-purchases',
    collects: ['purchases', 'identifiers'],
    purpose: 'analytics',
    trackingDomains: ['api.revenuecat.com'],
    note: 'RevenueCat — subscription / purchase tracking.',
  },
  {
    match: '@stripe/stripe-react-native',
    collects: ['financialInfo', 'purchases'],
    note: 'Stripe payments — financial information.',
  },

  // --- User content / media -------------------------------------------------
  {
    match: 'expo-camera',
    collects: ['userContent'],
    note: 'Camera capture — photos / video user content.',
  },
  {
    match: 'expo-media-library',
    collects: ['userContent'],
    note: 'Reads/writes the device photo library.',
  },
  {
    match: 'expo-image-picker',
    collects: ['userContent'],
    note: 'Picks photos/videos from the device.',
  },

  // --- Health ---------------------------------------------------------------
  {
    match: 'react-native-health',
    collects: ['health'],
    note: 'Apple HealthKit data.',
  },

  // --- Storage / required-reason APIs ---------------------------------------
  {
    match: '@react-native-async-storage/async-storage',
    requiredReasonApis: ['userDefaults'],
    note: 'Uses UserDefaults (required-reason API) for persistence.',
  },
  {
    match: 'expo-file-system',
    requiredReasonApis: ['fileTimestamp', 'diskSpace'],
    note: 'File timestamp + disk-space APIs (required-reason).',
  },
];

// ---------------------------------------------------------------------------
// Report model

/** A privacy category attributed to one or more dependencies. */
export interface CollectedDataEntry {
  category: CollectedDataType;
  /** Dependencies (sorted) that contribute this data type. */
  dependencies: string[];
}

export interface RequiredReasonApiEntry {
  api: RequiredReasonApi;
  dependencies: string[];
}

export interface TrackingDomainEntry {
  domain: string;
  dependencies: string[];
}

export interface PrivacyManifest {
  /** NSPrivacyCollectedDataTypes — sorted by category. */
  collectedDataTypes: CollectedDataEntry[];
  /** NSPrivacyAccessedAPITypes — sorted by API group. */
  requiredReasonApis: RequiredReasonApiEntry[];
  /** NSPrivacyTrackingDomains — sorted by domain. */
  trackingDomains: TrackingDomainEntry[];
  /** Dependencies with no known mapping — UNAUDITED privacy posture. */
  unknown: string[];
  /** Total dependencies considered (deduped). */
  dependenciesScanned: number;
}

// ---------------------------------------------------------------------------
// Matching

/** Returns the known-SDK entry that matches a dependency name, else null. */
function matchSdk(dep: string): KnownSdk | null {
  for (const sdk of KNOWN_SDKS) {
    if (sdk.prefix) {
      if (dep.startsWith(sdk.match)) return sdk;
    } else if (dep === sdk.match) {
      return sdk;
    }
  }
  return null;
}

/** Stable string sort (locale-independent, deterministic). */
function byString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Pure analysis core

/**
 * Maps a dependency-name list onto an Apple-style privacy manifest. Pure: no
 * disk, no network. Output is fully deterministic and sorted — dependency
 * order in the input does not affect the result.
 */
export function analyzePrivacyManifest(deps: readonly string[]): PrivacyManifest {
  // Dedupe while preserving nothing about order — we sort everything anyway.
  const unique = [...new Set(deps.filter((d) => d.length > 0))];

  // category → set of dependencies
  const collected = new Map<CollectedDataType, Set<string>>();
  const apis = new Map<RequiredReasonApi, Set<string>>();
  const domains = new Map<string, Set<string>>();
  const unknown: string[] = [];

  const add = <K>(map: Map<K, Set<string>>, key: K, dep: string): void => {
    let set = map.get(key);
    if (!set) {
      set = new Set<string>();
      map.set(key, set);
    }
    set.add(dep);
  };

  for (const dep of unique) {
    const sdk = matchSdk(dep);
    if (!sdk) {
      unknown.push(dep);
      continue;
    }
    for (const c of sdk.collects ?? []) add(collected, c, dep);
    for (const a of sdk.requiredReasonApis ?? []) add(apis, a, dep);
    for (const d of sdk.trackingDomains ?? []) add(domains, d, dep);
  }

  const collectedDataTypes: CollectedDataEntry[] = [...collected.entries()]
    .map(([category, set]) => ({
      category,
      dependencies: [...set].sort(byString),
    }))
    .sort((a, b) => byString(a.category, b.category));

  const requiredReasonApis: RequiredReasonApiEntry[] = [...apis.entries()]
    .map(([api, set]) => ({ api, dependencies: [...set].sort(byString) }))
    .sort((a, b) => byString(a.api, b.api));

  const trackingDomains: TrackingDomainEntry[] = [...domains.entries()]
    .map(([domain, set]) => ({ domain, dependencies: [...set].sort(byString) }))
    .sort((a, b) => byString(a.domain, b.domain));

  return {
    collectedDataTypes,
    requiredReasonApis,
    trackingDomains,
    unknown: unknown.sort(byString),
    dependenciesScanned: unique.length,
  };
}

// ---------------------------------------------------------------------------
// Pretty renderer (pure)

const DATA_TYPE_LABEL: Record<CollectedDataType, string> = {
  location: 'Location',
  contacts: 'Contacts',
  health: 'Health & Fitness',
  financialInfo: 'Financial Info',
  userContent: 'User Content',
  browsingHistory: 'Browsing History',
  searchHistory: 'Search History',
  identifiers: 'Identifiers',
  usageData: 'Usage Data',
  diagnostics: 'Diagnostics',
  purchases: 'Purchases',
  contactInfo: 'Contact Info',
  sensitiveInfo: 'Sensitive Info',
};

const API_LABEL: Record<RequiredReasonApi, string> = {
  fileTimestamp: 'File Timestamp',
  systemBootTime: 'System Boot Time',
  diskSpace: 'Disk Space',
  activeKeyboards: 'Active Keyboards',
  userDefaults: 'User Defaults',
};

export function renderPrivacyManifest(manifest: PrivacyManifest): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('@erne/monitor privacy-manifest');
  lines.push(`Dependencies scanned: ${manifest.dependenciesScanned}`);
  lines.push('');

  lines.push(`Collected data types (${manifest.collectedDataTypes.length}):`);
  if (manifest.collectedDataTypes.length === 0) {
    lines.push('  (none from known SDKs)');
  } else {
    for (const e of manifest.collectedDataTypes) {
      lines.push(`  ${DATA_TYPE_LABEL[e.category]}`);
      lines.push(`      ${e.dependencies.join(', ')}`);
    }
  }
  lines.push('');

  lines.push(`Required-reason APIs (${manifest.requiredReasonApis.length}):`);
  if (manifest.requiredReasonApis.length === 0) {
    lines.push('  (none from known SDKs)');
  } else {
    for (const e of manifest.requiredReasonApis) {
      lines.push(`  ${API_LABEL[e.api]}`);
      lines.push(`      ${e.dependencies.join(', ')}`);
    }
  }
  lines.push('');

  lines.push(`Tracking domains (${manifest.trackingDomains.length}):`);
  if (manifest.trackingDomains.length === 0) {
    lines.push('  (none from known SDKs)');
  } else {
    for (const e of manifest.trackingDomains) {
      lines.push(`  ${e.domain}`);
      lines.push(`      ${e.dependencies.join(', ')}`);
    }
  }
  lines.push('');

  lines.push(`Unaudited dependencies (${manifest.unknown.length}):`);
  if (manifest.unknown.length === 0) {
    lines.push('  (none — every dependency matched a known SDK)');
  } else {
    lines.push('  These are NOT in the known-SDK table — their privacy posture');
    lines.push('  is UNVERIFIED. Review each against its own privacy manifest:');
    for (const dep of manifest.unknown) {
      lines.push(`  [?] ${dep}`);
    }
  }
  lines.push('');
  lines.push(
    'NOTE: the known-SDK table is a curated, NON-EXHAUSTIVE starter set. An',
  );
  lines.push(
    '      empty manifest is not proof of compliance — confirm every SDK',
  );
  lines.push('      against its published PrivacyInfo.xcprivacy before shipping.');
  lines.push('');
  lines.push('Run `npx @erne/monitor privacy-manifest --json` for machine output.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI shell

export interface ParsedPrivacyManifestArgs {
  path: string;
  json: boolean;
  help: boolean;
}

export function parsePrivacyManifestArgs(
  argv: readonly string[],
): ParsedPrivacyManifestArgs {
  let projectPath = process.cwd();
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
    projectPath = token;
    sawPath = true;
  }

  return { path: projectPath, json, help };
}

export function renderPrivacyManifestHelp(): string {
  return [
    'Usage: npx @erne/monitor privacy-manifest [path] [flags]',
    '',
    "Audits a project's dependencies (package.json deps + devDeps) and emits",
    'an Apple privacy-manifest-style report (NSPrivacyCollectedDataTypes,',
    'NSPrivacyAccessedAPITypes, NSPrivacyTrackingDomains) for App Store review.',
    '',
    'Dependencies matched against a CURATED, NON-EXHAUSTIVE known-SDK table are',
    'categorised; every unrecognised dependency is flagged as unaudited.',
    '',
    'Arguments:',
    '  path           Project root to audit (default: current directory)',
    '',
    'Flags:',
    '  --json         Emit the structured manifest as JSON',
    '  -h, --help     Show this message',
  ].join('\n');
}

export interface PrivacyManifestCliDeps {
  logger?: { info: (msg: string) => void; error: (msg: string) => void };
  /**
   * Injectable analyzer. Defaults to reading package.json deps from disk and
   * running `analyzePrivacyManifest`. Tests pass a stub to avoid disk I/O.
   */
  analyze?: (projectPath: string) => PrivacyManifest;
}

/**
 * Reads dependency + devDependency names from a project's package.json.
 * Returns an empty list when package.json is missing or malformed (the caller
 * surfaces that as "0 dependencies scanned", not a crash).
 */
export function readProjectDependencies(projectPath: string): string[] {
  const pkgPath = path.join(projectPath, 'package.json');
  let text: string;
  try {
    text = fs.readFileSync(pkgPath, 'utf8');
  } catch {
    return [];
  }
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return [];
  }
  const deps = pkg.dependencies as Record<string, string> | undefined;
  const devDeps = pkg.devDependencies as Record<string, string> | undefined;
  const names = new Set<string>();
  if (deps) for (const name of Object.keys(deps)) names.add(name);
  if (devDeps) for (const name of Object.keys(devDeps)) names.add(name);
  return [...names];
}

/** Reads package.json deps from disk and runs `analyzePrivacyManifest`. */
export function analyzePrivacyManifestAtPath(projectPath: string): PrivacyManifest {
  return analyzePrivacyManifest(readProjectDependencies(projectPath));
}

export function runPrivacyManifestCommand(
  argv: readonly string[],
  deps: PrivacyManifestCliDeps = {},
): number {
  const logger = deps.logger ?? {
    info: (msg: string) => console.log(msg),
    error: (msg: string) => console.error(msg),
  };

  let parsed: ParsedPrivacyManifestArgs;
  try {
    parsed = parsePrivacyManifestArgs(argv);
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
    logger.error(renderPrivacyManifestHelp());
    return 1;
  }

  if (parsed.help) {
    logger.info(renderPrivacyManifestHelp());
    return 0;
  }

  const analyze = deps.analyze ?? analyzePrivacyManifestAtPath;
  let manifest: PrivacyManifest;
  try {
    manifest = analyze(parsed.path);
  } catch (err) {
    logger.error(
      '[@erne/monitor] privacy-manifest failed: ' +
        (err instanceof Error ? err.message : String(err)),
    );
    return 1;
  }

  if (parsed.json) {
    logger.info(JSON.stringify(manifest, null, 2));
  } else {
    logger.info(renderPrivacyManifest(manifest));
  }
  return 0;
}
