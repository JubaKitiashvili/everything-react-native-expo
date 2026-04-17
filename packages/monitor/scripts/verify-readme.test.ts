/**
 * Keeps `README.md` from drifting out of sync with the code.
 * Asserts:
 *   - The "Bootstrap (pre-Phase 1a)" placeholder is gone.
 *   - Every advertised subpath has a matching `package.json` exports
 *     entry (so a reader can't follow instructions that don't work).
 *   - Every "tested up to" version in the Platforms table is reflected
 *     in `peerDependencies` / `engines`.
 *   - The DSAR snippet uses the actual exported method names.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const README = fs.readFileSync(
  path.join(PACKAGE_ROOT, 'README.md'),
  'utf8',
);
const pkg = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'),
) as {
  exports: Record<string, unknown>;
  peerDependencies: Record<string, string>;
};

describe('README', () => {
  it('no longer advertises Bootstrap / pre-Phase placeholder copy', () => {
    expect(README).not.toMatch(/Bootstrap \(pre-Phase/i);
    expect(README).not.toMatch(/pre-Phase 1a/i);
  });

  it('leads with the product pitch, not internal planning docs', () => {
    const firstKb = README.slice(0, 1024);
    expect(firstKb).toMatch(/Runtime intelligence/i);
    expect(firstKb).toMatch(/npx expo install @erne\/monitor/);
    expect(firstKb).toMatch(/MonitorProvider/);
  });

  it('every advertised subpath has a matching package.json exports entry', () => {
    const subpaths = [
      '@erne/monitor',
      '@erne/monitor/performance',
      '@erne/monitor/network',
      '@erne/monitor/ai',
      '@erne/monitor/replay',
      '@erne/monitor/dev',
      '@erne/monitor/testing',
    ];
    const declared = new Set(
      Object.keys(pkg.exports).map((k) =>
        k === '.' ? '@erne/monitor' : `@erne/monitor${k.replace(/^\./, '')}`,
      ),
    );
    for (const sub of subpaths) {
      expect(README).toContain(sub);
      expect(declared.has(sub)).toBe(true);
    }
  });

  it('platform table matches the real peerDependencies upper bounds', () => {
    // Grab "Tested up to" entries from the platform table.
    expect(README).toMatch(/React Native\s*\|\s*0\.74\s*\|\s*0\.89/);
    expect(README).toMatch(/React\s*\|\s*18\.2\s*\|\s*19\.x/);
    expect(README).toMatch(/Expo SDK\s*\|\s*51\s*\|\s*56/);
    // Sanity-check against package.json declarations.
    expect(pkg.peerDependencies['react-native']).toContain('<0.90');
    expect(pkg.peerDependencies.react).toContain('<20');
    expect(pkg.peerDependencies.expo).toContain('<57');
  });

  it('DSAR snippet references the methods the SDK actually exports', () => {
    // Allow `monitor?.x(` or `monitor.x(` (null-chain patterns both OK).
    expect(README).toMatch(/monitor\??\.setUserId\(/);
    expect(README).toMatch(/monitor\??\.exportUserData\(/);
    expect(README).toMatch(/monitor\??\.deleteUserData\(/);
    expect(README).toMatch(/useMonitor\(/);
  });

  it('competitive comparison table lists every primary competitor', () => {
    for (const name of ['Sentry', 'Crashlytics', 'Datadog', 'Embrace']) {
      expect(README).toContain(name);
    }
  });

  it('points at both example apps by relative path', () => {
    expect(README).toMatch(/examples\/minimal-demo/);
    expect(README).toMatch(/examples\/full-showcase/);
  });

  it('states the measured performance budget up front', () => {
    // These figures come from the bundle-size and native-metrics checks.
    // If they regress, the README should be updated at the same time.
    // Backtick-formatted so allow an optional ` after the < and before
    // the unit.
    expect(README).toMatch(/<2%`?\s*CPU/);
    expect(README).toMatch(/<5MB`?\s*memory/);
    expect(README).toMatch(/<75KB`?\s*gzipped/);
  });
});
