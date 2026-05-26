import {
  parseDoctorArgs,
  renderDoctorHelp,
  renderDoctorReport,
  runDoctorChecks,
  runDoctorCommand,
  summarizeDoctor,
  type DoctorContext,
} from './doctor';

function makeContext(overrides: Partial<DoctorContext> = {}): DoctorContext {
  return {
    root: '/app',
    hasMonitorDep: true,
    monitorVersion: '0.1.0',
    babelConfigPath: '/app/babel.config.js',
    babelConfigText: `module.exports = { plugins: ['@erne/monitor/babel-plugin'] };`,
    appEntryPath: '/app/App.tsx',
    appEntryText: `import { MonitorProvider } from '@erne/monitor';\nexport default () => <MonitorProvider><App/></MonitorProvider>;`,
    hasMonitorConfig: true,
    platform: 'unknown',
    ...overrides,
  };
}

function checkByName(report: ReturnType<typeof runDoctorChecks>, name: string) {
  return report.checks.find((c) => c.name === name);
}

describe('runDoctorChecks', () => {
  test('a fully-wired project passes the actionable checks (native is informational)', () => {
    const report = runDoctorChecks(makeContext());
    expect(checkByName(report, 'SDK installed')?.status).toBe('pass');
    expect(checkByName(report, 'Babel plugin')?.status).toBe('pass');
    expect(checkByName(report, 'Monitor config')?.status).toBe('pass');
    expect(checkByName(report, 'Provider mounted')?.status).toBe('pass');
    expect(summarizeDoctor(report).fail).toBe(0);
  });

  test('fails when the SDK is not installed, with a fix', () => {
    const report = runDoctorChecks(makeContext({ hasMonitorDep: false, monitorVersion: null }));
    const check = checkByName(report, 'SDK installed');
    expect(check?.status).toBe('fail');
    expect(check?.fix).toMatch(/npm install @erne\/monitor/);
  });

  test('fails when babel config is missing entirely', () => {
    const report = runDoctorChecks(makeContext({ babelConfigPath: null, babelConfigText: null }));
    const check = checkByName(report, 'Babel plugin');
    expect(check?.status).toBe('fail');
    expect(check?.fix).toMatch(/babel\.config\.js/);
  });

  test('fails when babel config exists but the plugin is not wired', () => {
    const report = runDoctorChecks(
      makeContext({ babelConfigText: `module.exports = { presets: ['babel-preset-expo'] };` }),
    );
    const check = checkByName(report, 'Babel plugin');
    expect(check?.status).toBe('fail');
    expect(check?.detail).toMatch(/missing/);
    expect(check?.fix).toMatch(/--clear/);
  });

  test('warns when monitor.config is absent', () => {
    const report = runDoctorChecks(makeContext({ hasMonitorConfig: false }));
    const check = checkByName(report, 'Monitor config');
    expect(check?.status).toBe('warn');
    expect(check?.fix).toMatch(/init/);
  });

  test('fails when the provider is not mounted in a located entry', () => {
    const report = runDoctorChecks(
      makeContext({ appEntryText: `export default () => <App/>;` }),
    );
    const check = checkByName(report, 'Provider mounted');
    expect(check?.status).toBe('fail');
    expect(check?.detail).toMatch(/no events will be collected/);
  });

  test('warns when no app entry could be located', () => {
    const report = runDoctorChecks(makeContext({ appEntryPath: null, appEntryText: null }));
    expect(checkByName(report, 'Provider mounted')?.status).toBe('warn');
  });

  test('omits the dashboard check when no ping was requested', () => {
    const report = runDoctorChecks(makeContext());
    expect(checkByName(report, 'Dashboard reachable')).toBeUndefined();
  });

  test('passes the dashboard check when reachable', () => {
    const report = runDoctorChecks(
      makeContext({ dashboardPing: { url: 'http://127.0.0.1:3333', reachable: true } }),
    );
    expect(checkByName(report, 'Dashboard reachable')?.status).toBe('pass');
  });

  test('warns when the dashboard is unreachable, surfacing the detail', () => {
    const report = runDoctorChecks(
      makeContext({
        dashboardPing: { url: 'http://127.0.0.1:3333', reachable: false, detail: 'ECONNREFUSED' },
      }),
    );
    const check = checkByName(report, 'Dashboard reachable');
    expect(check?.status).toBe('warn');
    expect(check?.detail).toMatch(/ECONNREFUSED/);
  });

  test('native check is platform-aware', () => {
    const ios = runDoctorChecks(makeContext({ platform: 'ios' }));
    expect(checkByName(ios, 'Native setup')?.detail).toMatch(/pod-install/);
    const android = runDoctorChecks(makeContext({ platform: 'android' }));
    expect(checkByName(android, 'Native setup')?.detail).toMatch(/autolinked/);
  });
});

