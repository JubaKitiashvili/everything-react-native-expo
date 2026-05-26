// `npx @erne/monitor doctor` — validate a project's ERNE integration
// end-to-end and print SPECIFIC, actionable errors.
//
// The check matrix is split in two:
//   - `runDoctorChecks(context)` — a PURE function over a normalised
//     `DoctorContext` describing the project (babel config text, app-entry
//     text, installed deps, optional dashboard ping result, …). Every check
//     returns pass / warn / fail with a human detail and a one-line fix. This
//     is the unit-testable core — no filesystem, no network.
//   - `gatherDoctorContext` + `runDoctorCommand` — the CLI shell that reads
//     the real project from disk, optionally pings the dashboard, renders the
//     report, and exits with code = number of failures.

import * as fs from 'fs';
import * as path from 'path';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface DoctorCheck {
  name: string;
  status: CheckStatus;
  detail: string;
  /** Actionable remediation — present when status is warn or fail. */
  fix?: string;
}

export interface DoctorReport {
  checks: DoctorCheck[];
}

/**
 * Normalised view of the project, decoupled from how it was gathered.
 * Tests construct this directly; the CLI builds it from disk + network.
 */
export interface DoctorContext {
  /** Absolute project root (display only). */
  root: string;
  /** Whether @erne/monitor is a dependency of the project. */
  hasMonitorDep: boolean;
  /** Installed @erne/monitor version, if resolvable. */
  monitorVersion: string | null;
  /** Path to the located babel config, or null when none was found. */
  babelConfigPath: string | null;
  /** Raw text of the babel config (null when not found). */
  babelConfigText: string | null;
  /** Path to the located app entry (_layout/App), or null. */
  appEntryPath: string | null;
  /** Raw text of the app entry (null when not found). */
  appEntryText: string | null;
  /** Whether a monitor.config.{ts,js} exists at the root. */
  hasMonitorConfig: boolean;
  /** Detected target platform hint (display only). */
  platform: 'ios' | 'android' | 'unknown';
  /**
   * Result of an optional dashboard reachability ping. `undefined` means the
   * ping was not requested (no `--ping`); `null`/object means it ran.
   */
  dashboardPing?: { url: string; reachable: boolean; detail?: string } | undefined;
}

const BABEL_PLUGIN_ID = '@erne/monitor/babel-plugin';
const PROVIDER_MARKER = 'MonitorProvider';

// ---------------------------------------------------------------------------
// Pure check matrix

export function runDoctorChecks(ctx: DoctorContext): DoctorReport {
  const checks: DoctorCheck[] = [];

  // 1. Package installed
  if (ctx.hasMonitorDep) {
    checks.push({
      name: 'SDK installed',
      status: 'pass',
      detail: ctx.monitorVersion
        ? `@erne/monitor@${ctx.monitorVersion} is installed.`
        : '@erne/monitor is listed as a dependency.',
    });
  } else {
    checks.push({
      name: 'SDK installed',
      status: 'fail',
      detail: '@erne/monitor is not a dependency of this project.',
      fix: 'Run `npm install @erne/monitor` (or yarn/pnpm/bun add).',
    });
  }

  // 2. Babel plugin wired
  if (ctx.babelConfigPath === null) {
    checks.push({
      name: 'Babel plugin',
      status: 'fail',
      detail: 'No babel.config.* found — the babel plugin cannot be active.',
      fix: `Create a babel.config.js and add '${BABEL_PLUGIN_ID}' to its plugins array.`,
    });
  } else if (ctx.babelConfigText && ctx.babelConfigText.includes(BABEL_PLUGIN_ID)) {
    checks.push({
      name: 'Babel plugin',
      status: 'pass',
      detail: `'${BABEL_PLUGIN_ID}' is present in ${path.basename(ctx.babelConfigPath)}.`,
    });
  } else {
    checks.push({
      name: 'Babel plugin',
      status: 'fail',
      detail: `'${BABEL_PLUGIN_ID}' is missing from ${path.basename(ctx.babelConfigPath)}.`,
      fix: `Add '${BABEL_PLUGIN_ID}' to the plugins array in ${path.basename(ctx.babelConfigPath)}, then restart Metro with --clear.`,
    });
  }

  // 3. Config plugin / monitor.config present
  if (ctx.hasMonitorConfig) {
    checks.push({
      name: 'Monitor config',
      status: 'pass',
      detail: 'monitor.config.{ts,js} is present at the project root.',
    });
  } else {
    checks.push({
      name: 'Monitor config',
      status: 'warn',
      detail: 'No monitor.config.{ts,js} found — the SDK will run with defaults.',
      fix: 'Run `npx @erne/monitor init` to scaffold a monitor.config.',
    });
  }

  // 4. Provider mounted
  if (ctx.appEntryPath === null) {
    checks.push({
      name: 'Provider mounted',
      status: 'warn',
      detail: 'Could not locate an app entry (_layout.tsx / App.tsx) to verify <MonitorProvider>.',
      fix: 'Wrap your root component with <MonitorProvider> from @erne/monitor.',
    });
  } else if (ctx.appEntryText && ctx.appEntryText.includes(PROVIDER_MARKER)) {
    checks.push({
      name: 'Provider mounted',
      status: 'pass',
      detail: `<MonitorProvider> is referenced in ${path.basename(ctx.appEntryPath)}.`,
    });
  } else {
    checks.push({
      name: 'Provider mounted',
      status: 'fail',
      detail: `<MonitorProvider> is not mounted in ${path.basename(ctx.appEntryPath)} — no events will be collected.`,
      fix: `Wrap the root component in ${path.basename(ctx.appEntryPath)} with <MonitorProvider> (or re-run \`npx @erne/monitor init\`).`,
    });
  }

  // 5. Dashboard reachability (optional — only when a ping was requested)
  if (ctx.dashboardPing !== undefined) {
    if (ctx.dashboardPing.reachable) {
      checks.push({
        name: 'Dashboard reachable',
        status: 'pass',
        detail: `Dashboard responded at ${ctx.dashboardPing.url}.`,
      });
    } else {
      checks.push({
        name: 'Dashboard reachable',
        status: 'warn',
        detail: `Dashboard did not respond at ${ctx.dashboardPing.url}${
          ctx.dashboardPing.detail ? ` (${ctx.dashboardPing.detail})` : ''
        }.`,
        fix: 'Start it with `npx @erne/monitor dashboard`, or pass the right URL via --ping <url>.',
      });
    }
  }

  // 6. Native setup hint (informational — we cannot verify pods/gradle from JS)
  checks.push({
    name: 'Native setup',
    status: 'warn',
    detail:
      ctx.platform === 'ios'
        ? 'iOS native module requires `npx pod-install` after installing the SDK.'
        : ctx.platform === 'android'
          ? 'Android native module is autolinked — rebuild the app after installing the SDK.'
          : 'Rebuild native projects after installing the SDK (`npx expo prebuild` for Expo, then `pod-install` for iOS).',
    fix: 'If crash collection misses native crashes, run `npx expo prebuild --clean` and rebuild the dev client.',
  });

  return { checks };
}

