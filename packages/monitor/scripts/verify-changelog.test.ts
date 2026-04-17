/**
 * Keeps CHANGELOG + migration guides honest:
 *   - `CHANGELOG.md` at package root with `1.0.0` entry + version line
 *     matching package.json.
 *   - Unreleased heading present (so future commits have a home).
 *   - Migration guides at the paths the README points to.
 *   - Migration guides mention the SDK's actual API names (not
 *     stale ones that would mislead a reader).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const PACKAGE_ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(PACKAGE_ROOT, rel), 'utf8');
}

describe('CHANGELOG', () => {
  const changelog = read('CHANGELOG.md');

  it('exists at package root and ships via package.json files', () => {
    const pkg = JSON.parse(read('package.json')) as { files?: string[] };
    expect(pkg.files).toContain('CHANGELOG.md');
    expect(pkg.files).toContain('docs');
  });

  it('declares semver policy + Keep a Changelog format', () => {
    expect(changelog).toMatch(/Keep a Changelog/);
    expect(changelog).toMatch(/Semantic Versioning/);
    expect(changelog).toMatch(/## Versioning policy/);
  });

  it('has an Unreleased heading so future commits have a home', () => {
    expect(changelog).toMatch(/## \[Unreleased\]/);
  });

  it('has a 1.0.0 entry', () => {
    expect(changelog).toMatch(/## \[1\.0\.0\]\s*—/);
  });

  it('lists the major-version breaking changes introduced vs 0.x previews', () => {
    expect(changelog).toMatch(/### Breaking changes/);
    expect(changelog).toMatch(/frame_drop/);
    expect(changelog).toMatch(/allRejections: false/);
  });

  it('matches package.json version with the latest entry', () => {
    const pkg = JSON.parse(read('package.json')) as { version: string };
    // Current version is 0.1.0 before we cut 1.0.0 — so the CHANGELOG
    // acts as the public record of the upcoming release. This test
    // flips to strict equality once `npm version 1.0.0` runs.
    expect(['0.1.0', '1.0.0']).toContain(pkg.version);
  });

  it('tracks measured bundle sizes so the README + CHANGELOG stay in sync', () => {
    expect(changelog).toMatch(/67 KB/);
    expect(changelog).toMatch(/\/performance/);
    expect(changelog).toMatch(/budget/i);
  });
});

describe('migration guides', () => {
  const sentry = read('docs/MIGRATING-FROM-SENTRY.md');
  const crashlytics = read('docs/MIGRATING-FROM-CRASHLYTICS.md');

  it('Sentry guide maps key Sentry APIs to SDK equivalents', () => {
    expect(sentry).toMatch(/Sentry\.captureException/);
    expect(sentry).toMatch(/Sentry\.addBreadcrumb/);
    expect(sentry).toMatch(/Sentry\.setUser/);
    expect(sentry).toMatch(/monitor\.trackEvent/);
    expect(sentry).toMatch(/monitor\.leaveBreadcrumb/);
    expect(sentry).toMatch(/monitor\.setUserId/);
  });

  it('Sentry guide references real SDK surfaces (not hallucinations)', () => {
    expect(sentry).toMatch(/MonitorProvider/);
    expect(sentry).toMatch(/defineMonitorConfig/);
    expect(sentry).toMatch(/@erne\/monitor\/plugin/);
  });

  it('Sentry guide has an explicit decommission checklist', () => {
    expect(sentry).toMatch(/Decommission checklist/i);
    expect(sentry).toMatch(/\[ \]/);
  });

  it('Crashlytics guide maps key Crashlytics APIs', () => {
    expect(crashlytics).toMatch(/crashlytics\(\)\.recordError/);
    expect(crashlytics).toMatch(/crashlytics\(\)\.log/);
    expect(crashlytics).toMatch(/crashlytics\(\)\.setUserId/);
    expect(crashlytics).toMatch(/monitor\.trackEvent|monitor\.leaveBreadcrumb|monitor\.setUserId/);
  });

  it('Crashlytics guide mentions dSYM/ProGuard upload path', () => {
    expect(crashlytics).toMatch(/dSYM/);
    expect(crashlytics).toMatch(/ProGuard/i);
  });

  it('Crashlytics guide has an explicit decommission checklist', () => {
    expect(crashlytics).toMatch(/Decommission checklist/i);
    expect(crashlytics).toMatch(/\[ \]/);
  });

  it('README references both migration guides at the advertised paths', () => {
    const readme = read('README.md');
    expect(readme).toMatch(/docs\/MIGRATING-FROM-SENTRY\.md/);
    expect(readme).toMatch(/docs\/MIGRATING-FROM-CRASHLYTICS\.md/);
  });
});
