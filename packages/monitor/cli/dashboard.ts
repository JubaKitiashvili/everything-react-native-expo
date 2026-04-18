// `npx @erne/monitor dashboard` — start the local dashboard server, print the
// connect URL, optionally pop a browser, wait for Ctrl-C.
//
// This module is dependency-injected end-to-end so the entire command can be
// exercised in Jest without spawning a real HTTP server, opening a real
// browser, or attaching to real process signals. The default deps are wired
// in `bin.ts` only — production callers do nothing clever.

export interface ParsedDashboardArgs {
  port: number;
  host: string;
  dbPath?: string;
  open: boolean;
  help: boolean;
}

export interface DashboardLaunchConfig {
  port: number;
  host: string;
  dbPath?: string;
}

export interface DashboardLaunchHandle {
  url: string;
  port: number;
  close: () => Promise<void>;
}

export type DashboardLauncher = (
  config: DashboardLaunchConfig,
) => Promise<DashboardLaunchHandle>;

export type BrowserOpener = (url: string) => Promise<void> | void;

export interface DashboardCliDeps {
  launcher?: DashboardLauncher;
  browserOpener?: BrowserOpener;
  logger?: { info: (msg: string) => void; error: (msg: string) => void };
  /**
   * Hook that resolves when the CLI should shut down — default wires SIGINT
   * + SIGTERM; tests resolve it imperatively to simulate Ctrl-C.
   */
  waitForExit?: () => Promise<void>;
}

const DEFAULT_PORT = 3333;
const DEFAULT_HOST = '127.0.0.1';

/**
 * Parse the argv slice that follows the leading `dashboard` subcommand.
 * Pure + deterministic — no process / env side effects.
 */
