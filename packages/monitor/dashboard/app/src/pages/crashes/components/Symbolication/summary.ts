import type { SymbolFileRecord, SymbolPlatform } from '@/shared/api/types';

export interface SymbolGroup {
  /** `{platform}|{bundleId}|{version}` — stable id for the rollup row. */
  key: string;
  platform: SymbolPlatform;
  bundleId: string;
  version: string;
  files: SymbolFileRecord[];
  totalSizeBytes: number;
  totalEntries: number;
  /** Latest upload wall-clock ms across `files`. */
  lastUploadedAt: number;
}

/**
 * Roll every artefact up to its (platform, bundleId, version) signature so
 * the history table renders one row per shipping target rather than one row
 * per re-upload. Entries are ordered newest-first by `lastUploadedAt`.
 */
export function groupSymbolFiles(files: SymbolFileRecord[]): SymbolGroup[] {
  const byKey = new Map<string, SymbolGroup>();
  for (const file of files) {
    const key = `${file.platform}|${file.bundleId}|${file.version}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.files.push(file);
      existing.totalSizeBytes += file.sizeBytes;
      existing.totalEntries += file.entryCount;
      if (file.uploadedAt > existing.lastUploadedAt) {
        existing.lastUploadedAt = file.uploadedAt;
      }
    } else {
      byKey.set(key, {
        key,
        platform: file.platform,
        bundleId: file.bundleId,
        version: file.version,
        files: [file],
        totalSizeBytes: file.sizeBytes,
        totalEntries: file.entryCount,
        lastUploadedAt: file.uploadedAt,
      });
    }
  }
  for (const group of byKey.values()) {
    group.files.sort((a, b) => b.uploadedAt - a.uploadedAt);
  }
  return [...byKey.values()].sort((a, b) => b.lastUploadedAt - a.lastUploadedAt);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
