import {
  DEFAULT_MONITOR_CONFIG,
  DEFAULT_SAMPLING_BY_TYPE,
  defineMonitorConfig,
  resolveCollectorMode,
} from './Config';

describe('defineMonitorConfig', () => {
  it('returns defaults when called with no overrides', () => {
    const config = defineMonitorConfig();
    expect(config.sampling.dev).toBe(1.0);
    expect(config.sampling.prod).toBe(0.1);
    expect(config.sampling.byType).toEqual(DEFAULT_SAMPLING_BY_TYPE);
    expect(config.consent).toEqual({
      crashes: true,
      analytics: false,
      replay: false,
    });
    expect(config.ai.autoFix).toBe('suggest');
    expect(config.ai.maxFilesPerFix).toBe(5);
    expect(config.transport.endpoint).toBeNull();
    expect(config.transport.batchInterval).toBe(60_000);
    expect(config.transport.maxBatchSize).toBe(100);
    expect(config.collectors.crash).toBe(true);
    expect(config.collectors.render).toBe('dev');
  });

  it('shallow-merges partial overrides per section', () => {
    const config = defineMonitorConfig({
      sampling: { prod: 0.5 },
      ai: { autoFix: 'apply' },
      collectors: { crash: false, newCollector: 'prod' },
    });
    expect(config.sampling.dev).toBe(1.0);
    expect(config.sampling.prod).toBe(0.5);
    expect(config.sampling.byType).toEqual(DEFAULT_SAMPLING_BY_TYPE);
    expect(config.ai.autoFix).toBe('apply');
    expect(config.ai.crashExplainer).toBe(true); // unchanged
    expect(config.collectors.crash).toBe(false);
    expect(config.collectors.newCollector).toBe('prod');
    expect(config.collectors.network).toBe(true); // default preserved
  });

  describe('sampling.byType', () => {
    it('merges byType overrides with defaults', () => {
      const config = defineMonitorConfig({
        sampling: {
          byType: {
            render: { dev: 0.5 }, // override dev only, keep default prod
            myCustomType: { dev: 0.3, prod: 0.1 },
          },
        },
      });
      expect(config.sampling.byType['render']?.dev).toBe(0.5);
      expect(config.sampling.byType['render']?.prod).toBe(0.01); // default preserved
      expect(config.sampling.byType['myCustomType']).toEqual({
        dev: 0.3,
        prod: 0.1,
      });
      // defaults for other types stay intact
      expect(config.sampling.byType['navigation']?.dev).toBe(1.0);
    });

    it('throws on byType rate out of range', () => {
      expect(() =>
        defineMonitorConfig({
          sampling: { byType: { render: { prod: 1.5 } } },
        }),
      ).toThrow(/byType\.render\.prod/);
      expect(() =>
        defineMonitorConfig({
          sampling: { byType: { render: { dev: -0.01 } } },
        }),
      ).toThrow(/byType\.render\.dev/);
    });

    it('does not mutate DEFAULT_SAMPLING_BY_TYPE when overriding', () => {
      const beforeRender = DEFAULT_SAMPLING_BY_TYPE['render']?.dev;
      defineMonitorConfig({
        sampling: { byType: { render: { dev: 0.9 } } },
      });
      expect(DEFAULT_SAMPLING_BY_TYPE['render']?.dev).toBe(beforeRender);
    });
  });

  it('returns a deeply frozen config', () => {
    const config = defineMonitorConfig();
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.sampling)).toBe(true);
    expect(Object.isFrozen(config.ai)).toBe(true);
    expect(Object.isFrozen(config.transport)).toBe(true);
    expect(Object.isFrozen(config.collectors)).toBe(true);
    expect(() => {
      (config.sampling as { dev: number }).dev = 0.5;
    }).toThrow();
  });

  it('does not mutate DEFAULT_MONITOR_CONFIG', () => {
    const before = DEFAULT_MONITOR_CONFIG.sampling.prod;
    defineMonitorConfig({ sampling: { prod: 0.9 } });
    expect(DEFAULT_MONITOR_CONFIG.sampling.prod).toBe(before);
  });

  describe('validation', () => {
    it('throws on sampling out of range', () => {
      expect(() => defineMonitorConfig({ sampling: { dev: 1.5 } })).toThrow(
        /sampling\.dev/,
      );
      expect(() => defineMonitorConfig({ sampling: { prod: -0.1 } })).toThrow(
        /sampling\.prod/,
      );
    });

    it('throws on invalid autoFix mode', () => {
      expect(() =>
        defineMonitorConfig({ ai: { autoFix: 'yolo' as 'suggest' } }),
      ).toThrow(/autoFix/);
    });

    it('throws on negative maxFilesPerFix', () => {
      expect(() => defineMonitorConfig({ ai: { maxFilesPerFix: -1 } })).toThrow(
        /maxFilesPerFix/,
      );
    });

    it('throws on non-integer maxFilesPerFix', () => {
      expect(() => defineMonitorConfig({ ai: { maxFilesPerFix: 2.5 } })).toThrow(
        /maxFilesPerFix/,
      );
    });

    it('throws on invalid collector mode', () => {
      expect(() =>
        defineMonitorConfig({
          collectors: { bogus: 'always' as 'dev' },
        }),
      ).toThrow(/collectors\.bogus/);
    });

    it('throws on empty transport endpoint', () => {
      expect(() =>
        defineMonitorConfig({ transport: { endpoint: '' } }),
      ).toThrow(/transport\.endpoint/);
    });

    it('accepts null transport endpoint', () => {
      expect(() =>
        defineMonitorConfig({ transport: { endpoint: null } }),
      ).not.toThrow();
    });

    it('throws on zero batchInterval', () => {
      expect(() =>
        defineMonitorConfig({ transport: { batchInterval: 0 } }),
      ).toThrow(/batchInterval/);
    });

    it('throws on zero maxBatchSize', () => {
      expect(() =>
        defineMonitorConfig({ transport: { maxBatchSize: 0 } }),
      ).toThrow(/maxBatchSize/);
    });

    it('throws on non-boolean consent', () => {
      expect(() =>
        defineMonitorConfig({
          consent: { crashes: 'yes' as unknown as boolean },
        }),
      ).toThrow(/consent\.crashes/);
    });
  });
});

