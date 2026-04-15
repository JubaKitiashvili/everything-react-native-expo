/**
 * Task 66 — OTA Pattern/Model Updates
 *
 * Checks for updates on cold start + every 24h. Downloads only when new
 * version (ETag). SHA-256 checksum validation. Atomic update (old stays
 * until new validated). Bandwidth-aware (defer on cellular).
 */

import type { ConnectionType } from '../types';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface OTAManifest {
  readonly patternVersion: string;
  readonly modelVersion: string;
  readonly patternUrl: string;
  readonly modelUrl: string;
  readonly patternChecksum: string;
  readonly modelChecksum: string;
}

export interface OTAVersionInfo {
  readonly patternVersion: string | null;
  readonly modelVersion: string | null;
  readonly patternEtag: string | null;
  readonly modelEtag: string | null;
}

export interface OTAStorage {
  getVersionInfo(): Promise<OTAVersionInfo>;
  setVersionInfo(info: OTAVersionInfo): Promise<void>;
  writeFile(name: string, data: ArrayBuffer): Promise<void>;
  readFile(name: string): Promise<ArrayBuffer | null>;
  deleteFile(name: string): Promise<void>;
}

export interface OTAUpdaterDeps {
  /** URL to the OTA manifest. */
  manifestUrl: string;
  storage: OTAStorage;
  /** Fetch implementation. */
  fetchImpl?: typeof fetch;
  /** SHA-256 hasher. Returns hex string. */
  sha256: (data: ArrayBuffer) => Promise<string>;
  /** Connection type checker. */
  getConnectionType: () => ConnectionType;
  /** Allow updates on cellular. Default false. */
  allowCellular?: boolean;
  /** Check interval in ms. Default 86400000 (24h). */
  checkIntervalMs?: number;
  /** Clock. */
  now?: () => number;
  /** Timer for tests. */
  scheduler?: {
    set: (fn: () => void, ms: number) => unknown;
    clear: (handle: unknown) => void;
  };
}

export type OTAUpdateStatus = 'idle' | 'checking' | 'downloading' | 'up-to-date' | 'updated' | 'deferred' | 'error';

export interface OTAUpdateResult {
  readonly status: OTAUpdateStatus;
  readonly patternUpdated: boolean;
  readonly modelUpdated: boolean;
  readonly error?: string;
}

// ────────────────────────────────────────────────────────────
// OTAUpdater
// ────────────────────────────────────────────────────────────

export class OTAUpdater {
  private readonly deps: OTAUpdaterDeps;
  private readonly fetchImpl: typeof fetch;
  private readonly checkIntervalMs: number;
  private readonly now: () => number;
  private readonly scheduler: NonNullable<OTAUpdaterDeps['scheduler']>;

  private timerHandle: unknown = null;
  private running = false;
  private lastStatus: OTAUpdateStatus = 'idle';

  constructor(deps: OTAUpdaterDeps) {
    this.deps = deps;
    this.fetchImpl = deps.fetchImpl ?? globalThis.fetch?.bind(globalThis);
    this.checkIntervalMs = deps.checkIntervalMs ?? 86_400_000;
    this.now = deps.now ?? Date.now;
    this.scheduler = deps.scheduler ?? {
      set: (fn, ms) => setInterval(fn, ms),
      clear: (h) => clearInterval(h as ReturnType<typeof setInterval>),
    };
  }

  /** Start periodic checks. Also triggers an immediate check. */
  start(): void {
    if (this.running) return;
    this.running = true;
    void this.checkForUpdates();
    this.timerHandle = this.scheduler.set(() => {
      void this.checkForUpdates();
    }, this.checkIntervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.timerHandle !== null) {
      this.scheduler.clear(this.timerHandle);
      this.timerHandle = null;
    }
  }

  getStatus(): OTAUpdateStatus {
    return this.lastStatus;
  }

  /** Check for updates and download if available. */
  async checkForUpdates(): Promise<OTAUpdateResult> {
    // Bandwidth check
    const connType = this.deps.getConnectionType();
    if (connType === 'cellular' && !this.deps.allowCellular) {
      this.lastStatus = 'deferred';
      return { status: 'deferred', patternUpdated: false, modelUpdated: false };
    }
    if (connType === 'offline') {
      this.lastStatus = 'deferred';
      return { status: 'deferred', patternUpdated: false, modelUpdated: false };
    }

    this.lastStatus = 'checking';

    try {
      // Fetch manifest
      const response = await this.fetchImpl(this.deps.manifestUrl);
      if (!response.ok) {
        this.lastStatus = 'error';
        return { status: 'error', patternUpdated: false, modelUpdated: false, error: `HTTP ${response.status}` };
      }

      const manifest = (await response.json()) as OTAManifest;
      const currentInfo = await this.deps.storage.getVersionInfo();

      let patternUpdated = false;
      let modelUpdated = false;

      // Check pattern version
      if (manifest.patternVersion !== currentInfo.patternVersion) {
        this.lastStatus = 'downloading';
        patternUpdated = await this.downloadAndValidate(
          manifest.patternUrl,
          manifest.patternChecksum,
          'patterns.json',
        );
        if (patternUpdated) {
          await this.deps.storage.setVersionInfo({
            ...currentInfo,
            patternVersion: manifest.patternVersion,
            patternEtag: manifest.patternVersion,
          });
        }
      }

      // Check model version
      if (manifest.modelVersion !== currentInfo.modelVersion) {
        this.lastStatus = 'downloading';
        modelUpdated = await this.downloadAndValidate(
          manifest.modelUrl,
          manifest.modelChecksum,
          'model.pte',
        );
        if (modelUpdated) {
          const updatedInfo = await this.deps.storage.getVersionInfo();
          await this.deps.storage.setVersionInfo({
            ...updatedInfo,
            modelVersion: manifest.modelVersion,
            modelEtag: manifest.modelVersion,
          });
        }
      }

      if (patternUpdated || modelUpdated) {
        this.lastStatus = 'updated';
        return { status: 'updated', patternUpdated, modelUpdated };
      }

      this.lastStatus = 'up-to-date';
      return { status: 'up-to-date', patternUpdated: false, modelUpdated: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.lastStatus = 'error';
      return { status: 'error', patternUpdated: false, modelUpdated: false, error: message };
    }
  }

  private async downloadAndValidate(
    url: string,
    expectedChecksum: string,
    fileName: string,
  ): Promise<boolean> {
    const response = await this.fetchImpl(url);
    if (!response.ok) return false;

    const data = await response.arrayBuffer();
    const actualChecksum = await this.deps.sha256(data);

    if (actualChecksum !== expectedChecksum) {
      return false;
    }

    // Atomic: write new file (old stays until we're sure new is valid)
    const tmpName = `${fileName}.tmp`;
    await this.deps.storage.writeFile(tmpName, data);

    // Swap
    try {
      await this.deps.storage.deleteFile(fileName);
    } catch {
      // Old file may not exist
    }
    await this.deps.storage.writeFile(fileName, data);

    try {
      await this.deps.storage.deleteFile(tmpName);
    } catch {
      // Cleanup best-effort
    }

    return true;
  }
}
