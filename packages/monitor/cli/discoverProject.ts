// `npx @erne/monitor discover [path]` — AST-based auto-discovery of a
// consumer's app surface: Expo Router routes, React Navigation screens, and
// API client call sites (fetch / axios). This complements `scan` (which
// recommends *collectors*) and `detect-project` (which reads deps): discover
// tells you *what* the app exposes so monitoring can be wired to real routes,
// screens, and endpoints.
//
// The analysis core — `discoverProject(sourceFiles)` — is a pure function over
// in-memory `{ path, contents }` source files, built with the TypeScript
// compiler API directly (`ts.createSourceFile`). No `ts-morph`, no
// filesystem, no type-checker — purely syntactic, so the whole discovery
// matrix is unit-testable with virtual sources. The CLI shell
// (`runDiscoverCommand`) wires up argument parsing, a real on-disk file read,
// JSON / pretty output, and an injectable logger for tests.

import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

// ---------------------------------------------------------------------------
// Report model

/** Where a route came from — Expo Router file conventions. */
export interface DiscoveredRoute {
  /** Normalised route path, e.g. '/', '/settings', '/users/:id'. */
  path: string;
  /** Source file the route was derived from (as supplied to the analyzer). */
  file: string;
  /** True when the file exposes a default export (a route component). */
  hasDefaultExport: boolean;
}

/** A React Navigation screen, by navigator kind + declared name. */
export interface DiscoveredScreen {
  name: string;
  /** Navigator kind inferred from the JSX tag / factory, e.g. 'Stack'. */
  navigator: string;
  file: string;
}

/** An API call site found at a `fetch(...)` / `axios(...)` call. */
export interface DiscoveredApiCall {
  /** String-literal URL when statically resolvable, else null (dynamic). */
  url: string | null;
  /** HTTP method — uppercased. 'GET' is the default when none is given. */
  method: string;
  /** The client used — 'fetch' or 'axios'. */
  client: 'fetch' | 'axios';
  file: string;
}

export interface DiscoverReport {
  routes: DiscoveredRoute[];
  screens: DiscoveredScreen[];
  apiCalls: DiscoveredApiCall[];
  filesScanned: number;
}

/** A virtual source file: a (normalised) path plus its raw contents. */
export interface SourceInput {
  path: string;
  contents: string;
}

// ---------------------------------------------------------------------------
// Expo Router route derivation (file-path → route, AST-confirmed component)

/**
 * Returns the Expo Router segment that owns `app/` in a normalised path, or
 * null when the file is not under an `app/` directory. Handles both `app/...`
 * and `src/app/...` layouts.
 */
function appRelativeSegments(filePath: string): string[] | null {
  const parts = filePath.split('/').filter((p) => p.length > 0);
  // Find the LAST `app` segment so `src/app/...` and `app/...` both work and a
  // nested `app` folder (rare) prefers the inner route root.
  let appIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === 'app') appIdx = i;
  }
  if (appIdx === -1) return null;
  return parts.slice(appIdx + 1);
}

const ROUTE_EXTENSIONS = new Set(['.tsx', '.jsx', '.ts', '.js']);

/** Strips a known route file extension; returns null if extension unknown. */
function stripRouteExtension(fileName: string): string | null {
  const ext = path.extname(fileName);
  if (!ROUTE_EXTENSIONS.has(ext)) return null;
  return fileName.slice(0, fileName.length - ext.length);
}

/**
 * Maps Expo Router file segments to a route path. Returns null when the file
 * is not a route (layouts, special files, unknown extensions).
 *
 * Conventions handled:
 *   index            → '' (collapses to '/')
 *   [param]          → ':param'
 *   [...rest]        → '*'
 *   (group)          → omitted (layout group, no URL impact)
 *   _layout / +html  → not a route (null)
 *   +not-found       → '/+not-found'
 */
function segmentsToRoutePath(segments: string[]): string | null {
  if (segments.length === 0) return null;

  const fileSeg = segments[segments.length - 1];
  if (fileSeg === undefined) return null;
  const base = stripRouteExtension(fileSeg);
  if (base === null) return null;

  // `_layout` and other underscore-prefixed files are not routes.
  if (base.startsWith('_')) return null;

  const dirSegments = segments.slice(0, -1);
  const out: string[] = [];

  for (const seg of dirSegments) {
    // Grouped segment `(group)` — no URL impact.
    if (seg.startsWith('(') && seg.endsWith(')')) continue;
    const mapped = mapDynamicSegment(seg);
    out.push(mapped);
  }

  // The file segment itself.
  if (base === 'index') {
    // index collapses — contributes nothing beyond its directory.
  } else {
    out.push(mapDynamicSegment(base));
  }

  const route = '/' + out.join('/');
  // Collapse a trailing slash from an empty join (e.g. app/index.tsx → '/').
  return route === '/' ? '/' : route.replace(/\/$/, '');
}