export function summarizeDoctor(report: DoctorReport): {
  pass: number;
  warn: number;
  fail: number;
} {
  let pass = 0;
  let warn = 0;
  let fail = 0;
  for (const c of report.checks) {
    if (c.status === 'pass') pass++;
    else if (c.status === 'warn') warn++;
    else fail++;
  }
  return { pass, warn, fail };
}

// ---------------------------------------------------------------------------
// Pretty renderer (pure)

const STATUS_MARKER: Record<CheckStatus, string> = {
  pass: '[ok]  ',
  warn: '[warn]',
  fail: '[fail]',
};

export function renderDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('@erne/monitor doctor');
  lines.push('');
  for (const c of report.checks) {
    lines.push(`${STATUS_MARKER[c.status]} ${c.name}`);
    lines.push(`        ${c.detail}`);
    if (c.fix && c.status !== 'pass') {
      lines.push(`        fix: ${c.fix}`);
    }
  }
  const { pass, warn, fail } = summarizeDoctor(report);
  lines.push('');
  lines.push(`Summary: ${pass} passed, ${warn} warnings, ${fail} failed.`);
  if (fail > 0) {
    lines.push('Fix the failures above, then re-run `npx @erne/monitor doctor`.');
  } else {
    lines.push('No blocking issues found.');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI shell

export interface ParsedDoctorArgs {
  path: string;
  pingUrl: string | null;
  help: boolean;
}

const DEFAULT_DASHBOARD_URL = 'http://127.0.0.1:3333';

export function parseDoctorArgs(argv: readonly string[]): ParsedDoctorArgs {
  let projectPath = process.cwd();
  let pingUrl: string | null = null;
  let help = false;
  let sawPath = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token) continue;
    if (token === '--help' || token === '-h') {
      help = true;
      continue;
    }
    if (token === '--ping') {
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        pingUrl = next;
        i += 1;
      } else {
        pingUrl = DEFAULT_DASHBOARD_URL;
      }
      continue;
    }
    if (token.startsWith('--ping=')) {
      pingUrl = token.slice('--ping='.length) || DEFAULT_DASHBOARD_URL;
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

  return { path: projectPath, pingUrl, help };
}

export function renderDoctorHelp(): string {
  return [
    'Usage: npx @erne/monitor doctor [path] [flags]',
    '',
    'Validates an ERNE integration end-to-end: SDK install, babel plugin,',
    'monitor.config, <MonitorProvider> mount, and (optionally) dashboard',
    'reachability. Exits with a non-zero code equal to the number of failures.',
    '',
    'Arguments:',
    '  path             Project root to check (default: current directory)',
    '',
    'Flags:',
    '  --ping [url]     Ping the dashboard (default: http://127.0.0.1:3333)',
    '  -h, --help       Show this message',
  ].join('\n');
}

