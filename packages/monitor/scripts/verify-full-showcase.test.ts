/**
 * Structural check for `examples/full-showcase`. Mirrors the
 * minimal-demo test — asserts every file exists, dependencies pin the
 * tested RN matrix, MonitorProvider is wired, and each tab surfaces
 * the SDK features the README advertises.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const SHOWCASE = path.resolve(__dirname, '..', 'examples', 'full-showcase');

function read(rel: string): string {
  return fs.readFileSync(path.join(SHOWCASE, rel), 'utf8');
}

describe('examples/full-showcase', () => {
  it('ships every file the README walks through', () => {
    for (const rel of [
      'package.json',
      'app.config.ts',
      'babel.config.js',
      'metro.config.js',
      'tsconfig.json',
      'README.md',
      '.gitignore',
      'app/_layout.tsx',
      'app/(tabs)/_layout.tsx',
      'app/(tabs)/index.tsx',
      'app/(tabs)/stats.tsx',
      'app/(tabs)/settings.tsx',
      'app/detail/[id].tsx',
    ]) {
      expect(fs.existsSync(path.join(SHOWCASE, rel))).toBe(true);
    }
  });

  it('pins SDK 55 / RN 0.83 / React 19 and pulls in FlashList + zustand + expo-image + expo-sqlite', () => {
    const pkg = JSON.parse(read('package.json')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies.expo).toMatch(/~?55\./);
    expect(pkg.dependencies['react-native']).toMatch(/^0\.83/);
    expect(pkg.dependencies.react).toMatch(/^19\./);
    expect(pkg.dependencies['@shopify/flash-list']).toBeDefined();
    expect(pkg.dependencies.zustand).toBeDefined();
    expect(pkg.dependencies['expo-image']).toBeDefined();
    expect(pkg.dependencies['expo-sqlite']).toBeDefined();
    expect(pkg.dependencies['@erne/monitor']).toBeDefined();
  });

  it('app.config.ts registers the SDK plugin + expo-sqlite + expo-router', () => {
    const src = read('app.config.ts');
    expect(src).toMatch(/@erne\/monitor\/plugin/);
    expect(src).toMatch(/expo-router/);
    expect(src).toMatch(/expo-sqlite/);
    expect(src).toMatch(/newArchEnabled:\s*true/);
    expect(src).toMatch(/bundleIdentifier:\s*'dev\.erne\.monitor\.showcase'/);
  });

  it('root layout wires MonitorProvider with full collectors + dashboard URL', () => {
    const src = read('app/_layout.tsx');
    expect(src).toMatch(
      /import\s+{[^}]*MonitorProvider[^}]*defineMonitorConfig[^}]*}\s+from\s+'@erne\/monitor'/,
    );
    expect(src).toMatch(/exposeGlobal/);
    expect(src).toMatch(/dashboardUrl/);
    expect(src).toMatch(/replay/);
    expect(src).toMatch(/activity/);
  });

  it('tabs layout declares 3 tabs (index / stats / settings)', () => {
    const src = read('app/(tabs)/_layout.tsx');
    expect(src).toMatch(/name="index"/);
    expect(src).toMatch(/name="stats"/);
    expect(src).toMatch(/name="settings"/);
  });

  it('feed screen uses FlashList + expo-image + real fetch for telemetry', () => {
    const src = read('app/(tabs)/index.tsx');
    expect(src).toMatch(/FlashList/);
    expect(src).toMatch(/from\s+'expo-image'/);
    expect(src).toMatch(/fetch\(/);
    // Must push to detail screen so NavigationCollector sees it.
    expect(src).toMatch(/\/detail\//);
  });

  it('stats screen reads globalThis.__ERNE_MONITOR__ and polls every second', () => {
    const src = read('app/(tabs)/stats.tsx');
    expect(src).toMatch(/__ERNE_MONITOR__/);
    expect(src).toMatch(/setInterval\([^)]*1000\)/);
    expect(src).toMatch(/getRecentErrors/);
  });

  it('settings screen exposes consent toggles + DSAR flow + chaos + network degrader', () => {
    const src = read('app/(tabs)/settings.tsx');
    expect(src).toMatch(/setConsent/);
    expect(src).toMatch(/exportUserData/);
    expect(src).toMatch(/deleteUserData/);
    expect(src).toMatch(/CrashInjector/);
    expect(src).toMatch(/NetworkDegrader/);
  });

  it('detail screen exercises Suspense and has a render-storm button', () => {
    const src = read('app/detail/[id].tsx');
    expect(src).toMatch(/<Suspense/);
    expect(src).toMatch(/Force Re-render Storm/);
  });

  it('README advertises the dashboard integration + tabs + Reassure baseline', () => {
    const readme = read('README.md');
    expect(readme).toMatch(/Feed/);
    expect(readme).toMatch(/Live Stats/);
    expect(readme).toMatch(/Settings/);
    expect(readme).toMatch(/ws:\/\/localhost:3333\/monitor/);
    expect(readme).toMatch(/reassure/i);
  });
});
