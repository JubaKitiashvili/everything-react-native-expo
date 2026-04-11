import { transformSync } from '@babel/core';
import ernePlugin, { _testing } from './index';
import type { ErneMonitorPluginOptions } from './index';

const jsxPreset = require.resolve('@babel/preset-react');
const tsPreset = require.resolve('@babel/preset-typescript');

function transform(
  code: string,
  opts: ErneMonitorPluginOptions = {},
  filename: string = '/app/src/Sample.tsx',
): string {
  const out = transformSync(code, {
    filename,
    presets: [
      [jsxPreset, { runtime: 'classic' }],
      [tsPreset, { isTSX: true, allExtensions: true }],
    ],
    plugins: [[ernePlugin, opts]],
    babelrc: false,
    configFile: false,
  });
  if (!out || !out.code) throw new Error('transform produced no output');
  return out.code;
}

describe('@erne/monitor babel plugin', () => {
  describe('shouldProcessFile', () => {
    it('defaults to accepting any file outside node_modules', () => {
      expect(_testing.shouldProcessFile('/app/src/Foo.tsx', {})).toBe(true);
      expect(
        _testing.shouldProcessFile('/app/node_modules/pkg/index.js', {}),
      ).toBe(false);
    });

    it('respects include globs', () => {
      const opts = { include: [/src\//] };
      expect(_testing.shouldProcessFile('/app/src/Foo.tsx', opts)).toBe(true);
      expect(_testing.shouldProcessFile('/app/lib/Foo.tsx', opts)).toBe(false);
    });

    it('respects exclude globs', () => {
      const opts = { exclude: [/\.test\./] };
      expect(_testing.shouldProcessFile('/app/src/Foo.tsx', opts)).toBe(true);
      expect(_testing.shouldProcessFile('/app/src/Foo.test.tsx', opts)).toBe(
        false,
      );
    });
  });

  describe('displayName injection', () => {
    it('adds displayName to an arrow function component', () => {
      const out = transform(`
        const Profile = ({ name }) => <Text>{name}</Text>;
      `);
      expect(out).toContain('Profile.displayName === undefined');
      expect(out).toContain('Profile.displayName = "Profile"');
    });

    it('handles components with block bodies', () => {
      const out = transform(`
        const Card = (props) => {
          const title = props.title;
          return <View><Text>{title}</Text></View>;
        };
      `);
      expect(out).toContain('Card.displayName = "Card"');
    });

    it('skips lowercase variable names (not React components)', () => {
      const out = transform(`
        const helper = () => <Text>hi</Text>;
      `);
      expect(out).not.toContain('helper.displayName');
    });

    it('skips functions with no JSX', () => {
      const out = transform(`
        const computeTotal = (a, b) => a + b;
      `);
      expect(out).not.toContain('computeTotal.displayName');
    });

    it('skips components marked @erne-monitor-ignore', () => {
      const out = transform(`
        // @erne-monitor-ignore
        const Hidden = () => <Text>hi</Text>;
      `);
      expect(out).not.toContain('Hidden.displayName');
    });

    it('is idempotent — second pass adds nothing new', () => {
      const code = `
        const Profile = ({ name }) => <Text>{name}</Text>;
      `;
      const first = transform(code);
      const second = transform(first);
      // Count displayName assignments — should be 1 in both.
      const count = (s: string) =>
        (s.match(/\.displayName = "Profile"/g) ?? []).length;
      expect(count(first)).toBe(1);
      expect(count(second)).toBe(1);
    });
  });

  describe('touch boundary injection', () => {
    it('adds onMonitorTouch to Pressable', () => {
      const out = transform(`
        const Btn = () => <Pressable onPress={() => {}}><Text>Tap</Text></Pressable>;
      `);
      expect(out).toContain('onMonitorTouch');
      expect(out).toContain('componentName: "Pressable"');
      expect(out).toContain('globalThis.__ERNE_MONITOR__');
      expect(out).toContain('touchBoundary');
    });

    it('adds onMonitorTouch to TouchableOpacity', () => {
      const out = transform(`
        const Btn = () => <TouchableOpacity onPress={() => {}}><Text>Tap</Text></TouchableOpacity>;
      `);
      expect(out).toContain('onMonitorTouch');
      expect(out).toContain('TouchableOpacity');
    });

    it('does not touch non-pressable components', () => {
      const out = transform(`
        const X = () => <View><Text>Hi</Text></View>;
      `);
      expect(out).not.toContain('onMonitorTouch');
    });

    it('does not duplicate onMonitorTouch if already present', () => {
      const out = transform(`
        const Btn = () => <Pressable onMonitorTouch={myHandler}><Text>Tap</Text></Pressable>;
      `);
      const count = (out.match(/onMonitorTouch/g) ?? []).length;
      expect(count).toBe(1);
    });

    it('can be disabled via options', () => {
      const out = transform(
        `const Btn = () => <Pressable><Text>Tap</Text></Pressable>;`,
        { enableTouchBoundary: false },
      );
      expect(out).not.toContain('onMonitorTouch');
    });
  });

  describe('Suspense marker', () => {
    it('adds a data-erne-suspense-id attribute', () => {
      const out = transform(`
        const App = () => (
          <Suspense fallback={<Text>loading</Text>}>
            <Content />
          </Suspense>
        );
      `);
      expect(out).toContain('data-erne-suspense-id');
    });

    it('does not re-annotate on a second pass', () => {
      const code = `
        const App = () => (
          <Suspense fallback={<Text>loading</Text>}>
            <Content />
          </Suspense>
        );
      `;
      const first = transform(code);
      const second = transform(first);
      const count = (s: string) =>
        (s.match(/data-erne-suspense-id/g) ?? []).length;
      expect(count(first)).toBe(1);
      expect(count(second)).toBe(1);
    });

    it('can be disabled via options', () => {
      const out = transform(
        `
        const App = () => (
          <Suspense fallback={<Text>loading</Text>}>
            <Content />
          </Suspense>
        );
      `,
        { enableSuspenseWrap: false },
      );
      expect(out).not.toContain('data-erne-suspense-id');
    });
  });

  describe('file filtering', () => {
    it('skips node_modules files by default', () => {
      const out = transform(
        `const Btn = () => <Pressable><Text>x</Text></Pressable>;`,
        {},
        '/app/node_modules/lib/Btn.tsx',
      );
      expect(out).not.toContain('onMonitorTouch');
    });
  });
});