export interface DoctorCliDeps {
  logger?: { info: (msg: string) => void; error: (msg: string) => void };
  /** Injectable context gatherer (tests stub this to avoid disk + network). */
  gather?: (args: ParsedDoctorArgs) => Promise<DoctorContext>;
}

const BABEL_CANDIDATES = [
  'babel.config.js',
  'babel.config.cjs',
  'babel.config.json',
  '.babelrc',
  '.babelrc.js',
];

const APP_ENTRY_CANDIDATES = [
  'src/app/_layout.tsx',
  'src/app/_layout.jsx',
  'app/_layout.tsx',
  'app/_layout.jsx',
  'App.tsx',
  'App.jsx',
  'src/App.tsx',
  'src/App.jsx',
];

const CONFIG_CANDIDATES = ['monitor.config.ts', 'monitor.config.js'];

/**
 * Default reachability ping — a 1.5s timeout GET against the dashboard URL.
 * Any HTTP response (even 404) counts as "reachable" since it proves a server
 * is listening. Network errors / timeouts count as unreachable.
 */
async function defaultPing(url: string): Promise<{ reachable: boolean; detail?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return { reachable: true, detail: `HTTP ${res.status}` };
  } catch (err) {
    return { reachable: false, detail: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/** Builds a DoctorContext from the real filesystem (+ optional dashboard ping). */
export async function gatherDoctorContext(args: ParsedDoctorArgs): Promise<DoctorContext> {
  const root = args.path;
  const readIf = (rel: string): string | null => {
    const abs = path.join(root, rel);
    try {
      return fs.existsSync(abs) ? (fs.readFileSync(abs, 'utf8') as string) : null;
    } catch {
      return null;
    }
  };

  // package.json deps
  let hasMonitorDep = false;
  let monitorVersion: string | null = null;
  const pkgText = readIf('package.json');
  if (pkgText) {
    try {
      const pkg = JSON.parse(pkgText) as Record<string, unknown>;
      const deps = {
        ...(pkg.dependencies as Record<string, string> | undefined),
        ...(pkg.devDependencies as Record<string, string> | undefined),
      };
      hasMonitorDep = deps['@erne/monitor'] !== undefined;
      monitorVersion = deps['@erne/monitor'] ?? null;
    } catch {
      // malformed package.json — leave deps unknown
    }
  }

  const babelConfigPath = BABEL_CANDIDATES.map((c) => path.join(root, c)).find((p) =>
    fs.existsSync(p),
  );
  const babelConfigText = babelConfigPath
    ? ((): string | null => {
        try {
          return fs.readFileSync(babelConfigPath, 'utf8') as string;
        } catch {
          return null;
        }
      })()
    : null;

  const appEntryPath = APP_ENTRY_CANDIDATES.map((c) => path.join(root, c)).find((p) =>
    fs.existsSync(p),
  );
  const appEntryText = appEntryPath
    ? ((): string | null => {
        try {
          return fs.readFileSync(appEntryPath, 'utf8') as string;
        } catch {
          return null;
        }
      })()
    : null;

  const hasMonitorConfig = CONFIG_CANDIDATES.some((c) => fs.existsSync(path.join(root, c)));

  const ctx: DoctorContext = {
    root,
    hasMonitorDep,
    monitorVersion,
    babelConfigPath: babelConfigPath ?? null,
    babelConfigText,
    appEntryPath: appEntryPath ?? null,
    appEntryText,
    hasMonitorConfig,
    platform: 'unknown',
  };

  if (args.pingUrl !== null) {
    const result = await defaultPing(args.pingUrl);
    ctx.dashboardPing = {
      url: args.pingUrl,
      reachable: result.reachable,
      ...(result.detail ? { detail: result.detail } : {}),
    };
  }

  return ctx;
}

/**
 * Doctor command entry. Returns the exit code = number of failing checks
 * (clamped so a healthy project returns 0). Arg-parse errors return 1.
 */
export async function runDoctorCommand(
  argv: readonly string[],
  deps: DoctorCliDeps = {},
): Promise<number> {
  const logger = deps.logger ?? {
    info: (msg: string) => console.log(msg),
    error: (msg: string) => console.error(msg),
  };

  let parsed: ParsedDoctorArgs;
  try {
    parsed = parseDoctorArgs(argv);
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
    logger.error(renderDoctorHelp());
    return 1;
  }

  if (parsed.help) {
    logger.info(renderDoctorHelp());
    return 0;
  }

  const gather = deps.gather ?? gatherDoctorContext;
  let ctx: DoctorContext;
  try {
    ctx = await gather(parsed);
  } catch (err) {
    logger.error(
      '[@erne/monitor] doctor failed: ' + (err instanceof Error ? err.message : String(err)),
    );
    return 1;
  }

  const report = runDoctorChecks(ctx);
  logger.info(renderDoctorReport(report));
  const { fail } = summarizeDoctor(report);
  return fail;
}
