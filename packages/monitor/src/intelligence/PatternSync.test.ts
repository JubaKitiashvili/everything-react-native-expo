import { PatternSync, type CachedPattern, type PatternSyncTransport } from './PatternSync';

function createFakeTransport(): PatternSyncTransport & {
  uploaded: { appId: string; patterns: readonly CachedPattern[] }[];
  serverPatterns: CachedPattern[];
} {
  const transport = {
    uploaded: [] as { appId: string; patterns: readonly CachedPattern[] }[],
    serverPatterns: [] as CachedPattern[],
    async uploadPatterns(appId: string, patterns: readonly CachedPattern[]): Promise<void> {
      transport.uploaded.push({ appId, patterns });
    },
    async downloadPatterns(_appId: string): Promise<readonly CachedPattern[]> {
      return transport.serverPatterns;
    },
  };
  return transport;
}

function makePattern(overrides?: Partial<CachedPattern>): CachedPattern {
  return {
    patternType: 'crash',
    patternData: { message: 'test' },
    confidence: 0.8,
    sampleCount: 10,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('PatternSync', () => {
  test('addPattern stores pattern in cache', () => {
    const transport = createFakeTransport();
    const sync = new PatternSync({ appId: 'app_1', transport });

    sync.addPattern(makePattern({ patternType: 'crash' }));
    expect(sync.getPatterns()).toHaveLength(1);
    expect(sync.getPattern('crash')).not.toBeNull();
  });

  test('addPattern replaces when higher confidence', () => {
    const transport = createFakeTransport();
    const sync = new PatternSync({ appId: 'app_1', transport });

    sync.addPattern(makePattern({ confidence: 0.5 }));
    sync.addPattern(makePattern({ confidence: 0.9 }));

    expect(sync.getPatterns()).toHaveLength(1);
    expect(sync.getPattern('crash')!.confidence).toBe(0.9);
  });

  test('addPattern does not replace when lower confidence', () => {
    const transport = createFakeTransport();
    const sync = new PatternSync({ appId: 'app_1', transport });

    sync.addPattern(makePattern({ confidence: 0.9 }));
    sync.addPattern(makePattern({ confidence: 0.5, updatedAt: 500 }));

    expect(sync.getPattern('crash')!.confidence).toBe(0.9);
  });

  test('fetchAndMerge downloads and merges server patterns', async () => {
    const transport = createFakeTransport();
    transport.serverPatterns = [
      makePattern({ patternType: 'network', confidence: 0.7 }),
      makePattern({ patternType: 'memory', confidence: 0.6 }),
    ];

    const sync = new PatternSync({ appId: 'app_1', transport });
    const merged = await sync.fetchAndMerge();

    expect(merged).toBe(2);
    expect(sync.getPatterns()).toHaveLength(2);
  });

  test('fetchAndMerge does not overwrite higher-confidence local patterns', async () => {
    const transport = createFakeTransport();
    transport.serverPatterns = [
      makePattern({ patternType: 'crash', confidence: 0.5 }),
    ];

    const sync = new PatternSync({ appId: 'app_1', transport });
    sync.addPattern(makePattern({ patternType: 'crash', confidence: 0.9 }));

    const merged = await sync.fetchAndMerge();
    expect(merged).toBe(0);
    expect(sync.getPattern('crash')!.confidence).toBe(0.9);
  });

  test('syncOnSessionEnd uploads patterns', async () => {
    const transport = createFakeTransport();
    let clock = 0;
    const sync = new PatternSync({
      appId: 'app_1',
      transport,
      now: () => clock,
      minSyncIntervalMs: 1000,
    });

    sync.addPattern(makePattern());
    clock = 2000;
    const result = await sync.syncOnSessionEnd();

    expect(result).toBe(true);
    expect(transport.uploaded).toHaveLength(1);
    expect(transport.uploaded[0]!.appId).toBe('app_1');
  });

  test('syncOnSessionEnd throttles within min interval', async () => {
    const transport = createFakeTransport();
    let clock = 0;
    const sync = new PatternSync({
      appId: 'app_1',
      transport,
      now: () => clock,
      minSyncIntervalMs: 5000,
    });

    sync.addPattern(makePattern());

    // First sync
    clock = 6000;
    await sync.syncOnSessionEnd();

    // Second sync too soon
    clock = 7000;
    const result = await sync.syncOnSessionEnd();
    expect(result).toBe(false);
    expect(transport.uploaded).toHaveLength(1);
  });

  test('syncOnSessionEnd skips when cache is empty', async () => {
    const transport = createFakeTransport();
    const sync = new PatternSync({
      appId: 'app_1',
      transport,
      now: () => 999999,
      minSyncIntervalMs: 0,
    });

    const result = await sync.syncOnSessionEnd();
    expect(result).toBe(false);
  });

  test('timeSinceLastSync returns -1 when never synced', () => {
    const transport = createFakeTransport();
    const sync = new PatternSync({ appId: 'app_1', transport, now: () => 5000 });
    expect(sync.timeSinceLastSync()).toBe(-1);
  });

  test('timeSinceLastSync returns elapsed time', async () => {
    const transport = createFakeTransport();
    let clock = 1000;
    const sync = new PatternSync({
      appId: 'app_1',
      transport,
      now: () => clock,
      minSyncIntervalMs: 0,
    });

    sync.addPattern(makePattern());
    await sync.syncOnSessionEnd();

    clock = 5000;
    expect(sync.timeSinceLastSync()).toBe(4000);
  });

  test('clear removes all cached patterns', () => {
    const transport = createFakeTransport();
    const sync = new PatternSync({ appId: 'app_1', transport });

    sync.addPattern(makePattern({ patternType: 'a' }));
    sync.addPattern(makePattern({ patternType: 'b' }));
    expect(sync.getPatterns()).toHaveLength(2);

    sync.clear();
    expect(sync.getPatterns()).toHaveLength(0);
  });
});
