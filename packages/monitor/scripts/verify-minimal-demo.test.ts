/**
 * Structural check for `examples/minimal-demo`. We can't actually boot
 * an RN runtime from Jest, but we can verify the demo's files exist,
 * reference the right SDK entry points, and wire the config plugin.
 * If someone renames `@erne/monitor/testing` or the plugin entry, the
 * demo breaks — and so does this test.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const DEMO = path.resolve(__dirname, '..', 'examples', 'minimal-demo');

function read(rel: string): string {
  return fs.readFileSync(path.join(DEMO, rel), 'utf8');
}

describe('examples/minimal-demo', () => {
  it('ships every file the README instructs consumers to run', () => {
    for (const rel of [
      'package.json',
      'app.config.ts',
      'babel.config.js',
      'metro.config.js',
      'tsconfig.json',
      'app/_layout.tsx',
      'app/index.tsx',
      'README.md',
      '.gitignore',
    ]) {
      expect(fs.existsSync(path.join(DEMO, rel))).toBe(true);
    }
  });

  it('package.json pins an SDK 55 / RN 0.83 / React 19 matrix', () => {
    const pkg = JSON.parse(read('package.json')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.dependencies.expo).toMatch(/~?55\./);
    expect(pkg.dependencies['react-native']).toMatch(/^0\.83/);
    expect(pkg.dependencies.react).toMatch(/^19\./);
    expect(pkg.dependencies['@erne/monitor']).toBeDefined();
  });

  it('app.config.ts wires the SDK config plugin', () => {
    const src = read('app.config.ts');
    expect(src).toMatch(/@erne\/monitor\/plugin/);
    expect(src).toMatch(/newArchEnabled:\s*true/);
    expect(src).toMatch(/bundleIdentifier:\s*'dev\.erne\.monitor\.demo'/);
  });

  it('root layout wraps the app in <MonitorProvider exposeGlobal>', () => {
    const src = read('app/_layout.tsx');
    expect(src).toMatch(/import\s+{\s*MonitorProvider\s*}\s+from\s+'@erne\/monitor'/);
    expect(src).toMatch(/<MonitorProvider\s+exposeGlobal>/);
  });

  it('home screen imports testing helpers from @erne/monitor/testing', () => {
    const src = read('app/index.tsx');
    expect(src).toMatch(/@erne\/monitor\/testing/);
    expect(src).toMatch(/CrashInjector/);
    expect(src).toMatch(/NetworkDegrader/);
  });

  it('home screen exposes every button Maestro chaos flows tap on', () => {
    const src = read('app/index.tsx');
    for (const label of [
      'Trigger JS Crash',
      'Trigger Native Crash',
      'Trigger ANR (6s)',
      'Trigger Span Crash',
      'Trigger Crash Loop (5)',
      'Diagnostics Dump',
    ]) {
      expect(src).toContain(label);
    }
  });

  it('metro.config.js resolves @erne/monitor to the sibling workspace', () => {
    const src = read('metro.config.js');
    expect(src).toMatch(/watchFolders/);
    expect(src).toMatch(/nodeModulesPaths/);
    expect(src).toMatch(/disableHierarchicalLookup/);
  });

  it('tsconfig aliases @erne/monitor to the in-repo source', () => {
    const cfg = JSON.parse(read('tsconfig.json')) as {
      compilerOptions: { paths: Record<string, string[]> };
    };
    expect(cfg.compilerOptions.paths['@erne/monitor']).toEqual(['../../src']);
    expect(cfg.compilerOptions.paths['@erne/monitor/*']).toEqual([
      '../../src/*',
    ]);
  });

  it('.gitignore excludes generated native projects', () => {
    const ignore = read('.gitignore');
    expect(ignore).toMatch(/^ios\/$/m);
    expect(ignore).toMatch(/^android\/$/m);
    expect(ignore).toMatch(/node_modules/);
  });

  it('README advertises the Maestro chaos flow labels verbatim', () => {
    const readme = read('README.md');
    expect(readme).toMatch(/Trigger JS Crash/);
    expect(readme).toMatch(/Simulate Offline/);
    expect(readme).toMatch(/Diagnostics Dump/);
    expect(readme).toMatch(/__ERNE_MONITOR__/);
  });
});
