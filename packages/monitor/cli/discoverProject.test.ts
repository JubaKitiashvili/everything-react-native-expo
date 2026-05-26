import {
  discoverProject,
  parseDiscoverArgs,
  renderDiscoverHelp,
  renderDiscoverReport,
  runDiscoverCommand,
  type DiscoverReport,
  type SourceInput,
} from './discoverProject';

// Helper: run the pure analyzer over an in-memory { path: contents } map.
// No filesystem, no compiler project — just `ts.createSourceFile` internally.
function discoverFixtures(files: Record<string, string>): DiscoverReport {
  const sources: SourceInput[] = Object.entries(files).map(([path, contents]) => ({
    path,
    contents,
  }));
  return discoverProject(sources);
}

function routePaths(report: DiscoverReport): string[] {
  return report.routes.map((r) => r.path);
}

describe('discoverProject — Expo Router routes', () => {
  test('app/index.tsx maps to "/" and confirms a default export', () => {
    const report = discoverFixtures({
      'app/index.tsx': `export default function Home() { return null; }`,
    });
    expect(report.routes).toHaveLength(1);
    expect(report.routes[0]?.path).toBe('/');
    expect(report.routes[0]?.hasDefaultExport).toBe(true);
  });

  test('nested static routes join with slashes', () => {
    const report = discoverFixtures({
      'app/settings/index.tsx': `export default function S(){ return null; }`,
      'app/settings/profile.tsx': `export default function P(){ return null; }`,
    });
    expect(routePaths(report).sort()).toEqual(['/settings', '/settings/profile']);
  });

  test('dynamic [param] segments become :param', () => {
    const report = discoverFixtures({
      'app/users/[id].tsx': `export default function User(){ return null; }`,
    });
    expect(routePaths(report)).toEqual(['/users/:id']);
  });

  test('catch-all [...rest] becomes *', () => {
    const report = discoverFixtures({
      'app/blog/[...slug].tsx': `export default function Blog(){ return null; }`,
    });
    expect(routePaths(report)).toEqual(['/blog/*']);
  });

  test('grouped (group) segments are omitted from the route path', () => {
    const report = discoverFixtures({
      'app/(tabs)/home.tsx': `export default function H(){ return null; }`,
      'app/(auth)/login.tsx': `export default function L(){ return null; }`,
    });
    expect(routePaths(report).sort()).toEqual(['/home', '/login']);
  });

  test('grouped index collapses to its parent path ("/")', () => {
    const report = discoverFixtures({
      'app/(tabs)/index.tsx': `export default function H(){ return null; }`,
    });
    expect(routePaths(report)).toEqual(['/']);
  });

  test('_layout files are not treated as routes', () => {
    const report = discoverFixtures({
      'app/_layout.tsx': `import { Stack } from 'expo-router'; export default function L(){ return <Stack/>; }`,
      'app/index.tsx': `export default function H(){ return null; }`,
    });
    expect(routePaths(report)).toEqual(['/']);
  });

  test('supports a src/app layout', () => {
    const report = discoverFixtures({
      'src/app/about.tsx': `export default function A(){ return null; }`,
    });
    expect(routePaths(report)).toEqual(['/about']);
  });

  test('flags a route file with no default export', () => {
    const report = discoverFixtures({
      'app/orphan.tsx': `export const Orphan = () => null;`,
    });
    expect(report.routes[0]?.path).toBe('/orphan');
    expect(report.routes[0]?.hasDefaultExport).toBe(false);
  });

  test('detects `export default Identifier` assignment form', () => {
    const report = discoverFixtures({
      'app/named.tsx': `const Screen = () => null; export default Screen;`,
    });
    expect(report.routes[0]?.hasDefaultExport).toBe(true);
  });

  test('files outside app/ are not routes', () => {
    const report = discoverFixtures({
      'src/components/Button.tsx': `export default function B(){ return null; }`,
    });
    expect(report.routes).toHaveLength(0);
  });
});