/** Converts a single path segment, resolving [param] / [...rest] dynamics. */
function mapDynamicSegment(seg: string): string {
  // Catch-all: [...rest] → '*'
  const catchAll = /^\[\.\.\.(.+)\]$/.exec(seg);
  if (catchAll) return '*';
  // Dynamic: [param] → ':param'
  const dynamic = /^\[(.+)\]$/.exec(seg);
  if (dynamic && dynamic[1]) return ':' + dynamic[1];
  return seg;
}

/** True when the source file declares a default export of any kind. */
function hasDefaultExport(sf: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    // `export default ...`
    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      found = true;
      return;
    }
    // `export default function/class ...` carries a default modifier.
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    if (modifiers) {
      const hasExport = modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      const hasDefault = modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      if (hasExport && hasDefault) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

// ---------------------------------------------------------------------------
// React Navigation screen detection (JSX <X.Screen name="..."> + factories)

const NAVIGATOR_FACTORY_RE = /^create([A-Za-z]+?)Navigator$/;

/** Extracts a string-literal value from an expression, else null. */
function literalString(node: ts.Expression | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

/** Reads a named JSX attribute's string-literal value, else null. */
function jsxStringAttr(
  attributes: ts.JsxAttributes,
  attrName: string,
): string | null {
  for (const attr of attributes.properties) {
    if (!ts.isJsxAttribute(attr)) continue;
    if (attr.name.getText() !== attrName) continue;
    const init = attr.initializer;
    if (!init) return null;
    if (ts.isStringLiteral(init)) return init.text;
    if (ts.isJsxExpression(init) && init.expression) {
      return literalString(init.expression);
    }
  }
  return null;
}

/**
 * Given a JSX tag name like `Stack.Screen` / `Tab.Screen`, returns the
 * navigator prefix (`Stack`, `Tab`) when the tag is a `*.Screen`, else null.
 */
function screenNavigatorFromTag(tagName: ts.JsxTagNameExpression): string | null {
  if (ts.isPropertyAccessExpression(tagName)) {
    if (tagName.name.text !== 'Screen') return null;
    const owner = tagName.expression;
    if (ts.isIdentifier(owner)) return owner.text;
  }
  return null;
}

// ---------------------------------------------------------------------------
// API call detection (fetch(...) / axios(...) / axios.method(...))

const AXIOS_METHODS = new Set([
  'get',
  'post',
  'put',
  'delete',
  'patch',
  'head',
  'options',
  'request',
]);

/**
 * Pulls a URL from a fetch/axios call's first argument. Supports a bare
 * string literal or an options object with a `url` property. Returns null when
 * the URL is dynamic (template with substitutions, variable, etc.).
 */
function urlFromArg(arg: ts.Expression | undefined): string | null {
  if (!arg) return null;
  const direct = literalString(arg);
  if (direct !== null) return direct;
  // axios({ url: '...' }) / axios.request({ url: '...' })
  if (ts.isObjectLiteralExpression(arg)) {
    for (const prop of arg.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        ((ts.isIdentifier(prop.name) && prop.name.text === 'url') ||
          (ts.isStringLiteral(prop.name) && prop.name.text === 'url'))
      ) {
        return literalString(prop.initializer);
      }
    }
  }
  return null;
}

/**
 * Reads an HTTP method from a fetch options object's `method` property, or
 * from an axios config object. Defaults to 'GET'. Always uppercased.
 */
function methodFromOptions(arg: ts.Expression | undefined): string {
  if (arg && ts.isObjectLiteralExpression(arg)) {
    for (const prop of arg.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        ((ts.isIdentifier(prop.name) && prop.name.text === 'method') ||
          (ts.isStringLiteral(prop.name) && prop.name.text === 'method'))
      ) {
        const m = literalString(prop.initializer);
        if (m) return m.toUpperCase();
      }
    }
  }
  return 'GET';
}

