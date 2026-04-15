import { OTAManifestService, type OTAManifestData, type OTAManifestStore } from './manifest';

function createFakeStore(): OTAManifestStore & { data: OTAManifestData | null } {
  const store = {
    data: null as OTAManifestData | null,
    async getManifest(): Promise<OTAManifestData | null> {
      return store.data;
    },
    async setManifest(manifest: OTAManifestData): Promise<void> {
      store.data = manifest;
    },
  };
  return store;
}

describe('OTAManifestService', () => {
  test('getManifest returns null when not configured', async () => {
    const store = createFakeStore();
    const service = new OTAManifestService(store);
    const result = await service.getManifest();
    expect(result).toBeNull();
  });

  test('updatePatterns creates manifest when none exists', async () => {
    const store = createFakeStore();
    const service = new OTAManifestService(store);

    const result = await service.updatePatterns({
      version: '2.0',
      url: 'https://cdn.example.com/patterns.json',
      checksum: 'abc123',
    });

    expect(result.patternVersion).toBe('2.0');
    expect(result.patternUrl).toBe('https://cdn.example.com/patterns.json');
    expect(result.patternChecksum).toBe('abc123');
    expect(result.modelVersion).toBe('0.0.0');
  });

  test('updatePatterns preserves model fields', async () => {
    const store = createFakeStore();
    store.data = {
      patternVersion: '1.0',
      modelVersion: '1.5',
      patternUrl: 'old-url',
      modelUrl: 'model-url',
      patternChecksum: 'old',
      modelChecksum: 'model-check',
    };

    const service = new OTAManifestService(store);
    const result = await service.updatePatterns({
      version: '2.0',
      url: 'new-url',
      checksum: 'new-check',
    });

    expect(result.patternVersion).toBe('2.0');
    expect(result.modelVersion).toBe('1.5');
    expect(result.modelUrl).toBe('model-url');
  });

  test('updateModel creates manifest when none exists', async () => {
    const store = createFakeStore();
    const service = new OTAManifestService(store);

    const result = await service.updateModel({
      version: '3.0',
      url: 'https://cdn.example.com/model.pte',
      checksum: 'def456',
    });

    expect(result.modelVersion).toBe('3.0');
    expect(result.modelUrl).toBe('https://cdn.example.com/model.pte');
    expect(result.patternVersion).toBe('0.0.0');
  });

  test('updateModel preserves pattern fields', async () => {
    const store = createFakeStore();
    store.data = {
      patternVersion: '2.0',
      modelVersion: '1.0',
      patternUrl: 'pat-url',
      modelUrl: 'old-model',
      patternChecksum: 'pat-check',
      modelChecksum: 'old-model-check',
    };

    const service = new OTAManifestService(store);
    const result = await service.updateModel({
      version: '2.0',
      url: 'new-model-url',
      checksum: 'new-model-check',
    });

    expect(result.modelVersion).toBe('2.0');
    expect(result.patternVersion).toBe('2.0');
    expect(result.patternUrl).toBe('pat-url');
  });

  test('isComplete returns true when all fields populated', () => {
    const manifest: OTAManifestData = {
      patternVersion: '1.0',
      modelVersion: '1.0',
      patternUrl: 'x',
      modelUrl: 'y',
      patternChecksum: 'a',
      modelChecksum: 'b',
    };
    expect(OTAManifestService.isComplete(manifest)).toBe(true);
  });

  test('isComplete returns false when fields missing', () => {
    const manifest: OTAManifestData = {
      patternVersion: '1.0',
      modelVersion: '',
      patternUrl: 'x',
      modelUrl: 'y',
      patternChecksum: 'a',
      modelChecksum: 'b',
    };
    expect(OTAManifestService.isComplete(manifest)).toBe(false);
  });

  test('isComplete returns false when URLs empty', () => {
    const manifest: OTAManifestData = {
      patternVersion: '1.0',
      modelVersion: '1.0',
      patternUrl: '',
      modelUrl: '',
      patternChecksum: 'a',
      modelChecksum: 'b',
    };
    expect(OTAManifestService.isComplete(manifest)).toBe(false);
  });
});
