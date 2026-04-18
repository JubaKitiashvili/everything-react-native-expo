import type { CrashGroupRecord, EventRecord } from '../../shared/api/types';
import { BUILT_IN_PATTERNS, type BuiltInPattern, type PatternCategory } from './catalog';

export interface PatternRow {
  id: string;
  name: string;
  description: string;
  category: PatternCategory;
  /** True if this pattern isn't in the built-in catalog — the SDK's pattern-sync learned it. */
  learned: boolean;
  /** Total pattern_match + group.aiSuggestion occurrences in the source window. */
  matchCount: number;
  /** Most recent match timestamp (ms epoch), or null when unseen. */
  lastMatchedAt: number | null;
  /** 0..1 recency-weighted confidence; see `computeDecayedConfidence`. */
  confidence: number;
}

export interface BuildPatternsOptions {
  /** Anchor for recency decay. Defaults to Date.now(). */
  now?: number;
  /** Pattern confidence half-life (ms). Default 7 days. */
  halfLifeMs?: number;
}

/**
 * Merge the SDK's built-in catalog with pattern match events + crash
 * group suggestions the server has seen. Patterns that were never
 * matched still appear (learned: false, matchCount: 0) so the user can
 * see the full library. Patterns emitted by pattern_match or carried
 * on a crash group that aren't in the catalog are added as `learned`
 * so future SDK additions don't silently drop off the UI.
 */
export function buildPatternRows(
  events: EventRecord[],
  groups: CrashGroupRecord[],
  options: BuildPatternsOptions = {},
): PatternRow[] {
  const now = options.now ?? Date.now();
  const halfLifeMs = options.halfLifeMs ?? 7 * 86_400_000;

  const byId = new Map<string, MutableRow>();
  for (const pattern of BUILT_IN_PATTERNS) {
    byId.set(pattern.id, seedFromCatalog(pattern));
  }

  const bump = (
    id: string,
    sourceConfidence: number | null,
    timestamp: number,
    fallback: BuiltInPattern | null,
  ): void => {
    const existing = byId.get(id);
    if (existing) {
      existing.matchCount += 1;
      if (sourceConfidence !== null) {
        existing.observedConfidenceSum += clampUnit(sourceConfidence);
        existing.observedConfidenceN += 1;
      }
      if (existing.lastMatchedAt === null || timestamp > existing.lastMatchedAt) {
        existing.lastMatchedAt = timestamp;
      }
      return;
    }
    const row: MutableRow = {
      id,
      name: fallback?.name ?? id,
      description: fallback?.description ?? 'Learned pattern discovered in this project.',
      category: fallback?.category ?? 'crash',
      learned: true,
      matchCount: 1,
      lastMatchedAt: timestamp,
      observedConfidenceSum: sourceConfidence !== null ? clampUnit(sourceConfidence) : 0,
      observedConfidenceN: sourceConfidence !== null ? 1 : 0,
    };
    byId.set(id, row);
  };

  for (const event of events) {
    if (event.type !== 'pattern_match') continue;
    const payload = event.payload as { pattern?: unknown; confidence?: unknown };
    const id = typeof payload.pattern === 'string' ? payload.pattern : null;
    if (!id) continue;
    const confidence = toFiniteNumber(payload.confidence);
    bump(id, confidence, event.timestamp, null);
  }

  for (const group of groups) {
    const suggestion = group.aiSuggestion as
      | { pattern?: unknown; confidence?: unknown }
      | undefined;
    const id = typeof suggestion?.pattern === 'string' ? suggestion.pattern : null;
    if (!id) continue;
    const confidence = toFiniteNumber(suggestion?.confidence);
    bump(id, confidence, group.lastSeen, null);
  }

  return [...byId.values()]
    .map((row) => finaliseRow(row, now, halfLifeMs))
    .sort((a, b) => {
      if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return a.name.localeCompare(b.name);
    });
}

/**
 * Recency-weighted confidence: average observed confidence × exponential
 * decay toward 0 as the last match ages relative to `halfLifeMs`. Pure
 * so the UI can reuse it when the user drags the half-life slider in
 * future work.
 */
export function computeDecayedConfidence(
  observedAverage: number,
  lastMatchedAt: number | null,
  now: number,
  halfLifeMs: number,
): number {
  if (lastMatchedAt === null || halfLifeMs <= 0) return 0;
  const age = Math.max(0, now - lastMatchedAt);
  const decay = Math.pow(0.5, age / halfLifeMs);
  return clampUnit(observedAverage * decay);
}

interface MutableRow extends Omit<PatternRow, 'confidence'> {
  observedConfidenceSum: number;
  observedConfidenceN: number;
}

function seedFromCatalog(pattern: BuiltInPattern): MutableRow {
  return {
    id: pattern.id,
    name: pattern.name,
    description: pattern.description,
    category: pattern.category,
    learned: false,
    matchCount: 0,
    lastMatchedAt: null,
    observedConfidenceSum: 0,
    observedConfidenceN: 0,
  };
}

function finaliseRow(row: MutableRow, now: number, halfLifeMs: number): PatternRow {
  const avg = row.observedConfidenceN > 0 ? row.observedConfidenceSum / row.observedConfidenceN : 0;
  const confidence = computeDecayedConfidence(avg, row.lastMatchedAt, now, halfLifeMs);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    learned: row.learned,
    matchCount: row.matchCount,
    lastMatchedAt: row.lastMatchedAt,
    confidence,
  };
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clampUnit(value: number): number {
  if (value <= 1) return Math.max(0, value);
  return Math.min(1, value / 100);
}