/** Detects an API call expression; returns the discovered call or null. */
function apiCallFrom(node: ts.CallExpression, file: string): DiscoveredApiCall | null {
  const callee = node.expression;
  const args = node.arguments;

  // fetch(url, options?)
  if (ts.isIdentifier(callee) && callee.text === 'fetch') {
    return {
      url: urlFromArg(args[0]),
      method: methodFromOptions(args[1]),
      client: 'fetch',
      file,
    };
  }

  // axios(config) / axios(url, config?)
  if (ts.isIdentifier(callee) && callee.text === 'axios') {
    const first = args[0];
    if (first && ts.isObjectLiteralExpression(first)) {
      return { url: urlFromArg(first), method: methodFromOptions(first), client: 'axios', file };
    }
    return { url: urlFromArg(first), method: methodFromOptions(args[1]), client: 'axios', file };
  }

  // axios.get(url, ...) / axios.post(url, data?, config?) / axios.request(config)
  if (ts.isPropertyAccessExpression(callee)) {
    const owner = callee.expression;
    const member = callee.name.text;
    if (ts.isIdentifier(owner) && owner.text === 'axios' && AXIOS_METHODS.has(member)) {
      if (member === 'request') {
        const cfg = args[0];
        return { url: urlFromArg(cfg), method: methodFromOptions(cfg), client: 'axios', file };
      }
      return { url: urlFromArg(args[0]), method: member.toUpperCase(), client: 'axios', file };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Per-file AST walk

interface FileFindings {
  screens: DiscoveredScreen[];
  apiCalls: DiscoveredApiCall[];
}

function walkFile(sf: ts.SourceFile, file: string): FileFindings {
  const screens: DiscoveredScreen[] = [];
  const apiCalls: DiscoveredApiCall[] = [];

  const recordScreen = (
    tagName: ts.JsxTagNameExpression,
    attributes: ts.JsxAttributes,
  ): void => {
    const navigator = screenNavigatorFromTag(tagName);
    if (!navigator) return;
    const name = jsxStringAttr(attributes, 'name');
    if (name === null) return;
    screens.push({ name, navigator, file });
  };

  const visit = (node: ts.Node): void => {
    // <Stack.Screen name="..." /> (self-closing)
    if (ts.isJsxSelfClosingElement(node)) {
      recordScreen(node.tagName, node.attributes);
    }
    // <Tab.Screen name="...">...</Tab.Screen>
    if (ts.isJsxElement(node)) {
      recordScreen(node.openingElement.tagName, node.openingElement.attributes);
    }
    // fetch / axios call sites
    if (ts.isCallExpression(node)) {
      const call = apiCallFrom(node, file);
      if (call) apiCalls.push(call);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  return { screens, apiCalls };
}

// ---------------------------------------------------------------------------
// Pure analysis core

/**
 * Parses each source with the TypeScript compiler API and returns a
 * deterministic discovery report. Pure: no disk, no network, no type-checker.
 */
export function discoverProject(sources: readonly SourceInput[]): DiscoverReport {
  const routes: DiscoveredRoute[] = [];
  const screens: DiscoveredScreen[] = [];
  const apiCalls: DiscoveredApiCall[] = [];

  // Sort by path so output ordering is deterministic regardless of input order.
  const ordered = [...sources].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  for (const { path: filePath, contents } of ordered) {
    const sf = ts.createSourceFile(
      filePath,
      contents,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      scriptKindFor(filePath),
    );

    // Expo Router route, derived from the path + AST-confirmed component.
    const segments = appRelativeSegments(filePath);
    if (segments) {
      const routePath = segmentsToRoutePath(segments);
      if (routePath !== null) {
        routes.push({ path: routePath, file: filePath, hasDefaultExport: hasDefaultExport(sf) });
      }
    }

    const { screens: fileScreens, apiCalls: fileApiCalls } = walkFile(sf, filePath);
    screens.push(...fileScreens);
    apiCalls.push(...fileApiCalls);
  }

  return { routes, screens, apiCalls, filesScanned: ordered.length };
}

function scriptKindFor(filePath: string): ts.ScriptKind {
  const ext = path.extname(filePath);
  switch (ext) {
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.ts':
      return ts.ScriptKind.TS;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.js':
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TSX;
  }
}

// ---------------------------------------------------------------------------
// Pretty renderer (pure)

export function renderDiscoverReport(report: DiscoverReport): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('@erne/monitor discover');
  lines.push(`Files scanned: ${report.filesScanned}`);
  lines.push('');

  lines.push(`Routes (${report.routes.length}):`);
  if (report.routes.length === 0) {
    lines.push('  (none)');
  } else {
    for (const r of report.routes) {
      const flag = r.hasDefaultExport ? '' : '  (no default export)';
      lines.push(`  ${r.path}${flag}`);
    }
  }
  lines.push('');

  lines.push(`Screens (${report.screens.length}):`);
  if (report.screens.length === 0) {
    lines.push('  (none)');
  } else {
    for (const s of report.screens) {
      lines.push(`  ${s.navigator}.Screen  ${s.name}`);
    }
  }
  lines.push('');

  lines.push(`API calls (${report.apiCalls.length}):`);
  if (report.apiCalls.length === 0) {
    lines.push('  (none)');
  } else {
    for (const c of report.apiCalls) {
      lines.push(`  ${c.method.padEnd(7)} ${c.url ?? '(dynamic)'}  [${c.client}]`);
    }
  }
  lines.push('');
  lines.push('Run `npx @erne/monitor discover --json` for machine output.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI shell

export interface ParsedDiscoverArgs {
  path: string;
  json: boolean;
  help: boolean;
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.expo', '.git']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

export function parseDiscoverArgs(argv: readonly string[]): ParsedDiscoverArgs {
  let projectPath = process.cwd();
  let json = false;
  let help = false;
  let sawPath = false;

  for (const token of argv) {
    if (!token) continue;
    if (token === '--help' || token === '-h') {
      help = true;
      continue;
    }
    if (token === '--json') {
      json = true;
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

  return { path: projectPath, json, help };
}

export function renderDiscoverHelp(): string {
  return [
    'Usage: npx @erne/monitor discover [path] [flags]',
    '',
    'Statically discovers a React Native / Expo app surface: Expo Router',
    'routes, React Navigation screens, and fetch/axios API call sites. Uses',
    'the TypeScript compiler API — no code is executed.',
    '',
    'Arguments:',
    '  path           Project root to scan (default: current directory)',
    '',
    'Flags:',
    '  --json         Emit the structured report as JSON',
    '  -h, --help     Show this message',
  ].join('\n');
}

export interface DiscoverCliDeps {
  logger?: { info: (msg: string) => void; error: (msg: string) => void };
  /**
   * Injectable analyzer. Defaults to reading source files from disk and
   * running `discoverProject`. Tests pass a stub to avoid disk I/O.
   */
  analyze?: (projectPath: string) => DiscoverReport;
}

/**
 * Recursively collects source files under `root`, skipping vendor / build
 * directories and `.test.*` files. Paths are returned forward-slashed and
 * relative to `root` so route derivation is stable across platforms.
 */
function collectSources(root: string): SourceInput[] {
  const out: SourceInput[] = [];
  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name);
      if (!SOURCE_EXTENSIONS.has(ext)) continue;
      if (/\.test\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
      let contents: string;
      try {
        contents = fs.readFileSync(abs, 'utf8');
      } catch {
        continue;
      }
      const rel = path.relative(root, abs).split(path.sep).join('/');
      out.push({ path: rel, contents });
    }
  };
  walk(root);
  return out;
}

/** Reads source files from the real filesystem and runs `discoverProject`. */
export function discoverProjectAtPath(projectPath: string): DiscoverReport {
  return discoverProject(collectSources(projectPath));
}

export function runDiscoverCommand(
  argv: readonly string[],
  deps: DiscoverCliDeps = {},
): number {
  const logger = deps.logger ?? {
    info: (msg: string) => console.log(msg),
    error: (msg: string) => console.error(msg),
  };

  let parsed: ParsedDiscoverArgs;
  try {
    parsed = parseDiscoverArgs(argv);
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
    logger.error(renderDiscoverHelp());
    return 1;
  }

  if (parsed.help) {
    logger.info(renderDiscoverHelp());
    return 0;
  }

  const analyze = deps.analyze ?? discoverProjectAtPath;
  let report: DiscoverReport;
  try {
    report = analyze(parsed.path);
  } catch (err) {
    logger.error(
      '[@erne/monitor] discover failed: ' + (err instanceof Error ? err.message : String(err)),
    );
    return 1;
  }

  if (parsed.json) {
    logger.info(JSON.stringify(report, null, 2));
  } else {
    logger.info(renderDiscoverReport(report));
  }
  return 0;
}
