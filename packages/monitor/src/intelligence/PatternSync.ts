/**
 * Task 63 — Client-Side Pattern Sync
 *
 * Syncs local patterns with the server on session end (debounced, max 1/hour)
 * and on cold start (fetch + merge). Uses BatchTransport for delivery.
 * Caches locally in memory.
 */

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface CachedPattern {
  readonly patternType: string;
  readonly patternData: Record<string, unknown>;
  readonly confidence: number;
  readonly sampleCount: number;
  readonly updatedAt: number;
}

export interface PatternSyncTransport {
  uploadPatterns(appId: string, patterns: readonly CachedPattern[]): Promise<void>;
  downloadPatterns(appId: string): Promise<readonly CachedPattern[]>;
}

export interface PatternSyncDeps {
  appId: string;
  transport: PatternSyncTransport;
  /** Clock. Default: Date.now */
  now?: () => number;
  /** Min interval between syncs in ms. Default 3600000 (1 hour). */
  minSyncIntervalMs?: number;
}

// ────────────────────────────────────────────────────────────
// PatternSync
// ────────────────────────────────────────────────────────────

export class PatternSync {
  private readonly deps: PatternSyncDeps;
  private readonly minSyncIntervalMs: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, CachedPattern>();
  private lastSyncTime = 0;
  private syncing = false;

  constructor(deps: PatternSyncDeps) {
    this.deps = deps;
    this.minSyncIntervalMs = deps.minSyncIntervalMs ?? 3_600_000;
    this.now = deps.now ?? Date.now;
  }

  /** Add or update a local pattern. */
  addPattern(pattern: CachedPattern): void {
    const existing = this.cache.get(pattern.patternType);
    if (!existing || pattern.confidence > existing.confidence || pattern.updatedAt > existing.updatedAt) {
      this.cache.set(pattern.patternType, pattern);
    }
  }

  /** Get all cached patterns. */
  getPatterns(): readonly CachedPattern[] {
    return [...this.cache.values()];
  }

  /** Get a specific pattern by type. */
  getPattern(patternType: string): CachedPattern | null {
    return this.cache.get(patternType) ?? null;
  }

  /**
   * Cold start: download server patterns and merge into local cache.
   */
  async fetchAndMerge(): Promise<number> {
    const serverPatterns = await this.deps.transport.downloadPatterns(this.deps.appId);
    let merged = 0;

    for (const sp of serverPatterns) {
      const existing = this.cache.get(sp.patternType);
      if (!existing || sp.confidence > existing.confidence) {
        this.cache.set(sp.patternType, sp);
        merged++;
      }
    }

    this.lastSyncTime = this.now();
    return merged;
  }

  /**
   * Session end: upload local patterns (debounced, max 1/hour).
   * Returns true if sync actually happened, false if throttled.
   */
  async syncOnSessionEnd(): Promise<boolean> {
    if (this.syncing) return false;

    const elapsed = this.now() - this.lastSyncTime;
    if (elapsed < this.minSyncIntervalMs) return false;

    if (this.cache.size === 0) return false;

    this.syncing = true;
    try {
      await this.deps.transport.uploadPatterns(
        this.deps.appId,
        [...this.cache.values()],
      );
      this.lastSyncTime = this.now();
      return true;
    } finally {
      this.syncing = false;
    }
  }

  /** How long ago the last sync happened (ms). -1 if never synced. */
  timeSinceLastSync(): number {
    if (this.lastSyncTime === 0) return -1;
    return this.now() - this.lastSyncTime;
  }

  /** Clear the local cache. */
  clear(): void {
    this.cache.clear();
  }
}
