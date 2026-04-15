/**
 * Task 66 — Server OTA Manifest
 *
 * Provides the manifest describing current pattern and model versions,
 * download URLs, and checksums for OTA updates.
 */

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface OTAManifestData {
  readonly patternVersion: string;
  readonly modelVersion: string;
  readonly patternUrl: string;
  readonly modelUrl: string;
  readonly patternChecksum: string;
  readonly modelChecksum: string;
}

export interface OTAManifestStore {
  getManifest(): Promise<OTAManifestData | null>;
  setManifest(manifest: OTAManifestData): Promise<void>;
}

export interface OTAArtifactUpload {
  readonly version: string;
  readonly url: string;
  readonly checksum: string;
}

// ────────────────────────────────────────────────────────────
// Manifest Service
// ────────────────────────────────────────────────────────────

export class OTAManifestService {
  constructor(private readonly store: OTAManifestStore) {}

  /** Get the current manifest. Returns null if not yet configured. */
  async getManifest(): Promise<OTAManifestData | null> {
    return this.store.getManifest();
  }

  /** Update the pattern artifact in the manifest. */
  async updatePatterns(upload: OTAArtifactUpload): Promise<OTAManifestData> {
    const current = await this.store.getManifest();
    const updated: OTAManifestData = {
      patternVersion: upload.version,
      patternUrl: upload.url,
      patternChecksum: upload.checksum,
      modelVersion: current?.modelVersion ?? '0.0.0',
      modelUrl: current?.modelUrl ?? '',
      modelChecksum: current?.modelChecksum ?? '',
    };
    await this.store.setManifest(updated);
    return updated;
  }

  /** Update the model artifact in the manifest. */
  async updateModel(upload: OTAArtifactUpload): Promise<OTAManifestData> {
    const current = await this.store.getManifest();
    const updated: OTAManifestData = {
      patternVersion: current?.patternVersion ?? '0.0.0',
      patternUrl: current?.patternUrl ?? '',
      patternChecksum: current?.patternChecksum ?? '',
      modelVersion: upload.version,
      modelUrl: upload.url,
      modelChecksum: upload.checksum,
    };
    await this.store.setManifest(updated);
    return updated;
  }

  /** Validate that a manifest has all required fields populated. */
  static isComplete(manifest: OTAManifestData): boolean {
    return !!(
      manifest.patternVersion &&
      manifest.modelVersion &&
      manifest.patternUrl &&
      manifest.modelUrl &&
      manifest.patternChecksum &&
      manifest.modelChecksum
    );
  }
}
