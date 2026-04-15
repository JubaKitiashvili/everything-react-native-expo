import { anonymize, anonymizeBatch, type RawPatternData } from './anonymizer';
import {
  aggregatePatterns,
  CrossProjectLearning,
  type CrossProjectSuggestion,
  type CrossProjectStore,
} from './crossProject';
import type { AnonymizedPatternData } from './anonymizer';

// ────────────────────────────────────────────────────────────
// Anonymizer tests
// ────────────────────────────────────────────────────────────

describe('anonymizer', () => {
  test('strips appId and appName', () => {
    const raw: RawPatternData = {
      appId: 'app_secret',
      appName: 'MySecretApp',
      patternType: 'crash',
      patternData: { appId: 'should-be-removed', metric: 42 },
      confidence: 0.8,
      sampleCount: 10,
    };

    const result = anonymize(raw);
    expect(result.patternType).toBe('crash');
    expect(result.confidence).toBe(0.8);
    expect(result.sampleCount).toBe(10);
    expect(result.patternData).not.toHaveProperty('appId');
    expect(result.patternData).toHaveProperty('metric', 42);
  });

  test('strips sensitive keys', () => {
    const raw: RawPatternData = {
      appId: 'x',
      patternType: 'crash',
      patternData: {
        userId: '123',
        email: 'test@test.com',
        token: 'abc',
        message: 'null pointer',
      },
      confidence: 0.5,
      sampleCount: 1,
    };

    const result = anonymize(raw);
    expect(result.patternData).not.toHaveProperty('userId');
    expect(result.patternData).not.toHaveProperty('email');
    expect(result.patternData).not.toHaveProperty('token');
    expect(result.patternData).toHaveProperty('message', 'null pointer');
  });

  test('redacts file paths', () => {
    const raw: RawPatternData = {
      appId: 'x',
      patternType: 'crash',
      patternData: {
        stack: 'Error at /Users/john/project/src/App.tsx:42',
      },
      confidence: 0.5,
      sampleCount: 1,
    };

    const result = anonymize(raw);
    const stack = result.patternData['stack'] as string;
    expect(stack).not.toContain('/Users/john');
    expect(stack).toContain('<redacted-path>');
  });

  test('redacts bundle identifiers', () => {
    const raw: RawPatternData = {
      appId: 'x',
      patternType: 'crash',
      patternData: {
        source: 'com.mycompany.myapp crashed',
      },
      confidence: 0.5,
      sampleCount: 1,
    };

    const result = anonymize(raw);
    const source = result.patternData['source'] as string;
    expect(source).toContain('<redacted-bundle>');
  });

  test('handles nested objects', () => {
    const raw: RawPatternData = {
      appId: 'x',
      patternType: 'perf',
      patternData: {
        nested: { userId: 'secret', value: 42 },
      },
      confidence: 0.5,
      sampleCount: 1,
    };

    const result = anonymize(raw);
    const nested = result.patternData['nested'] as Record<string, unknown>;
    expect(nested).not.toHaveProperty('userId');
    expect(nested).toHaveProperty('value', 42);
  });

  test('handles arrays', () => {
    const raw: RawPatternData = {
      appId: 'x',
      patternType: 'perf',
      patternData: {
        tags: ['safe', '/Users/secret/path'],
      },
      confidence: 0.5,
      sampleCount: 1,
    };

    const result = anonymize(raw);
    const tags = result.patternData['tags'] as string[];
    expect(tags[0]).toBe('safe');
    expect(tags[1]).toContain('<redacted-path>');
  });

  test('anonymizeBatch processes multiple patterns', () => {
    const raws: RawPatternData[] = [
      { appId: 'a', patternType: 'crash', patternData: {}, confidence: 0.5, sampleCount: 1 },
      { appId: 'b', patternType: 'perf', patternData: {}, confidence: 0.7, sampleCount: 2 },
    ];

    const result = anonymizeBatch(raws);
    expect(result).toHaveLength(2);
    expect(result[0]!.patternType).toBe('crash');
    expect(result[1]!.patternType).toBe('perf');
  });
});

// ────────────────────────────────────────────────────────────
// Cross-project aggregation tests
// ────────────────────────────────────────────────────────────

