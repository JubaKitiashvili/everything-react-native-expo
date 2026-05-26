import { describe, expect, test } from 'vitest';
import type { SymbolFileRecord } from '@/shared/api/types';
import { formatBytes, groupSymbolFiles } from './summary';

function makeFile(partial: Partial<SymbolFileRecord> = {}): SymbolFileRecord {
  return {
    id: partial.id ?? 's',
    platform: partial.platform ?? 'android',
    bundleId: partial.bundleId ?? 'com.example.app',
    version: partial.version ?? '1.0.0',
    filename: partial.filename ?? 'mapping.txt',
    sizeBytes: partial.sizeBytes ?? 1024,
    uploadedAt: partial.uploadedAt ?? 1_770_000_000_000,
    entryCount: partial.entryCount ?? 0,
    uuid: partial.uuid ?? null,
    mappingText: partial.mappingText ?? null,
  };
}

describe('groupSymbolFiles', () => {
  test('collapses duplicate uploads per (platform, bundleId, version) signature', () => {
    const groups = groupSymbolFiles([
      makeFile({ id: 'a', version: '1.0.0', uploadedAt: 100, sizeBytes: 500, entryCount: 10 }),
      makeFile({ id: 'b', version: '1.0.0', uploadedAt: 200, sizeBytes: 700, entryCount: 15 }),
      makeFile({ id: 'c', version: '1.1.0', uploadedAt: 150, sizeBytes: 900, entryCount: 20 }),
      makeFile({
        id: 'd',
        platform: 'ios',
        version: '1.0.0',
        uploadedAt: 250,
        sizeBytes: 2000,
        entryCount: 0,
      }),
    ]);
    // Sort: lastUploadedAt desc → ios/1.0.0 (250), android/1.0.0 (200), android/1.1.0 (150).
    expect(groups.map((g) => g.key)).toEqual([
      'ios|com.example.app|1.0.0',
      'android|com.example.app|1.0.0',
      'android|com.example.app|1.1.0',
    ]);
    const androidV1 = groups.find((g) => g.key === 'android|com.example.app|1.0.0')!;
    expect(androidV1.files.map((f) => f.id)).toEqual(['b', 'a']); // newest first
    expect(androidV1.totalSizeBytes).toBe(1200);
    expect(androidV1.totalEntries).toBe(25);
    expect(androidV1.lastUploadedAt).toBe(200);
  });
});

describe('formatBytes', () => {
  test('scales bytes to human units', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(3_500_000)).toBe('3.3 MB');
  });
});
