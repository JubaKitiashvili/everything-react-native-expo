import { runInit } from './init';
import { detectProject } from './detect-project';
import { patchAppEntryWithMonitorProvider } from './scaffold-provider';
import { patchBabelConfig } from './scaffold-babel';
import { renderMonitorConfig } from './scaffold-config';

function makeVfs(initial: Record<string, string>) {
  const store: Record<string, string> = { ...initial };
  return {
    store,
    existsSync: (p: string) => Object.prototype.hasOwnProperty.call(store, p),
    readFileSync: (p: string) => {
      const v = store[p];
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    writeFileSync: (p: string, d: string) => {
      store[p] = d;
    },
    mkdirSync: () => {},
  };
}

const expoRouterProject = {
  '/app/package.json': JSON.stringify({
    name: 'gpc-expo',
    dependencies: {
      expo: '~55.0.4',
      'expo-router': '~55.0.4',
      react: '19.2.0',
      'react-native': '0.83.2',
      zustand: '^5.0.11',
    },
    devDependencies: {
      typescript: '~5.9.2',
    },
  }),
  '/app/tsconfig.json': '{}',
  '/app/yarn.lock': '',
  '/app/babel.config.js': `module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
`,
  '/app/src/app/_layout.tsx': `import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack />
    </GestureHandlerRootView>
  );
}
`,
};

describe('detectProject', () => {
  it('identifies an Expo Router + TS + yarn project', () => {
    const vfs = makeVfs(expoRouterProject);
    const det = detectProject({ root: '/app', fs: vfs });
    expect(det.isTypeScript).toBe(true);
    expect(det.usesExpoRouter).toBe(true);
    expect(det.usesReactNavigation).toBe(false);
    expect(det.packageManager).toBe('yarn');
    expect(det.stateManagement.zustand).toBe(true);
    expect(det.stateManagement.reduxToolkit).toBe(false);
    expect(det.hasMonitorDep).toBe(false);
    expect(det.appEntryFile).toBe('/app/src/app/_layout.tsx');
    expect(det.babelConfigFile).toBe('/app/babel.config.js');
  });

  it('falls back to npm when no lockfile is present', () => {
    const vfs = makeVfs({
      '/pkg/package.json': JSON.stringify({ name: 'x', dependencies: {} }),
    });
    expect(detectProject({ root: '/pkg', fs: vfs }).packageManager).toBe('npm');
  });

  it('throws when no package.json exists', () => {
    const vfs = makeVfs({});
    expect(() => detectProject({ root: '/empty', fs: vfs })).toThrow(/package\.json/);
  });
});

describe('renderMonitorConfig', () => {
  it('writes a .ts config for TS projects', () => {
    const vfs = makeVfs(expoRouterProject);
    const det = detectProject({ root: '/app', fs: vfs });
    const rendered = renderMonitorConfig(det);
    expect(rendered.fileName).toBe('monitor.config.ts');
    expect(rendered.content).toContain("import { defineMonitorConfig }");
    expect(rendered.content).toContain('crashes: true');
    expect(rendered.content).toContain('analytics: false');
  });

  it('writes a .js config for JS projects', () => {
    const vfs = makeVfs({
      '/js/package.json': JSON.stringify({
        name: 'js',
        dependencies: { expo: '~55.0.4' },
      }),
    });
    const det = detectProject({ root: '/js', fs: vfs });
    const rendered = renderMonitorConfig(det);
    expect(rendered.fileName).toBe('monitor.config.js');
    expect(rendered.content).toContain("require('@erne/monitor')");
  });
});

describe('patchAppEntryWithMonitorProvider', () => {
  it('wraps a simple RootLayout', () => {
    const src = expoRouterProject['/app/src/app/_layout.tsx']!;
    const result = patchAppEntryWithMonitorProvider(src);
    expect(result.changed).toBe(true);
    expect(result.content).toContain("import { MonitorProvider } from '@erne/monitor';");
    expect(result.content).toContain('<MonitorProvider>');
    expect(result.content).toContain('</MonitorProvider>');
  });

  it('is idempotent — does not double-wrap', () => {
    const src = expoRouterProject['/app/src/app/_layout.tsx']!;
    const once = patchAppEntryWithMonitorProvider(src);
    const twice = patchAppEntryWithMonitorProvider(once.content);
    expect(twice.changed).toBe(false);
    expect(twice.content).toBe(once.content);
  });
});

describe('patchBabelConfig', () => {
  it('appends plugin into an existing empty plugins array', () => {
    const src = `module.exports = { presets: ['babel-preset-expo'], plugins: [] };`;
    const out = patchBabelConfig(src);
    expect(out.changed).toBe(true);
    expect(out.content).toContain("'@erne/monitor/babel-plugin'");
  });

  it('adds a plugins array when none exists', () => {
    const src = expoRouterProject['/app/babel.config.js']!;
    const out = patchBabelConfig(src);
    expect(out.changed).toBe(true);
    expect(out.content).toContain("plugins: ['@erne/monitor/babel-plugin']");
  });

  it('is idempotent', () => {
    const src = `module.exports = { plugins: ['@erne/monitor/babel-plugin'] };`;
    const out = patchBabelConfig(src);
    expect(out.changed).toBe(false);
  });
});

describe('runInit', () => {
  it('dry-runs without touching disk', () => {
    const vfs = makeVfs({ ...expoRouterProject });
    const result = runInit({ root: '/app', dryRun: true, fs: vfs });
    expect(result.detection.usesExpoRouter).toBe(true);
    expect(result.steps.some((s) => s.action === 'create')).toBe(true);
    expect(result.steps.some((s) => s.action === 'update')).toBe(true);
    // Nothing was written.
    expect(vfs.store['/app/monitor.config.ts']).toBeUndefined();
  });

  it('writes all files on a non-dry run', () => {
    const vfs = makeVfs({ ...expoRouterProject });
    const result = runInit({ root: '/app', fs: vfs });
    expect(vfs.store['/app/monitor.config.ts']).toContain(
      'defineMonitorConfig',
    );
    const layout = vfs.store['/app/src/app/_layout.tsx']!;
    expect(layout).toContain('MonitorProvider');
    const babel = vfs.store['/app/babel.config.js']!;
    expect(babel).toContain('@erne/monitor/babel-plugin');
    expect(result.summary).toContain('@erne/monitor init complete');
  });

  it('is idempotent — second run leaves files untouched', () => {
    const vfs = makeVfs({ ...expoRouterProject });
    runInit({ root: '/app', fs: vfs });
    const before = { ...vfs.store };
    runInit({ root: '/app', fs: vfs });
    expect(vfs.store).toEqual(before);
  });

  it('reports manual-action hints when app entry is missing', () => {
    const vfs = makeVfs({
      '/app/package.json': JSON.stringify({ name: 'x', dependencies: {} }),
      '/app/babel.config.js': 'module.exports = { presets: [] };',
    });
    const result = runInit({ root: '/app', dryRun: true, fs: vfs });
    const appEntryStep = result.steps.find(
      (s) => s.path === '(app entry)',
    );
    expect(appEntryStep?.action).toBe('skip');
    expect(appEntryStep?.reason).toMatch(/wrap root/);
  });
});
