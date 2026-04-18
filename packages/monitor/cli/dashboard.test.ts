import {
  parseDashboardArgs,
  renderDashboardHelp,
  runDashboardCommand,
  type DashboardLauncher,
} from './dashboard';

describe('parseDashboardArgs', () => {
  test('defaults to port 3333 + host 127.0.0.1 when no flags are given', () => {
    expect(parseDashboardArgs([])).toEqual({
      port: 3333,
      host: '127.0.0.1',
      open: false,
      help: false,
    });
  });

  test('accepts --port/--host/--db/--open in both space- and equals-form', () => {
    expect(parseDashboardArgs(['--port', '4444', '--host', '0.0.0.0', '--open'])).toEqual({
      port: 4444,
      host: '0.0.0.0',
      open: true,
      help: false,
    });
    expect(parseDashboardArgs(['--port=0', '--db=/tmp/m.db'])).toEqual({
      port: 0,
      host: '127.0.0.1',
      dbPath: '/tmp/m.db',
      open: false,
      help: false,
    });
    expect(parseDashboardArgs(['-p', '8080', '-h'])).toEqual({
      port: 8080,
      host: '127.0.0.1',
      open: false,
      help: true,
    });
  });

  test('rejects invalid ports + unknown flags with actionable errors', () => {
    expect(() => parseDashboardArgs(['--port', 'not-a-number'])).toThrow(/--port expects/);
    expect(() => parseDashboardArgs(['--port', '99999'])).toThrow(/--port expects/);
    expect(() => parseDashboardArgs(['--bogus'])).toThrow(/Unknown argument: --bogus/);
    expect(() => parseDashboardArgs(['--host'])).toThrow(/--host expects/);
  });
});

describe('runDashboardCommand', () => {
  function makeLogger() {
    const info: string[] = [];
    const error: string[] = [];
    return {
      info,
      error,
      logger: {
        info: (msg: string) => info.push(msg),
        error: (msg: string) => error.push(msg),
      },
    };
  }

  test('--help prints usage and exits 0 without calling the launcher', async () => {
    const { info, logger } = makeLogger();
    const launcher: DashboardLauncher = jest.fn();

    const code = await runDashboardCommand(['--help'], { launcher, logger });

    expect(code).toBe(0);
    expect(launcher).not.toHaveBeenCalled();
    expect(info.join('\n')).toContain('Usage: npx @erne/monitor dashboard');
  });

  test('launches the server, logs the URL, opens the browser on --open, then shuts down', async () => {
    const close = jest.fn(async () => undefined);
    const launcher: DashboardLauncher = jest.fn(async (config) => ({
      url: `http://${config.host}:${config.port || 51234}`,
      port: config.port || 51234,
      close,
    }));
    const browserOpener = jest.fn();
    const waitForExit = jest.fn(async () => undefined);
    const { info, logger } = makeLogger();

    const code = await runDashboardCommand(
      ['--port', '0', '--open'],
      { launcher, browserOpener, waitForExit, logger },
    );

    expect(code).toBe(0);
    expect(launcher).toHaveBeenCalledWith({ port: 0, host: '127.0.0.1' });
    expect(browserOpener).toHaveBeenCalledWith('http://127.0.0.1:51234');
    expect(info.some((line) => line.includes('listening on http://127.0.0.1:51234'))).toBe(true);
    expect(info.some((line) => line.includes('Ctrl-C'))).toBe(true);
    expect(waitForExit).toHaveBeenCalledTimes(1);
    // Graceful shutdown after waitForExit resolves.
    expect(close).toHaveBeenCalledTimes(1);
  });

  test('reports a clear error + exits 1 when the launcher throws', async () => {
    const launcher: DashboardLauncher = jest.fn(async () => {
      throw new Error('EADDRINUSE: port 3333');
    });
    const { error, logger } = makeLogger();

    const code = await runDashboardCommand([], { launcher, logger });

    expect(code).toBe(1);
    expect(error.some((line) => line.includes('EADDRINUSE: port 3333'))).toBe(true);
  });

  test('browser-open failures are logged but do not abort the server', async () => {
    const close = jest.fn(async () => undefined);
    const launcher: DashboardLauncher = jest.fn(async () => ({
      url: 'http://127.0.0.1:3333',
      port: 3333,
      close,
    }));
    const browserOpener = jest.fn(async () => {
      throw new Error('xdg-open: command not found');
    });
    const waitForExit = jest.fn(async () => undefined);
    const { error, logger } = makeLogger();

    const code = await runDashboardCommand(
      ['--open'],
      { launcher, browserOpener, waitForExit, logger },
    );

    expect(code).toBe(0);
    expect(error.some((line) => line.includes('could not open browser'))).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('renderDashboardHelp', () => {
  test('includes every flag the parser supports', () => {
    const help = renderDashboardHelp();
    for (const flag of ['--port', '--host', '--db', '--open', '--no-open', '--help']) {
      expect(help).toContain(flag);
    }
  });
});