describe('aggregatePatterns', () => {
  test('groups by patternType and computes averages', () => {
    const patterns: AnonymizedPatternData[] = [
      { patternType: 'crash', patternData: { a: 1 }, confidence: 0.8, sampleCount: 10 },
      { patternType: 'crash', patternData: { a: 2 }, confidence: 0.6, sampleCount: 5 },
      { patternType: 'perf', patternData: { b: 1 }, confidence: 0.9, sampleCount: 20 },
    ];

    const result = aggregatePatterns(patterns);
    expect(result).toHaveLength(2);

    const perf = result.find((s) => s.patternType === 'perf');
    expect(perf).toBeDefined();
    expect(perf!.aggregateConfidence).toBe(0.9);
    expect(perf!.totalSamples).toBe(20);
    expect(perf!.projectCount).toBe(1);

    const crash = result.find((s) => s.patternType === 'crash');
    expect(crash).toBeDefined();
    expect(crash!.aggregateConfidence).toBe(0.7);
    expect(crash!.totalSamples).toBe(15);
    expect(crash!.projectCount).toBe(2);
  });

  test('uses highest-confidence pattern data', () => {
    const patterns: AnonymizedPatternData[] = [
      { patternType: 'crash', patternData: { winner: false }, confidence: 0.5, sampleCount: 5 },
      { patternType: 'crash', patternData: { winner: true }, confidence: 0.9, sampleCount: 20 },
    ];

    const result = aggregatePatterns(patterns);
    expect(result[0]!.patternData).toEqual({ winner: true });
  });

  test('sorts by aggregate confidence descending', () => {
    const patterns: AnonymizedPatternData[] = [
      { patternType: 'low', patternData: {}, confidence: 0.2, sampleCount: 1 },
      { patternType: 'high', patternData: {}, confidence: 0.95, sampleCount: 100 },
      { patternType: 'mid', patternData: {}, confidence: 0.5, sampleCount: 10 },
    ];

    const result = aggregatePatterns(patterns);
    expect(result[0]!.patternType).toBe('high');
    expect(result[1]!.patternType).toBe('mid');
    expect(result[2]!.patternType).toBe('low');
  });

  test('returns empty for empty input', () => {
    const result = aggregatePatterns([]);
    expect(result).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────
// CrossProjectLearning service tests
// ────────────────────────────────────────────────────────────

describe('CrossProjectLearning', () => {
  function createFakeStore(): CrossProjectStore & {
    allPatterns: AnonymizedPatternData[];
    storedSuggestions: CrossProjectSuggestion[];
  } {
    const store = {
      allPatterns: [] as AnonymizedPatternData[],
      storedSuggestions: [] as CrossProjectSuggestion[],
      async fetchAllPatterns(): Promise<readonly AnonymizedPatternData[]> {
        return store.allPatterns;
      },
      async storeSuggestions(suggestions: readonly CrossProjectSuggestion[]): Promise<void> {
        store.storedSuggestions = [...suggestions];
      },
      async getSuggestions(patternType?: string): Promise<readonly CrossProjectSuggestion[]> {
        if (patternType) {
          return store.storedSuggestions.filter((s) => s.patternType === patternType);
        }
        return store.storedSuggestions;
      },
    };
    return store;
  }

  test('aggregate fetches, processes, and stores suggestions', async () => {
    const store = createFakeStore();
    store.allPatterns = [
      { patternType: 'crash', patternData: {}, confidence: 0.8, sampleCount: 10 },
      { patternType: 'crash', patternData: {}, confidence: 0.7, sampleCount: 5 },
    ];

    const service = new CrossProjectLearning(store);
    const suggestions = await service.aggregate();

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.patternType).toBe('crash');
    expect(suggestions[0]!.projectCount).toBe(2);
    expect(store.storedSuggestions).toHaveLength(1);
  });

  test('getSuggestions filters by pattern type', async () => {
    const store = createFakeStore();
    store.storedSuggestions = [
      { patternType: 'crash', patternData: {}, aggregateConfidence: 0.8, totalSamples: 10, projectCount: 2 },
      { patternType: 'perf', patternData: {}, aggregateConfidence: 0.9, totalSamples: 20, projectCount: 3 },
    ];

    const service = new CrossProjectLearning(store);
    const result = await service.getSuggestions('crash');
    expect(result).toHaveLength(1);
    expect(result[0]!.patternType).toBe('crash');
  });

  test('getSuggestions returns all when no filter', async () => {
    const store = createFakeStore();
    store.storedSuggestions = [
      { patternType: 'crash', patternData: {}, aggregateConfidence: 0.8, totalSamples: 10, projectCount: 2 },
      { patternType: 'perf', patternData: {}, aggregateConfidence: 0.9, totalSamples: 20, projectCount: 3 },
    ];

    const service = new CrossProjectLearning(store);
    const result = await service.getSuggestions();
    expect(result).toHaveLength(2);
  });
});