describe('resolveCollectorMode', () => {
  const config = defineMonitorConfig({
    collectors: {
      always: true,
      never: false,
      devOnly: 'dev',
      prodOnly: 'prod',
    },
  });

  it('returns true for boolean true regardless of mode', () => {
    expect(resolveCollectorMode(config, 'always', true)).toBe(true);
    expect(resolveCollectorMode(config, 'always', false)).toBe(true);
  });

  it('returns false for boolean false regardless of mode', () => {
    expect(resolveCollectorMode(config, 'never', true)).toBe(false);
    expect(resolveCollectorMode(config, 'never', false)).toBe(false);
  });

  it("enables 'dev' collectors only in dev", () => {
    expect(resolveCollectorMode(config, 'devOnly', true)).toBe(true);
    expect(resolveCollectorMode(config, 'devOnly', false)).toBe(false);
  });

  it("enables 'prod' collectors only in prod", () => {
    expect(resolveCollectorMode(config, 'prodOnly', true)).toBe(false);
    expect(resolveCollectorMode(config, 'prodOnly', false)).toBe(true);
  });

  it('returns false for unknown collector names', () => {
    expect(resolveCollectorMode(config, 'missing', true)).toBe(false);
  });

  it('auto-detects dev mode via globalThis.__DEV__ when not passed', () => {
    const g = globalThis as { __DEV__?: boolean };
    const prev = g.__DEV__;
    g.__DEV__ = true;
    try {
      expect(resolveCollectorMode(config, 'devOnly')).toBe(true);
      expect(resolveCollectorMode(config, 'prodOnly')).toBe(false);
    } finally {
      if (prev === undefined) delete g.__DEV__;
      else g.__DEV__ = prev;
    }
  });
});
