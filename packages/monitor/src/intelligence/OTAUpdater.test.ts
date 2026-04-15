import {
  OTAUpdater,
  type OTAManifest,
  type OTAStorage,
  type OTAVersionInfo,
} from './OTAUpdater';
import type { ConnectionType } from '../types';

// ────────────────────────────────────────────────────────────
// Fakes
// ────────────────────────────────────────────────────────────

function createFakeStorage(): OTAStorage & { files: Map<string, ArrayBuffer>; versionInfo: OTAVersionInfo } {
  const store = {
    files: new Map<string, ArrayBuffer>(),
    versionInfo: {
      patternVersion: null,
      modelVersion: null,
      patternEtag: null,
      modelEtag: null,
    } as OTAVersionInfo,
    async getVersionInfo(): Promise<OTAVersionInfo> {
      return store.versionInfo;
    },
    async setVersionInfo(info: OTAVersionInfo): Promise<void> {
      store.versionInfo = info;
    },
    async writeFile(name: string, data: ArrayBuffer): Promise<void> {
      store.files.set(name, data);
    },
    async readFile(name: string): Promise<ArrayBuffer | null> {
      return store.files.get(name) ?? null;
    },
    async deleteFile(name: string): Promise<void> {
      store.files.delete(name);
    },
  };
  return store;
}

const MANIFEST: OTAManifest = {
  patternVersion: '2.0',
  modelVersion: '1.5',
  patternUrl: 'https://cdn.example.com/patterns.json',
  modelUrl: 'https://cdn.example.com/model.pte',
  patternChecksum: 'abc123',
  modelChecksum: 'def456',
};

function createFakeFetch(
  responses: Record<string, { ok: boolean; status: number; body: unknown }>,
): typeof fetch {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const resp = responses[url];
    if (!resp) {
      return { ok: false, status: 404 } as Response;
    }
    return {
      ok: resp.ok,
      status: resp.status,
      json: async () => resp.body,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as unknown as Response;
  };
}

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

