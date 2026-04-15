/**
 * Task 63 — Pattern Sync Logic
 *
 * Merge local + server patterns. Higher confidence wins.
 * Upload new local patterns. Download newer server patterns.
 */

import type { StoredPattern, NewStoredPattern, PatternStore } from './store';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface LocalPattern {
  readonly patternType: string;
  readonly patternData: Record<string, unknown>;
  readonly confidence: number;
  readonly sampleCount: number;
  readonly updatedAt: number; // epoch ms
}

export interface SyncResult {
  readonly uploaded: number;
  readonly downloaded: number;
  readonly merged: number;
}

// ────────────────────────────────────────────────────────────
// Sync
// ────────────────────────────────────────────────────────────

export async function syncPatterns(
  appId: string,
  localPatterns: readonly LocalPattern[],
  store: PatternStore,
): Promise<SyncResult> {
  const serverPatterns = await store.findAll({ appId });
  const serverByType = new Map<string, StoredPattern>();
  for (const sp of serverPatterns) {
    serverByType.set(sp.patternType, sp);
  }

  let uploaded = 0;
  let downloaded = 0;
  let merged = 0;

  // Process local patterns
  for (const local of localPatterns) {
    const server = serverByType.get(local.patternType);

    if (!server) {
      // New local pattern — upload
      const newPattern: NewStoredPattern = {
        appId,
        patternType: local.patternType,
        patternData: local.patternData,
        confidence: local.confidence,
        sampleCount: local.sampleCount,
      };
      await store.create(newPattern);
      uploaded++;
    } else {
      // Both exist — merge (higher confidence wins)
      const localNewer = local.updatedAt > server.updatedAt.getTime();
      const localHigherConfidence = local.confidence > server.confidence;

      if (localHigherConfidence || (localNewer && local.confidence === server.confidence)) {
        await store.update(server.id, {
          confidence: local.confidence,
          sampleCount: local.sampleCount,
          patternData: local.patternData,
        });
        merged++;
      }
      serverByType.delete(local.patternType);
    }
  }

  // Remaining server patterns are newer than local — count as downloads
  const localTypeSet = new Set(localPatterns.map((p) => p.patternType));
  for (const [type] of serverByType) {
    if (!localTypeSet.has(type)) {
      downloaded++;
    }
  }

  return { uploaded, downloaded, merged };
}

/**
 * Fetch all server patterns for a given app, suitable for merging into local cache.
 */
export async function fetchServerPatterns(
  appId: string,
  store: PatternStore,
): Promise<readonly LocalPattern[]> {
  const patterns = await store.findAll({ appId });
  return patterns.map((p) => ({
    patternType: p.patternType,
    patternData: p.patternData,
    confidence: p.confidence,
    sampleCount: p.sampleCount,
    updatedAt: p.updatedAt.getTime(),
  }));
}
