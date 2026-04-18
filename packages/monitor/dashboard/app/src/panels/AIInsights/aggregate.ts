import type { CrashGroupRecord, EventRecord } from '../../shared/api/types';

export interface FixSuccessSummary {
  /** Crash groups with both an AI suggestion and status `resolved`. */
  resolvedWithAi: number;
  /** Crash groups that had an AI suggestion but weren't resolved. */
  suggestedButUnresolved: number;
  /** Crash groups with no AI suggestion attached. */
  withoutSuggestion: number;
  /** Total crash groups considered. */
  total: number;
  /** 0..1 success rate; null when no AI-assisted groups exist. */
  successRate: number | null;
}

export interface MttrSummary {
  /** Mean ms between first-seen and last-seen for agent-resolved groups. */
  agentMeanMs: number | null;
  /** Mean ms for groups resolved without an AI suggestion (human). */
  humanMeanMs: number | null;
  agentSamples: number;
  humanSamples: number;
}

export interface PatternHit {
  pattern: string;
  count: number;
  lastSeen: number;
  avgConfidence: number;
}

export interface ConfidenceSample {
  timestamp: number;
  confidence: number;
}

/**
 * Aggregate AI-assisted resolution stats from crash groups. A group
 * counts as "resolved with AI" when it carries an `aiSuggestion` and
 * its status is `resolved`; these are the wins we want the dashboard
 * to surface front-and-centre.
 */
export function computeFixSuccessRate(groups: CrashGroupRecord[]): FixSuccessSummary {
  let resolvedWithAi = 0;
  let suggestedButUnresolved = 0;
  let withoutSuggestion = 0;
  for (const group of groups) {
    const hasSuggestion = Boolean(group.aiSuggestion);
    if (hasSuggestion && group.status === 'resolved') {
      resolvedWithAi += 1;
    } else if (hasSuggestion) {
      suggestedButUnresolved += 1;
    } else {
      withoutSuggestion += 1;
    }
  }
  const assistedTotal = resolvedWithAi + suggestedButUnresolved;
  return {
    resolvedWithAi,
    suggestedButUnresolved,
    withoutSuggestion,
    total: groups.length,
    successRate: assistedTotal > 0 ? resolvedWithAi / assistedTotal : null,
  };
}

/**
 * Mean time-to-resolution per cohort. We approximate resolution time as
 * `lastSeen - firstSeen` for every resolved group; agent vs human is
 * decided by whether an AI suggestion is attached. Returns null means
 * when a cohort has no samples so the UI can show "—" instead of 0s.
 */
export function computeMttr(groups: CrashGroupRecord[]): MttrSummary {
  let agentTotal = 0;
  let humanTotal = 0;
  let agentSamples = 0;
  let humanSamples = 0;
  for (const group of groups) {
    if (group.status !== 'resolved') continue;
    const duration = Math.max(0, group.lastSeen - group.firstSeen);
    if (group.aiSuggestion) {
      agentTotal += duration;
      agentSamples += 1;
    } else {
      humanTotal += duration;
      humanSamples += 1;
    }
  }
  return {
    agentMeanMs: agentSamples > 0 ? agentTotal / agentSamples : null,
    humanMeanMs: humanSamples > 0 ? humanTotal / humanSamples : null,
    agentSamples,
    humanSamples,
  };
}

/**
 * Rank the patterns the SDK's AI matched most in the current window.
 * Reads from both `pattern_match` events and the `pattern` field of
 * a crash group's attached suggestion.
 */
export function topPatternHits(
  events: EventRecord[],
  groups: CrashGroupRecord[],
  limit = 5,
): PatternHit[] {
  const byName = new Map<
    string,
    { count: number; lastSeen: number; confSum: number; confN: number }
  >();

  const bump = (name: string, lastSeen: number, confidence: number | null): void => {
    const existing = byName.get(name);
    if (existing) {
      existing.count += 1;
      if (lastSeen > existing.lastSeen) existing.lastSeen = lastSeen;
      if (confidence !== null) {
        existing.confSum += confidence;
        existing.confN += 1;
      }
    } else {
      byName.set(name, {
        count: 1,
        lastSeen,
        confSum: confidence ?? 0,
        confN: confidence !== null ? 1 : 0,
      });
    }
  };

  for (const event of events) {
    if (event.type !== 'pattern_match') continue;
    const payload = event.payload as { pattern?: unknown; confidence?: unknown };
    const name = typeof payload.pattern === 'string' ? payload.pattern : null;
    if (!name) continue;
    const rawConfidence = toFiniteNumber(payload.confidence);
    const confidence = rawConfidence === null ? null : clampUnit(rawConfidence);
    bump(name, event.timestamp, confidence);
  }

  for (const group of groups) {
    const suggestion = group.aiSuggestion as
      | { pattern?: unknown; confidence?: unknown }
      | undefined;
    const name = typeof suggestion?.pattern === 'string' ? suggestion.pattern : null;
    if (!name) continue;
    const rawConfidence = toFiniteNumber(suggestion?.confidence);
    const confidence = rawConfidence === null ? null : clampUnit(rawConfidence);
    bump(name, group.lastSeen, confidence);
  }

  return [...byName.entries()]
    .map(([pattern, agg]) => ({
      pattern,
      count: agg.count,
      lastSeen: agg.lastSeen,
      avgConfidence: agg.confN > 0 ? agg.confSum / agg.confN : 0,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.lastSeen - a.lastSeen;
    })
    .slice(0, limit);
}

/**
 * Extract AI-suggestion confidence samples, ordered ascending by time,
 * for the confidence-trend sparkline.
 */
export function extractConfidenceSeries(events: EventRecord[]): ConfidenceSample[] {
  const out: ConfidenceSample[] = [];
  for (const event of events) {
    if (event.type !== 'ai_suggestion' && event.type !== 'pattern_match') continue;
    const payload = event.payload as { confidence?: unknown };
    const confidence = toFiniteNumber(payload.confidence);
    if (confidence === null) continue;
    out.push({ timestamp: event.timestamp, confidence: clampUnit(confidence) });
  }
  return out.sort((a, b) => a.timestamp - b.timestamp);
}

export function formatMttr(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)} h`;
  return `${(ms / 86_400_000).toFixed(1)} d`;
}

export function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return `${Math.round(value * 100)}%`;
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clampUnit(value: number): number {
  if (value <= 1) return Math.max(0, value);
  // Some SDKs emit 0–100; normalise to 0–1.
  return Math.min(1, value / 100);
}