export function parseDashboardArgs(argv: string[]): ParsedDashboardArgs {
  let port: number = DEFAULT_PORT;
  let host: string = DEFAULT_HOST;
  let dbPath: string | undefined;
  let open = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token) continue;
    if (token === '--help' || token === '-h') {
      help = true;
      continue;
    }
    if (token === '--open') {
      open = true;
      continue;
    }
    if (token === '--no-open') {
      open = false;
      continue;
    }
    if (token === '--port' || token === '-p') {
      const raw = argv[i + 1];
      const next = Number(raw);
      if (!raw || !Number.isFinite(next) || next < 0 || next > 65_535) {
        throw new Error(`--port expects a number 0..65535 (got ${raw ?? '<missing>'})`);
      }
      port = next;
      i += 1;
      continue;
    }
    if (token.startsWith('--port=')) {
      const raw = token.slice('--port='.length);
      const next = Number(raw);
      if (!Number.isFinite(next) || next < 0 || next > 65_535) {
        throw new Error(`--port expects a number 0..65535 (got ${raw})`);
      }
      port = next;
      continue;
    }
    if (token === '--host') {
      const raw = argv[i + 1];
      if (!raw) throw new Error('--host expects a value');
      host = raw;
      i += 1;
      continue;
    }
    if (token.startsWith('--host=')) {
      host = token.slice('--host='.length);
      continue;
    }
    if (token === '--db') {
      const raw = argv[i + 1];
      if (!raw) throw new Error('--db expects a path');
      dbPath = raw;
      i += 1;
      continue;
    }
    if (token.startsWith('--db=')) {
      dbPath = token.slice('--db='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  const parsed: ParsedDashboardArgs = { port, host, open, help };
  if (dbPath !== undefined) parsed.dbPath = dbPath;
  return parsed;
}

export function renderDashboardHelp(): string {
  return [
    'Usage: npx @erne/monitor dashboard [flags]',
    '',
    'Flags:',
    '  --port <n>        Port to listen on (default: 3333, 0 picks an ephemeral port)',
    '  --host <h>        Host interface to bind (default: 127.0.0.1)',
    '  --db <path>       SQLite file (default: ~/.erne/monitor/dashboard.db)',
    '  --open            Open the dashboard URL in the default browser',
    '  --no-open         Skip opening the browser (default)',
    '  -h, --help        Show this message',
    '',
    'The server persists ingested events to SQLite. Press Ctrl-C to stop.',
  ].join('\n');
}

/**
 * Main command entry. Returns the exit code Node should use.
 *
 * - Prints help and exits 0 on `--help`.
 * - Prints a usage hint and exits 1 on arg parse failures.
 * - Starts the server, logs the URL, optionally opens a browser, waits for
 *   SIGINT / SIGTERM, shuts down cleanly.
 */
export async function runDashboardCommand(
  argv: string[],
  deps: DashboardCliDeps = {},
): Promise<number> {
  const logger = deps.logger ?? {
    info: (msg: string) => {
      console.log(msg);
    },
    error: (msg: string) => {
      console.error(msg);
    },
  };

  let parsed: ParsedDashboardArgs;
  try {
    parsed = parseDashboardArgs(argv);
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
    logger.error(renderDashboardHelp());
    return 1;
  }

  if (parsed.help) {
    logger.info(renderDashboardHelp());
    return 0;
  }

  const launcher = deps.launcher ?? defaultLauncher;
  const browserOpener = deps.browserOpener ?? defaultBrowserOpener;
  const waitForExit = deps.waitForExit ?? defaultWaitForExit;

  const launchConfig: DashboardLaunchConfig = { port: parsed.port, host: parsed.host };
  if (parsed.dbPath !== undefined) launchConfig.dbPath = parsed.dbPath;

  let handle: DashboardLaunchHandle;
  try {
    handle = await launcher(launchConfig);
  } catch (err) {
    logger.error(
      '[@erne/monitor] failed to start dashboard server: ' +
        (err instanceof Error ? err.message : String(err)),
    );
    return 1;
  }

  logger.info(`[@erne/monitor] dashboard listening on ${handle.url}`);
  logger.info('[@erne/monitor] press Ctrl-C to stop');

  if (parsed.open) {
    try {
      await browserOpener(handle.url);
    } catch (err) {
      logger.error(
        '[@erne/monitor] could not open browser (continuing): ' +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  try {
    await waitForExit();
  } finally {
    try {
      await handle.close();
    } catch (err) {
      logger.error(
        '[@erne/monitor] error during shutdown: ' +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Default wiring — only used outside tests.

interface ServerModuleShape {
  startDashboardServer: (options: {
    port?: number;
    host?: string;
    dbPath?: string;
  }) => Promise<{ url: string; port: number; close: () => Promise<void> }>;
}

async function defaultLauncher(
  config: DashboardLaunchConfig,
): Promise<DashboardLaunchHandle> {
  // Lazy import so `npx @erne/monitor init` (which never touches the server)
  // doesn't pay for the better-sqlite3 + ws load + native binding probe.
  // Dynamic string keeps tsc happy without adding the server as a hard dep —
  // the server is shipped alongside the monitor package at publish time; if
  // the consumer's install is missing it we surface an actionable hint.
  const moduleId = '@erne/monitor-dashboard-server';
  let server: ServerModuleShape;
  try {
    const loaded = (await import(moduleId)) as unknown;
    server = loaded as ServerModuleShape;
  } catch (err) {
    // The direct import resolves from the compiled CLI's install location,
    // which for a symlinked `file:` dep points back at the SDK source — not
    // the user's project node_modules. Fall back to resolving from the
    // user's cwd so workspace + symlinked installs still work.
    try {
      const { createRequire } = await import('node:module');
      const requireFromCwd = createRequire(`${process.cwd()}/package.json`);
      const resolved = requireFromCwd.resolve(moduleId);
      const loaded = (await import(resolved)) as unknown;
      server = loaded as ServerModuleShape;
    } catch {
      const hint =
        'Install the dashboard server: `npm i @erne/monitor-dashboard-server` (or run via `npx @erne/monitor dashboard` once the server is bundled).';
      throw new Error(
        `could not resolve @erne/monitor-dashboard-server — ${err instanceof Error ? err.message : String(err)}. ${hint}`,
      );
    }
  }
  const handle = await server.startDashboardServer({
    port: config.port,
    host: config.host,
    ...(config.dbPath ? { dbPath: config.dbPath } : {}),
  });
  return {
    url: handle.url,
    port: handle.port,
    close: handle.close,
  };
}

async function defaultBrowserOpener(url: string): Promise<void> {
  const platform = process.platform;
  const { spawn } = await import('node:child_process');
  const [cmd, ...args] =
    platform === 'darwin'
      ? ['open', url]
      : platform === 'win32'
        ? ['cmd', '/c', 'start', '', url]
        : ['xdg-open', url];
  // detach so killing the CLI doesn't drag the browser down with it
  spawn(cmd!, args, { stdio: 'ignore', detached: true }).unref();
}

function defaultWaitForExit(): Promise<void> {
  return new Promise<void>((resolve) => {
    const once = (): void => {
      process.off('SIGINT', once);
      process.off('SIGTERM', once);
      resolve();
    };
    process.once('SIGINT', once);
    process.once('SIGTERM', once);
  });
}

