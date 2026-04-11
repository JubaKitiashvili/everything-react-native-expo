// `npx @erne/monitor init` entry point.
//
// The init command:
//   1. Detects the host project (framework, TS, state, package manager).
//   2. Renders a monitor.config.{ts,js} from a sensible default.
//   3. Patches the app entry file to wrap the root with MonitorProvider.
//   4. Adds @erne/monitor/babel-plugin to the Babel config.
//   5. Prints a "what next" summary.
//
// Every step is idempotent. `--dry-run` prints the planned writes
// without touching disk.

import * as fs from 'fs';
import * as path from 'path';
import { detectProject, type ProjectDetection } from './detect-project';
import { renderMonitorConfig } from './scaffold-config';
import { patchAppEntryWithMonitorProvider } from './scaffold-provider';
import { patchBabelConfig } from './scaffold-babel';

export interface InitOptions {
  root: string;
  dryRun?: boolean;
  /** Injected file system for tests. */
  fs?: {
    existsSync(p: string): boolean;
    readFileSync(p: string, encoding: 'utf8'): string;
    writeFileSync(p: string, data: string, encoding: 'utf8'): void;
    mkdirSync?(p: string, options?: { recursive?: boolean }): void;
  };
}

export interface InitStep {
  path: string;
  action: 'create' | 'update' | 'skip';
  reason?: string;
}

export interface InitResult {
  detection: ProjectDetection;
  steps: InitStep[];
  summary: string;
}

function defaultFs(): InitOptions['fs'] {
  return {
    existsSync: (p) => fs.existsSync(p),
    readFileSync: (p, enc) => fs.readFileSync(p, enc) as string,
    writeFileSync: (p, d, enc) => fs.writeFileSync(p, d, enc),
    mkdirSync: (p, opts) => fs.mkdirSync(p, opts as { recursive?: boolean }),
  };
}

/**
 * Runs the init pipeline against a project root. Deterministic:
 * same input produces the same list of steps.
 */
export function runInit(options: InitOptions): InitResult {
  const vfs = options.fs ?? defaultFs()!;
  const detection = detectProject({
    root: options.root,
    fs: {
      existsSync: vfs.existsSync,
      readFileSync: vfs.readFileSync,
    },
  });
  const steps: InitStep[] = [];

  // 1. monitor.config.{ts,js}
  const rendered = renderMonitorConfig(detection);
  const configPath = path.join(options.root, rendered.fileName);
  const configExists = vfs.existsSync(configPath);
  if (configExists) {
    steps.push({
      path: configPath,
      action: 'skip',
      reason: 'config already exists — left untouched',
    });
  } else {
    steps.push({ path: configPath, action: 'create' });
    if (!options.dryRun) {
      vfs.writeFileSync(configPath, rendered.content, 'utf8');
    }
  }

  // 2. App entry patch
  if (!detection.appEntryFile) {
    steps.push({
      path: '(app entry)',
      action: 'skip',
      reason:
        'could not locate _layout.tsx / App.tsx — wrap root with <MonitorProvider> by hand',
    });
  } else if (!vfs.existsSync(detection.appEntryFile)) {
    steps.push({
      path: detection.appEntryFile,
      action: 'skip',
      reason: 'app entry file listed but missing on disk',
    });
  } else {
    const src = vfs.readFileSync(detection.appEntryFile, 'utf8');
    const patched = patchAppEntryWithMonitorProvider(src);
    if (!patched.changed) {
      steps.push({
        path: detection.appEntryFile,
        action: 'skip',
        reason: patched.reason ?? 'already wrapped',
      });
    } else {
      steps.push({
        path: detection.appEntryFile,
        action: 'update',
        reason: patched.reason,
      });
      if (!options.dryRun) {
        vfs.writeFileSync(detection.appEntryFile, patched.content, 'utf8');
      }
    }
  }

  // 3. Babel config patch
  if (!detection.babelConfigFile) {
    steps.push({
      path: '(babel config)',
      action: 'skip',
      reason:
        'no babel.config.* found — create one and add @erne/monitor/babel-plugin manually',
    });
  } else {
    const src = vfs.readFileSync(detection.babelConfigFile, 'utf8');
    const patched = patchBabelConfig(src);
    if (!patched.changed) {
      steps.push({
        path: detection.babelConfigFile,
        action: 'skip',
        reason: patched.reason ?? 'already wired',
      });
    } else {
      steps.push({
        path: detection.babelConfigFile,
        action: 'update',
      });
      if (!options.dryRun) {
        vfs.writeFileSync(detection.babelConfigFile, patched.content, 'utf8');
      }
    }
  }

  const summary = buildSummary(detection, steps);
  return { detection, steps, summary };
}

function buildSummary(
  detection: ProjectDetection,
  steps: readonly InitStep[],
): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('@erne/monitor init complete');
  lines.push(`Project: ${detection.root}`);
  lines.push(
    `Stack: ${detection.isTypeScript ? 'TypeScript' : 'JavaScript'}, ${
      detection.usesExpoRouter
        ? 'Expo Router'
        : detection.usesReactNavigation
          ? 'React Navigation'
          : '(no navigator detected)'
    }, ${detection.packageManager}`,
  );
  lines.push('');
  lines.push('Steps:');
  for (const step of steps) {
    const marker =
      step.action === 'create'
        ? '[+]'
        : step.action === 'update'
          ? '[~]'
          : '[=]';
    const note = step.reason ? ` — ${step.reason}` : '';
    lines.push(`  ${marker} ${step.path}${note}`);
  }
  lines.push('');
  lines.push('What next:');
  if (!detection.hasMonitorDep) {
    const cmd =
      detection.packageManager === 'npm'
        ? 'npm install @erne/monitor'
        : detection.packageManager === 'yarn'
          ? 'yarn add @erne/monitor'
          : detection.packageManager === 'pnpm'
            ? 'pnpm add @erne/monitor'
            : 'bun add @erne/monitor';
    lines.push(`  1. Install the package:  ${cmd}`);
  }
  lines.push('  2. Start Metro and reload the app.');
  lines.push('  3. Open http://localhost:3333/runtime.html to see live events.');
  return lines.join('\n');
}