describe('discoverProject — React Navigation screens', () => {
  test('detects <Stack.Screen name="..."> self-closing and child forms', () => {
    const report = discoverFixtures({
      'Nav.tsx': `
        const Stack = createStackNavigator();
        export function Nav(){
          return (
            <Stack.Navigator>
              <Stack.Screen name="Home" component={Home} />
              <Stack.Screen name="Details">{() => <Details/>}</Stack.Screen>
            </Stack.Navigator>
          );
        }
      `,
    });
    expect(report.screens.map((s) => s.name).sort()).toEqual(['Details', 'Home']);
    expect(report.screens.every((s) => s.navigator === 'Stack')).toBe(true);
  });

  test('detects Tab.Screen and tracks the navigator prefix', () => {
    const report = discoverFixtures({
      'Tabs.tsx': `
        const Tab = createBottomTabNavigator();
        const N = () => (
          <Tab.Navigator>
            <Tab.Screen name="Feed" component={Feed} />
            <Tab.Screen name="Profile" component={Profile} />
          </Tab.Navigator>
        );
      `,
    });
    expect(report.screens).toHaveLength(2);
    expect(report.screens.map((s) => `${s.navigator}:${s.name}`)).toEqual([
      'Tab:Feed',
      'Tab:Profile',
    ]);
  });

  test('reads a name passed via a JSX expression string literal', () => {
    const report = discoverFixtures({
      'X.tsx': `const S = () => <Stack.Screen name={'Settings'} />;`,
    });
    expect(report.screens).toEqual([
      { name: 'Settings', navigator: 'Stack', file: 'X.tsx' },
    ]);
  });

  test('ignores non-Screen JSX and screens without a static name', () => {
    const report = discoverFixtures({
      'Y.tsx': `const S = () => (<><Stack.Navigator /><Stack.Screen name={routeName} /><Other.Screen name="X" /></>);`,
    });
    // Stack.Screen with a dynamic name is skipped; Other.Screen with a static
    // name IS captured (any *.Screen is a valid navigator screen).
    expect(report.screens).toEqual([{ name: 'X', navigator: 'Other', file: 'Y.tsx' }]);
  });
});

describe('discoverProject — API calls', () => {
  test('detects fetch() with a string literal URL, defaulting to GET', () => {
    const report = discoverFixtures({
      'api.ts': `export const load = () => fetch('https://api.dev/users');`,
    });
    expect(report.apiCalls).toEqual([
      { url: 'https://api.dev/users', method: 'GET', client: 'fetch', file: 'api.ts' },
    ]);
  });

  test('reads the method from a fetch options object', () => {
    const report = discoverFixtures({
      'api.ts': `fetch('https://api.dev/users', { method: 'post', body: '{}' });`,
    });
    expect(report.apiCalls[0]).toMatchObject({ url: 'https://api.dev/users', method: 'POST' });
  });

  test('detects axios.get / axios.post with their methods', () => {
    const report = discoverFixtures({
      'client.ts': `
        axios.get('https://api.dev/a');
        axios.post('https://api.dev/b', { x: 1 });
      `,
    });
    expect(report.apiCalls.map((c) => `${c.method} ${c.url ?? '?'}`)).toEqual([
      'GET https://api.dev/a',
      'POST https://api.dev/b',
    ]);
    expect(report.apiCalls.every((c) => c.client === 'axios')).toBe(true);
  });

  test('detects axios(config) and axios.request(config) object forms', () => {
    const report = discoverFixtures({
      'c.ts': `
        axios({ url: 'https://api.dev/cfg', method: 'put' });
        axios.request({ url: 'https://api.dev/req', method: 'delete' });
      `,
    });
    expect(report.apiCalls).toEqual([
      { url: 'https://api.dev/cfg', method: 'PUT', client: 'axios', file: 'c.ts' },
      { url: 'https://api.dev/req', method: 'DELETE', client: 'axios', file: 'c.ts' },
    ]);
  });

  test('records a null URL for dynamic (template) endpoints', () => {
    const report = discoverFixtures({
      'd.ts': 'const id = 1; fetch(`https://api.dev/users/${id}`);',
    });
    expect(report.apiCalls).toHaveLength(1);
    expect(report.apiCalls[0]?.url).toBeNull();
    expect(report.apiCalls[0]?.method).toBe('GET');
  });

  test('does not flag .prefetch / refetch lookalikes', () => {
    const report = discoverFixtures({
      'e.ts': `Image.prefetch('x'); const q = useQuery(); q.refetch();`,
    });
    expect(report.apiCalls).toHaveLength(0);
  });
});

describe('discoverProject — combined + edge cases', () => {
  test('a full mixed project surfaces routes, screens, and api calls together', () => {
    const report = discoverFixtures({
      'app/index.tsx': `export default function Home(){ return null; }`,
      'app/users/[id].tsx': `
        export default function User(){
          fetch('https://api.dev/me');
          return null;
        }
      `,
      'src/Nav.tsx': `
        const Stack = createNativeStackNavigator();
        const N = () => <Stack.Navigator><Stack.Screen name="Root" /></Stack.Navigator>;
      `,
    });
    expect(routePaths(report).sort()).toEqual(['/', '/users/:id']);
    expect(report.screens).toEqual([{ name: 'Root', navigator: 'Stack', file: 'src/Nav.tsx' }]);
    expect(report.apiCalls).toHaveLength(1);
    expect(report.filesScanned).toBe(3);
  });

  test('a project with no matches yields empty arrays', () => {
    const report = discoverFixtures({
      'src/util.ts': `export const add = (a: number, b: number) => a + b;`,
    });
    expect(report.routes).toEqual([]);
    expect(report.screens).toEqual([]);
    expect(report.apiCalls).toEqual([]);
    expect(report.filesScanned).toBe(1);
  });

  test('output is deterministic regardless of input file order', () => {
    const files = {
      'app/b.tsx': `export default function B(){ return null; }`,
      'app/a.tsx': `export default function A(){ return null; }`,
    };
    const forward = discoverFixtures(files);
    const reversed = discoverProject(
      Object.entries(files)
        .reverse()
        .map(([path, contents]) => ({ path, contents })),
    );
    expect(routePaths(forward)).toEqual(routePaths(reversed));
    expect(routePaths(forward)).toEqual(['/a', '/b']);
  });
});