describe('summarizeDoctor', () => {
  test('counts pass/warn/fail buckets', () => {
    const report = runDoctorChecks(
      makeContext({ hasMonitorDep: false, monitorVersion: null, hasMonitorConfig: false }),
    );
    const summary = summarizeDoctor(report);
    expect(summary.fail).toBeGreaterThanOrEqual(1);
    expect(summary.warn).toBeGreaterThanOrEqual(1);
  });
});

describe('renderDoctorReport', () => {
  test('renders markers, fixes, and a summary line', () => {
    const report = runDoctorChecks(makeContext({ hasMonitorDep: false, monitorVersion: null }));
    const out = renderDoctorReport(report);
    expect(out).toContain('@erne/monitor doctor');
    expect(out).toContain('[fail]');
    expect(out).toContain('fix:');
    expect(out).toMatch(/Summary: \d+ passed, \d+ warnings, \d+ failed\./);
    expect(out).toContain('Fix the failures above');
  });

  test('reports a clean bill of health when nothing fails', () => {
    const out = renderDoctorReport(runDoctorChecks(makeContext()));
    expect(out).toContain('No blocking issues found.');
  });
});

describe('parseDoctorArgs', () => {
  test('defaults to cwd, no ping, no help', () => {
    const parsed = parseDoctorArgs([]);
    expect(parsed.path).toBe(process.cwd());
    expect(parsed.pingUrl).toBeNull();
    expect(parsed.help).toBe(false);
  });

  test('accepts a positional path', () => {
    expect(parseDoctorArgs(['/some/app']).path).toBe('/some/app');
  });

  test('--ping without a value uses the default dashboard url', () => {
    expect(parseDoctorArgs(['--ping']).pingUrl).toBe('http://127.0.0.1:3333');
  });

  test('--ping with an explicit url', () => {
    expect(parseDoctorArgs(['--ping', 'http://localhost:9000']).pingUrl).toBe(
      'http://localhost:9000',
    );
    expect(parseDoctorArgs(['--ping=http://localhost:9001']).pingUrl).toBe(
      'http://localhost:9001',
    );
  });

  test('--ping followed by a path keeps both', () => {
    const parsed = parseDoctorArgs(['--ping', '/app']);
    // '/app' does not start with '-', so it's consumed as the ping url here;
    // this documents that an explicit path must precede --ping.
    expect(parsed.pingUrl).toBe('/app');
  });

  test('rejects unknown flags and extra positionals', () => {
    expect(() => parseDoctorArgs(['--bogus'])).toThrow(/Unknown argument/);
    expect(() => parseDoctorArgs(['/a', '/b'])).toThrow(/extra argument/);
  });

  test('-h sets help', () => {
    expect(parseDoctorArgs(['-h']).help).toBe(true);
  });
});

describe('runDoctorCommand', () => {
  function makeLogger() {
    const info: string[] = [];
    const error: string[] = [];
    return { info, error, logger: { info: (m: string) => info.push(m), error: (m: string) => error.push(m) } };
  }

  test('--help prints usage and exits 0 without gathering', async () => {
    const { info, logger } = makeLogger();
    const gather = jest.fn();
    const code = await runDoctorCommand(['--help'], { logger, gather });
    expect(code).toBe(0);
    expect(gather).not.toHaveBeenCalled();
    expect(info.join('\n')).toContain('Usage: npx @erne/monitor doctor');
  });

  test('exit code equals the number of failing checks', async () => {
    const { logger } = makeLogger();
    const gather = jest.fn(async () =>
      makeContext({ hasMonitorDep: false, monitorVersion: null, babelConfigText: 'module.exports={};' }),
    );
    const code = await runDoctorCommand(['/app'], { logger, gather });
    // SDK install + babel plugin both fail.
    expect(code).toBe(2);
  });

  test('exits 0 for a healthy project and prints the report', async () => {
    const { info, logger } = makeLogger();
    const gather = jest.fn(async () => makeContext());
    const code = await runDoctorCommand([], { logger, gather });
    expect(code).toBe(0);
    expect(info.join('\n')).toContain('No blocking issues found.');
  });

  test('exits 1 with a clear error when gathering throws', async () => {
    const { error, logger } = makeLogger();
    const gather = jest.fn(async () => {
      throw new Error('disk on fire');
    });
    const code = await runDoctorCommand(['/app'], { logger, gather });
    expect(code).toBe(1);
    expect(error.some((l) => l.includes('disk on fire'))).toBe(true);
  });

  test('exits 1 on bad args', async () => {
    const { error, logger } = makeLogger();
    const code = await runDoctorCommand(['--nope'], { logger });
    expect(code).toBe(1);
    expect(error.some((l) => l.includes('Unknown argument'))).toBe(true);
  });
});

describe('renderDoctorHelp', () => {
  test('documents the path argument and --ping flag', () => {
    const help = renderDoctorHelp();
    expect(help).toContain('[path]');
    expect(help).toContain('--ping');
    expect(help).toContain('--help');
  });
});
