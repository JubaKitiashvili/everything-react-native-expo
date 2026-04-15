import {
  withMetroInstrumentation,
  shouldInstrument,
  buildTransformSpec,
  type MetroConfig,
  type MetroInstrumentationConfig,
} from './withMetroInstrumentation';

// ────────────────────────────────────────────────────────────
// withMetroInstrumentation tests
// ────────────────────────────────────────────────────────────

describe('withMetroInstrumentation', () => {
  const baseMetroConfig: MetroConfig = {
    resolver: {
      sourceExts: ['ts', 'tsx', 'js', 'jsx'],
    },
  };

  test('adds transformer path when enabled', () => {
    const result = withMetroInstrumentation(baseMetroConfig);
    expect(result.transformer?.babelTransformerPath).toBe('@erne/monitor/babel-transform');
  });

  test('preserves existing metro config', () => {
    const result = withMetroInstrumentation(baseMetroConfig);
    expect(result.resolver?.sourceExts).toEqual(['ts', 'tsx', 'js', 'jsx']);
  });

  test('adds erne.monitor config', () => {
    const result = withMetroInstrumentation(baseMetroConfig) as Record<string, unknown>;
    const erne = result['erne'] as Record<string, unknown>;
    expect(erne).toBeDefined();
    const monitor = erne['monitor'] as Record<string, unknown>;
    expect(monitor['wrapEntry']).toBe(true);
    expect(monitor['trackRenders']).toBe(true);
    expect(monitor['trackPresses']).toBe(true);
  });

  test('returns unmodified config when disabled', () => {
    const result = withMetroInstrumentation(baseMetroConfig, { enabled: false });
    expect(result).toEqual(baseMetroConfig);
  });

  test('preserves existing transformer path', () => {
    const config: MetroConfig = {
      transformer: {
        babelTransformerPath: 'custom-transformer',
      },
    };
    const result = withMetroInstrumentation(config);
    expect(result.transformer?.babelTransformerPath).toBe('custom-transformer');
  });

  test('respects custom instrumentation config', () => {
    const config: MetroInstrumentationConfig = {
      wrapEntry: false,
      trackRenders: true,
      trackPresses: false,
      exclude: ['custom-exclude'],
    };

    const result = withMetroInstrumentation(baseMetroConfig, config) as Record<string, unknown>;
    const erne = result['erne'] as Record<string, unknown>;
    const monitor = erne['monitor'] as Record<string, unknown>;
    expect(monitor['wrapEntry']).toBe(false);
    expect(monitor['trackPresses']).toBe(false);
    expect(monitor['exclude']).toEqual(['custom-exclude']);
  });

  test('preserves existing erne config', () => {
    const config: MetroConfig = {
      erne: { otherConfig: true },
    } as unknown as MetroConfig;

    const result = withMetroInstrumentation(config) as Record<string, unknown>;
    const erne = result['erne'] as Record<string, unknown>;
    expect(erne['otherConfig']).toBe(true);
    expect(erne['monitor']).toBeDefined();
  });
});

// ────────────────────────────────────────────────────────────
// shouldInstrument tests
// ────────────────────────────────────────────────────────────

describe('shouldInstrument', () => {
  const defaultExclude = ['node_modules', '__tests__', '.test.', '.spec.'];

  test('includes .tsx files', () => {
    expect(shouldInstrument('src/components/App.tsx', defaultExclude)).toBe(true);
  });

  test('includes .ts files', () => {
    expect(shouldInstrument('src/utils/format.ts', defaultExclude)).toBe(true);
  });

  test('includes .jsx files', () => {
    expect(shouldInstrument('src/App.jsx', defaultExclude)).toBe(true);
  });

  test('includes .js files', () => {
    expect(shouldInstrument('src/index.js', defaultExclude)).toBe(true);
  });

  test('excludes node_modules', () => {
    expect(shouldInstrument('node_modules/react/index.js', defaultExclude)).toBe(false);
  });

  test('excludes __tests__', () => {
    expect(shouldInstrument('src/__tests__/App.test.tsx', defaultExclude)).toBe(false);
  });

  test('excludes .test. files', () => {
    expect(shouldInstrument('src/App.test.tsx', defaultExclude)).toBe(false);
  });

  test('excludes .spec. files', () => {
    expect(shouldInstrument('src/App.spec.ts', defaultExclude)).toBe(false);
  });

  test('excludes non-JS files', () => {
    expect(shouldInstrument('src/styles.css', defaultExclude)).toBe(false);
    expect(shouldInstrument('assets/logo.png', defaultExclude)).toBe(false);
  });

  test('handles backslash paths (Windows)', () => {
    expect(shouldInstrument('src\\components\\App.tsx', defaultExclude)).toBe(true);
    expect(shouldInstrument('node_modules\\react\\index.js', defaultExclude)).toBe(false);
  });

  test('works with custom exclude patterns', () => {
    expect(shouldInstrument('src/generated/types.ts', ['generated'])).toBe(false);
    expect(shouldInstrument('src/App.tsx', ['generated'])).toBe(true);
  });

  test('works with empty exclude list', () => {
    expect(shouldInstrument('node_modules/react/index.js', [])).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// buildTransformSpec tests
// ────────────────────────────────────────────────────────────

describe('buildTransformSpec', () => {
  test('returns defaults when no config provided', () => {
    const spec = buildTransformSpec({});
    expect(spec.wrapEntry).toBe(true);
    expect(spec.trackRenders).toBe(true);
    expect(spec.trackPresses).toBe(true);
    expect(spec.exclude).toContain('node_modules');
  });

  test('overrides specific fields', () => {
    const spec = buildTransformSpec({ wrapEntry: false, trackPresses: false });
    expect(spec.wrapEntry).toBe(false);
    expect(spec.trackPresses).toBe(false);
    expect(spec.trackRenders).toBe(true);
  });

  test('uses custom exclude list', () => {
    const spec = buildTransformSpec({ exclude: ['custom'] });
    expect(spec.exclude).toEqual(['custom']);
  });
});