describe('parseDiscoverArgs', () => {
  test('defaults to cwd, no json, no help', () => {
    const parsed = parseDiscoverArgs([]);
    expect(parsed.json).toBe(false);
    expect(parsed.help).toBe(false);
    expect(parsed.path).toBe(process.cwd());
  });

  test('accepts a positional path and --json', () => {
    const parsed = parseDiscoverArgs(['/some/app', '--json']);
    expect(parsed.path).toBe('/some/app');
    expect(parsed.json).toBe(true);
  });

  test('-h sets help', () => {
    expect(parseDiscoverArgs(['-h']).help).toBe(true);
  });

  test('rejects unknown flags and extra positionals', () => {
    expect(() => parseDiscoverArgs(['--bogus'])).toThrow(/Unknown argument/);
    expect(() => parseDiscoverArgs(['/a', '/b'])).toThrow(/extra argument/);
  });
});

describe('renderDiscoverReport', () => {
  test('renders routes, screens, and api calls', () => {
    const report = discoverFixtures({
      'app/users/[id].tsx': `export default function U(){ fetch('https://api.dev/u'); return null; }`,
      'Nav.tsx': `const N = () => <Stack.Screen name="Home" />;`,
    });
    const out = renderDiscoverReport(report);
    expect(out).toContain('@erne/monitor discover');
    expect(out).toContain('/users/:id');
    expect(out).toContain('Stack.Screen  Home');
    expect(out).toContain('https://api.dev/u');
  });

  test('shows (none) for absent categories', () => {
    const report = discoverFixtures({ 'pure.ts': `export const x = 1;` });
    const out = renderDiscoverReport(report);
    expect(out).toMatch(/Routes \(0\):\s+\(none\)/);
    expect(out).toMatch(/Screens \(0\):\s+\(none\)/);
    expect(out).toMatch(/API calls \(0\):\s+\(none\)/);
  });

  test('marks routes lacking a default export', () => {
    const report = discoverFixtures({ 'app/x.tsx': `export const X = () => null;` });
    expect(renderDiscoverReport(report)).toContain('(no default export)');
  });
});

describe('runDiscoverCommand', () => {
  function makeLogger() {
    const info: string[] = [];
    const error: string[] = [];
    return {
      info,
      error,
      logger: { info: (m: string) => info.push(m), error: (m: string) => error.push(m) },
    };
  }

  test('--help prints usage and exits 0 without analyzing', () => {
    const { info, logger } = makeLogger();
    const analyze = jest.fn();
    const code = runDiscoverCommand(['--help'], { logger, analyze });
    expect(code).toBe(0);
    expect(analyze).not.toHaveBeenCalled();
    expect(info.join('\n')).toContain('Usage: npx @erne/monitor discover');
  });

  test('runs the analyzer and prints a pretty report by default', () => {
    const { info, logger } = makeLogger();
    const report = discoverFixtures({ 'app/index.tsx': `export default function H(){ return null; }` });
    const analyze = jest.fn(() => report);
    const code = runDiscoverCommand(['/app'], { logger, analyze });
    expect(code).toBe(0);
    expect(analyze).toHaveBeenCalledWith('/app');
    expect(info.join('\n')).toContain('Routes (1):');
  });

  test('--json emits machine-readable output', () => {
    const { info, logger } = makeLogger();
    const report = discoverFixtures({
      'api.ts': `fetch('https://api.dev/x');`,
    });
    const analyze = jest.fn(() => report);
    const code = runDiscoverCommand(['--json'], { logger, analyze });
    expect(code).toBe(0);
    const parsed = JSON.parse(info.join('\n')) as DiscoverReport;
    expect(parsed.apiCalls[0]?.url).toBe('https://api.dev/x');
  });

  test('reports a clear error and exits 1 when the analyzer throws', () => {
    const { error, logger } = makeLogger();
    const analyze = jest.fn(() => {
      throw new Error('ENOENT: no such directory');
    });
    const code = runDiscoverCommand(['/missing'], { logger, analyze });
    expect(code).toBe(1);
    expect(error.some((l) => l.includes('ENOENT'))).toBe(true);
  });

  test('exits 1 on bad args', () => {
    const { error, logger } = makeLogger();
    const code = runDiscoverCommand(['--nope'], { logger });
    expect(code).toBe(1);
    expect(error.some((l) => l.includes('Unknown argument'))).toBe(true);
  });
});

describe('renderDiscoverHelp', () => {
  test('documents path argument and flags', () => {
    const help = renderDiscoverHelp();
    expect(help).toContain('[path]');
    expect(help).toContain('--json');
    expect(help).toContain('--help');
  });
});
