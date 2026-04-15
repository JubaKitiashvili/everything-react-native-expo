/**
 * Task 65 — ModelLoader
 *
 * Lazy model loading interface with download progress tracking.
 * The actual model implementation is injected — this provides the
 * loading lifecycle and progress reporting.
 */

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type ModelStatus = 'idle' | 'downloading' | 'loading' | 'ready' | 'error';

export interface ModelLoadProgress {
  readonly status: ModelStatus;
  readonly downloadProgress: number; // 0-1
  readonly error?: string;
}

export interface ModelSource {
  /** URL or local path to the model file. */
  readonly uri: string;
  /** Expected SHA-256 checksum. */
  readonly checksum?: string;
  /** Model version string. */
  readonly version: string;
}

export interface ModelFactory<T> {
  download(uri: string, onProgress: (progress: number) => void): Promise<string>;
  load(localPath: string): Promise<T>;
  validate(localPath: string, checksum: string): Promise<boolean>;
}

// ────────────────────────────────────────────────────────────
// ModelLoader
// ────────────────────────────────────────────────────────────

export class ModelLoader<T> {
  private status: ModelStatus = 'idle';
  private downloadProgress = 0;
  private error: string | undefined;
  private model: T | null = null;
  private readonly listeners = new Set<(progress: ModelLoadProgress) => void>();

  constructor(
    private readonly source: ModelSource,
    private readonly factory: ModelFactory<T>,
  ) {}

  getProgress(): ModelLoadProgress {
    return {
      status: this.status,
      downloadProgress: this.downloadProgress,
      error: this.error,
    };
  }

  getModel(): T | null {
    return this.model;
  }

  isReady(): boolean {
    return this.status === 'ready';
  }

  onProgress(listener: (progress: ModelLoadProgress) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(): Promise<T> {
    if (this.model) return this.model;

    try {
      this.setStatus('downloading');
      const localPath = await this.factory.download(
        this.source.uri,
        (progress) => {
          this.downloadProgress = progress;
          this.notify();
        },
      );

      if (this.source.checksum) {
        const valid = await this.factory.validate(localPath, this.source.checksum);
        if (!valid) {
          throw new Error('Checksum validation failed');
        }
      }

      this.setStatus('loading');
      this.model = await this.factory.load(localPath);
      this.setStatus('ready');
      return this.model;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.error = message;
      this.setStatus('error');
      throw err;
    }
  }

  dispose(): void {
    this.model = null;
    this.status = 'idle';
    this.downloadProgress = 0;
    this.error = undefined;
    this.listeners.clear();
  }

  private setStatus(status: ModelStatus): void {
    this.status = status;
    this.notify();
  }

  private notify(): void {
    const progress = this.getProgress();
    for (const listener of this.listeners) {
      try {
        listener(progress);
      } catch {
        // swallow
      }
    }
  }
}