describe('OTAUpdater', () => {
  test('downloads new patterns and models when versions differ', async () => {
    const storage = createFakeStorage();
    const fetchImpl = createFakeFetch({
      'https://cdn.example.com/manifest.json': { ok: true, status: 200, body: MANIFEST },
      'https://cdn.example.com/patterns.json': { ok: true, status: 200, body: null },
      'https://cdn.example.com/model.pte': { ok: true, status: 200, body: null },
    });

    const updater = new OTAUpdater({
      manifestUrl: 'https://cdn.example.com/manifest.json',
      storage,
      fetchImpl,
      sha256: async () => 'abc123', // Match pattern checksum
      getConnectionType: () => 'wifi',
    });

    // First call — sha256 returns pattern checksum; model will fail checksum
    const result = await updater.checkForUpdates();
    expect(result.patternUpdated).toBe(true);
    // Model checksum doesn't match abc123 for model
    expect(result.status).toBe('updated');
  });

  test('reports up-to-date when versions match', async () => {
    const storage = createFakeStorage();
    storage.versionInfo = {
      patternVersion: '2.0',
      modelVersion: '1.5',
      patternEtag: '2.0',
      modelEtag: '1.5',
    };

    const fetchImpl = createFakeFetch({
      'https://cdn.example.com/manifest.json': { ok: true, status: 200, body: MANIFEST },
    });

    const updater = new OTAUpdater({
      manifestUrl: 'https://cdn.example.com/manifest.json',
      storage,
      fetchImpl,
      sha256: async () => 'x',
      getConnectionType: () => 'wifi',
    });

    const result = await updater.checkForUpdates();
    expect(result.status).toBe('up-to-date');
    expect(result.patternUpdated).toBe(false);
    expect(result.modelUpdated).toBe(false);
  });

  test('defers on cellular when allowCellular is false', async () => {
    const storage = createFakeStorage();
    const updater = new OTAUpdater({
      manifestUrl: 'https://cdn.example.com/manifest.json',
      storage,
      sha256: async () => 'x',
      getConnectionType: () => 'cellular',
      allowCellular: false,
    });

    const result = await updater.checkForUpdates();
    expect(result.status).toBe('deferred');
  });

  test('proceeds on cellular when allowCellular is true', async () => {
    const storage = createFakeStorage();
    storage.versionInfo = { patternVersion: '2.0', modelVersion: '1.5', patternEtag: null, modelEtag: null };

    const fetchImpl = createFakeFetch({
      'https://cdn.example.com/manifest.json': { ok: true, status: 200, body: MANIFEST },
    });

    const updater = new OTAUpdater({
      manifestUrl: 'https://cdn.example.com/manifest.json',
      storage,
      fetchImpl,
      sha256: async () => 'x',
      getConnectionType: () => 'cellular',
      allowCellular: true,
    });

    const result = await updater.checkForUpdates();
    expect(result.status).toBe('up-to-date');
  });

  test('defers when offline', async () => {
    const storage = createFakeStorage();
    const updater = new OTAUpdater({
      manifestUrl: 'https://cdn.example.com/manifest.json',
      storage,
      sha256: async () => 'x',
      getConnectionType: () => 'offline',
    });

    const result = await updater.checkForUpdates();
    expect(result.status).toBe('deferred');
  });

  test('rejects download when checksum does not match', async () => {
    const storage = createFakeStorage();
    const fetchImpl = createFakeFetch({
      'https://cdn.example.com/manifest.json': { ok: true, status: 200, body: MANIFEST },
      'https://cdn.example.com/patterns.json': { ok: true, status: 200, body: null },
      'https://cdn.example.com/model.pte': { ok: true, status: 200, body: null },
    });

    const updater = new OTAUpdater({
      manifestUrl: 'https://cdn.example.com/manifest.json',
      storage,
      fetchImpl,
      sha256: async () => 'wrong-checksum',
      getConnectionType: () => 'wifi',
    });

    const result = await updater.checkForUpdates();
    expect(result.patternUpdated).toBe(false);
    expect(result.modelUpdated).toBe(false);
  });

  test('handles manifest fetch error', async () => {
    const storage = createFakeStorage();
    const fetchImpl = createFakeFetch({
      'https://cdn.example.com/manifest.json': { ok: false, status: 500, body: null },
    });

    const updater = new OTAUpdater({
      manifestUrl: 'https://cdn.example.com/manifest.json',
      storage,
      fetchImpl,
      sha256: async () => 'x',
      getConnectionType: () => 'wifi',
    });

    const result = await updater.checkForUpdates();
    expect(result.status).toBe('error');
    expect(result.error).toContain('500');
  });

  test('handles network exception', async () => {
    const storage = createFakeStorage();
    const fetchImpl: typeof fetch = async () => {
      throw new Error('Network unavailable');
    };

    const updater = new OTAUpdater({
      manifestUrl: 'https://cdn.example.com/manifest.json',
      storage,
      fetchImpl,
      sha256: async () => 'x',
      getConnectionType: () => 'wifi',
    });

    const result = await updater.checkForUpdates();
    expect(result.status).toBe('error');
    expect(result.error).toBe('Network unavailable');
  });

  test('start triggers immediate check and sets timer', () => {
    const storage = createFakeStorage();
    let timerSet = false;
    const updater = new OTAUpdater({
      manifestUrl: 'https://cdn.example.com/manifest.json',
      storage,
      sha256: async () => 'x',
      getConnectionType: () => 'offline', // will defer
      scheduler: {
        set: () => {
          timerSet = true;
          return 1;
        },
        clear: () => {},
      },
    });

    updater.start();
    expect(timerSet).toBe(true);
  });

  test('stop clears timer', () => {
    const storage = createFakeStorage();
    let cleared = false;
    const updater = new OTAUpdater({
      manifestUrl: 'x',
      storage,
      sha256: async () => 'x',
      getConnectionType: () => 'offline',
      scheduler: {
        set: () => 1,
        clear: () => {
          cleared = true;
        },
      },
    });

    updater.start();
    updater.stop();
    expect(cleared).toBe(true);
  });

  test('getStatus reflects last operation', async () => {
    const storage = createFakeStorage();
    const updater = new OTAUpdater({
      manifestUrl: 'x',
      storage,
      sha256: async () => 'x',
      getConnectionType: () => 'offline',
    });

    expect(updater.getStatus()).toBe('idle');
    await updater.checkForUpdates();
    expect(updater.getStatus()).toBe('deferred');
  });
});
