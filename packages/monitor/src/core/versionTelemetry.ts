/**
 * Task 117.72 — SDK version telemetry + upgrade nag.
 *
 * Tags outgoing events/sessions with the installed `@erne/monitor` version
 * and provides `checkForUpgrade(latest)` so the SDK (or dashboard) can warn
 * developers when they're running an outdated build, classifying the gap as
 * a major/minor/patch upgrade via a tiny dependency-free semver compare.
 */

/**
 * Installed SDK version.
 *
 * Kept in sync with `package.json#version`. The build step is expected to
 * replace this literal with the real version at publish time (see the
 * `scripts/` build pipeline — a future `inject-version` step writes the value
 * here, mirroring how native podspecs read the same field). Until that runs
 * we fall back to reading `package.json` via a guarded require so dev/test
 * still see a real number, and finally to this hardcoded default.
 *
 * IMPORTANT: this default must match `package.json#version`.
 */
export const SDK_VERSION: string = resolveSdkVersion('0.1.0');

/**
 * Resolves the SDK version. Tries the package.json (guarded so bundlers that
 * can't resolve JSON, or stripped release bundles, don't throw), else returns
 * the compiled-in fallback.
 */
function resolveSdkVersion(fallback: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('../../package.json') as { version?: unknown };
    if (typeof pkg.version === 'string' && pkg.version.length > 0) {
      return pkg.version;
    }
  } catch {
    // package.json not resolvable (e.g. tree-shaken release bundle) — fall back
  }
  return fallback;
}

export type UpgradeSeverity = 'major' | 'minor' | 'patch' | 'none';

export interface VersionContext {
  /** The installed SDK version. */
  sdkVersion: string;
}

export interface UpgradeCheck {
  /** Installed version. */
  current: string;
  /** Latest known version (the argument passed to checkForUpgrade). */
  latest: string;
  /** True when `latest` is strictly newer than `current`. */
  outdated: boolean;
  /** Magnitude of the gap, or 'none' when up to date / ahead. */
  severity: UpgradeSeverity;
}

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

/**
 * Parses a semver core (major.minor.patch). Pre-release / build metadata
 * (`-beta.1`, `+sha`) is stripped before comparison — we only nag on the
 * release line. Missing or non-numeric components default to 0 so loose
 * inputs like "1" or "1.2" still parse.
 */
function parseVersion(version: string): ParsedVersion {
  const core = String(version).trim().split('+')[0]?.split('-')[0] ?? '';
  const parts = core.split('.');
  const num = (i: number): number => {
    const raw = parts[i];
    const n = raw === undefined ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  return { major: num(0), minor: num(1), patch: num(2) };
}

/**
 * Compares two semver cores. Returns -1 when a < b, 0 when equal, 1 when
 * a > b. Dependency-free.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  return 0;
}

/**
 * Builds the version context attached to events/sessions. `current`
 * defaults to the installed `SDK_VERSION` but can be overridden (tests, or
 * a host that vendors the SDK).
 */
export function getVersionContext(current: string = SDK_VERSION): VersionContext {
  return { sdkVersion: current };
}

/**
 * Compares the installed version against the latest known version and
 * classifies the upgrade gap.
 *
 *   - severity 'major' when the major component is behind
 *   - 'minor' when major matches but minor is behind
 *   - 'patch' when major+minor match but patch is behind
 *   - 'none' when current is equal to or ahead of latest
 *
 * `current` defaults to the installed SDK version.
 */
export function checkForUpgrade(
  latestVersion: string,
  current: string = SDK_VERSION,
): UpgradeCheck {
  const cmp = compareVersions(current, latestVersion);
  if (cmp >= 0) {
    return {
      current,
      latest: latestVersion,
      outdated: false,
      severity: 'none',
    };
  }
  const pc = parseVersion(current);
  const pl = parseVersion(latestVersion);
  let severity: UpgradeSeverity;
  if (pc.major < pl.major) severity = 'major';
  else if (pc.minor < pl.minor) severity = 'minor';
  else severity = 'patch';
  return {
    current,
    latest: latestVersion,
    outdated: true,
    severity,
  };
}

/**
 * Merges the version context into an event/session metadata object under the
 * `sdk` key. Returns a new object — never mutates the input.
 */
export function withVersionContext<T extends Record<string, unknown>>(
  metadata: T,
  context: VersionContext = getVersionContext(),
): T & { sdk: VersionContext } {
  return { ...metadata, sdk: context };
}
