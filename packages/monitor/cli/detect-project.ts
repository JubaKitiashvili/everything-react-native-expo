import * as fs from 'fs';
import * as path from 'path';

export interface ProjectDetection {
  root: string;
  packageJson: Record<string, unknown>;
  isTypeScript: boolean;
  usesExpoRouter: boolean;
  usesReactNavigation: boolean;
  appEntryFile: string | null;
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun';
  stateManagement: {
    zustand: boolean;
    reduxToolkit: boolean;
  };
  hasMonitorDep: boolean;
  babelConfigFile: string | null;
}

export interface DetectOptions {
  root: string;
  /**
   * Injectable filesystem for tests. The real implementation uses Node's
   * `fs` module; tests pass a virtual fs to avoid touching disk.
   */
  fs?: VirtualFs;
}

export interface VirtualFs {
  existsSync(p: string): boolean;
  readFileSync(p: string, encoding: 'utf8'): string;
}

function defaultFs(): VirtualFs {
  return {
    existsSync: (p) => fs.existsSync(p),
    readFileSync: (p, enc) => fs.readFileSync(p, enc) as string,
  };
}

/**
 * Inspects a project root and returns a ProjectDetection describing
 * everything the init wizard needs to know. Does not read anything
 * unnecessary — single-pass on package.json + a few key files.
 */
export function detectProject(options: DetectOptions): ProjectDetection {
  const root = options.root;
  const vfs = options.fs ?? defaultFs();
  const pkgPath = path.join(root, 'package.json');
  if (!vfs.existsSync(pkgPath)) {
    throw new Error(`No package.json found at ${pkgPath}`);
  }
  const pkg = JSON.parse(vfs.readFileSync(pkgPath, 'utf8')) as Record<
    string,
    unknown
  >;

  const dependencies = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  };
  const isTypeScript =
    vfs.existsSync(path.join(root, 'tsconfig.json')) || !!dependencies.typescript;
  const usesExpoRouter = !!dependencies['expo-router'];
  const usesReactNavigation = !!dependencies['@react-navigation/native'];

  const entryCandidates = [
    'src/app/_layout.tsx',
    'src/app/_layout.jsx',
    'app/_layout.tsx',
    'app/_layout.jsx',
    'App.tsx',
    'App.jsx',
    'src/App.tsx',
    'src/App.jsx',
  ];
  const appEntryFile =
    entryCandidates.find((f) => vfs.existsSync(path.join(root, f))) ?? null;

  const pm: ProjectDetection['packageManager'] = vfs.existsSync(
    path.join(root, 'bun.lockb'),
  )
    ? 'bun'
    : vfs.existsSync(path.join(root, 'pnpm-lock.yaml'))
      ? 'pnpm'
      : vfs.existsSync(path.join(root, 'yarn.lock'))
        ? 'yarn'
        : 'npm';

  const babelCandidates = [
    'babel.config.js',
    'babel.config.cjs',
    'babel.config.json',
    '.babelrc',
    '.babelrc.js',
  ];
  const babelConfigFile =
    babelCandidates.find((f) => vfs.existsSync(path.join(root, f))) ?? null;

  return {
    root,
    packageJson: pkg,
    isTypeScript,
    usesExpoRouter,
    usesReactNavigation,
    appEntryFile: appEntryFile ? path.join(root, appEntryFile) : null,
    packageManager: pm,
    stateManagement: {
      zustand: !!dependencies.zustand,
      reduxToolkit: !!dependencies['@reduxjs/toolkit'],
    },
    hasMonitorDep:
      dependencies['@erne/monitor'] !== undefined ||
      (pkg.dependencies as Record<string, string> | undefined)?.['@erne/monitor'] !==
        undefined,
    babelConfigFile: babelConfigFile
      ? path.join(root, babelConfigFile)
      : null,
  };
}
