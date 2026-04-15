/**
 * Task 64 — Cross-Project Learning
 *
 * Aggregates anonymized patterns across opt-in projects.
 * Tags with confidence + sample count. Returns suggestions (not auto-applied).
 */

import type { AnonymizedPatternData } from './anonymizer';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface CrossProjectSuggestion {
  readonly patternType: string;
  readonly patternData: Record<string, unknown>;
  readonly aggregateConfidence: number;
  readonly totalSamples: number;
  readonly projectCount: number;
}

export interface CrossProjectStore {
  /** Fetch all anonymized patterns from opt-in projects. */
  fetchAllPatterns(): Promise<readonly AnonymizedPatternData[]>;
  /** Store aggregated suggestions. */
  storeSuggestions(suggestions: readonly CrossProjectSuggestion[]): Promise<void>;
  /** Fetch suggestions for a pattern type. */
  getSuggestions(patternType?: string): Promise<readonly CrossProjectSuggestion[]>;
}

// ────────────────────────────────────────────────────────────
// Aggregation
// ────────────────────────────────────────────────────────────

export function aggregatePatterns(
  patterns: readonly AnonymizedPatternData[],
): readonly CrossProjectSuggestion[] {
  const groups = new Map<string, {
    patterns: AnonymizedPatternData[];
    totalConfidence: number;
    totalSamples: number;
  }>();

  for (const p of patterns) {
    let group = groups.get(p.patternType);
    if (!group) {
      group = { patterns: [], totalConfidence: 0, totalSamples: 0 };
      groups.set(p.patternType, group);
    }
    group.patterns.push(p);
    group.totalConfidence += p.confidence;
    group.totalSamples += p.sampleCount;
  }

  const suggestions: CrossProjectSuggestion[] = [];

  for (const [patternType, group] of groups) {
    // Use the pattern data from the highest-confidence entry
    const best = group.patterns.reduce((a, b) =>
      b.confidence > a.confidence ? b : a,
    );

    suggestions.push({
      patternType,
      patternData: best.patternData,
      aggregateConfidence: group.totalConfidence / group.patterns.length,
      totalSamples: group.totalSamples,
      projectCount: group.patterns.length,
    });
  }

  return suggestions.sort((a, b) => b.aggregateConfidence - a.aggregateConfidence);
}

// ────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────

export class CrossProjectLearning {
  constructor(private readonly store: CrossProjectStore) {}

  /**
   * Run the aggregation pipeline: fetch all opt-in patterns,
   * aggregate, and store suggestions.
   */
  async aggregate(): Promise<readonly CrossProjectSuggestion[]> {
    const patterns = await this.store.fetchAllPatterns();
    const suggestions = aggregatePatterns(patterns);
    await this.store.storeSuggestions(suggestions);
    return suggestions;
  }

  /**
   * Get suggestions for a given pattern type, or all if unspecified.
   * These are returned to individual projects as recommendations.
   */
  async getSuggestions(patternType?: string): Promise<readonly CrossProjectSuggestion[]> {
    return this.store.getSuggestions(patternType);
  }
}
