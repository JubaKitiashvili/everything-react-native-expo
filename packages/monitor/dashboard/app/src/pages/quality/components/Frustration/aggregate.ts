// Task 117.23 — Frustration panel aggregation.
//
// Inputs: a recent slice of events (custom + crash). The dashboard's
// useEvents hook already de-dupes + filters by type, so this module
// stays a pure-data transform: events in, sortable rows out.
//
// We surface four things the panel cares about:
//   - per-button error-tap rate (taps that were followed by a crash)
//   - rage-tap clusters (3+ taps on the same target inside 2s)
//   - dead zones (taps the SDK's host flagged as having no handler)
//   - user-impact score (% of distinct sessions that hit each button's
//     frustration signals — proxy for unique-user impact)

import type { EventRecord } from '@/shared/api/types';

/** Mirror of FrustrationCollector.FrustrationSignal — the SDK's enum. */
export type FrustrationSignal = 'rage-tap' | 'dead-tap' | 'error-tap';

export interface FrustrationInstance {
  id: string;
  timestamp: number;
  sessionId: string;
  componentPath: string;
  signals: FrustrationSignal[];
  level: 'low' | 'medium' | 'high';
  tapCount: number;
}

export interface ComponentImpact {
  componentPath: string;
  /** Total raw taps on this component over the window. May be 0 when the
   *  dashboard is fed only the SDK-emitted frustration events. */
  totalTapCount: number;
  /** Frustration events that flagged any signal on this component. */
  frustrationCount: number;
  /** Subset of frustrationCount with rage-tap signal. */
  rageTapCount: number;
  /** Subset with dead-tap signal. */
  deadTapCount: number;
  /** Subset with error-tap signal. */
  errorTapCount: number;
  /** errorTapCount / max(totalTapCount, 1). 0..1. */
  errorRate: number;
  /** Distinct session ids that hit any frustration signal on this path. */
  affectedSessions: number;
  /** affectedSessions / totalSessions. 0..1. */
  userImpactPct: number;
  /**
   * Composite score used to rank buttons in the panel. Weighted toward
   * user-impact (the question the panel asks is "how many users") then
   * error-rate (severity per affected user) then volume (frequency).
   */
  score: number;
}

export interface FrustrationHeadline {
  /** Component the headline is about, when one stood out. */
  componentPath: string | null;
  /** Headline text — exactly one sentence, ready to render. */
  text: string;
  /** Numeric backing for the headline, rendered alongside the sentence. */
  userImpactPct: number;
  errorTapCount: number;
}

/**
 * Filter the event stream down to FrustrationCollector emissions, coerce
 * each payload into a typed FrustrationInstance, drop anything missing
 * the required fields. Newest-first ordering matches every other panel.
 */
export function extractFrustrations(events: readonly EventRecord[]): FrustrationInstance[] {
  const out: FrustrationInstance[] = [];
  for (const event of events) {
    if (event.type !== 'custom') continue;
    const payload = event.payload as { name?: unknown; attributes?: unknown };
    if (payload.name !== 'frustration') continue;
    const attrs = payload.attributes as Record<string, unknown> | undefined;
    if (!attrs) continue;
    const componentPath = typeof attrs.componentPath === 'string' ? attrs.componentPath : null;
    if (!componentPath) continue;
    const signals = Array.isArray(attrs.signals)
      ? (attrs.signals.filter((s): s is FrustrationSignal =>
          s === 'rage-tap' || s === 'dead-tap' || s === 'error-tap',
        ) as FrustrationSignal[])
      : [];
    if (signals.length === 0) continue;
    const level = isLevel(attrs.level) ? attrs.level : 'low';
    const tapCount =
      typeof attrs.tapCount === 'number' && Number.isFinite(attrs.tapCount) ? attrs.tapCount : 1;
    out.push({
      id: event.id,
      timestamp: event.timestamp,
      sessionId: event.sessionId,
      componentPath,
      signals,
      level,
      tapCount,
    });
  }
  return out.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Count raw taps per componentPath. The SDK emits taps as `custom`
 * events with `payload.name === 'touch'`, the same channel
 * FrustrationCollector listens on. Returns a Map for cheap lookups.
 */
export function countTapsByComponent(events: readonly EventRecord[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const event of events) {
    if (event.type !== 'custom') continue;
    const payload = event.payload as { name?: unknown; attributes?: unknown };
    if (payload.name !== 'touch') continue;
    const attrs = payload.attributes as { componentPath?: unknown } | undefined;
    const componentPath = typeof attrs?.componentPath === 'string' ? attrs.componentPath : null;
    if (!componentPath) continue;
    out.set(componentPath, (out.get(componentPath) ?? 0) + 1);
  }
  return out;
}

/**
 * Count distinct sessions across the whole event stream. Used as the
 * denominator for `userImpactPct`. Falls back to 1 when no events
 * present so callers don't divide by zero.
 */
export function countSessions(events: readonly EventRecord[]): number {
  const set = new Set<string>();
  for (const event of events) {
    if (event.sessionId) set.add(event.sessionId);
  }
  return set.size;
}

/**
 * Roll up FrustrationInstance + tap counts + total session count into
 * one ComponentImpact row per componentPath. Returns rows sorted by
 * the composite score descending so the panel's "worst offender" is
 * always the first row.
 */
export function aggregateByComponent(
  frustrations: readonly FrustrationInstance[],
  taps: ReadonlyMap<string, number>,
  totalSessions: number,
): ComponentImpact[] {
  const map = new Map<
    string,
    Omit<ComponentImpact, 'errorRate' | 'userImpactPct' | 'score' | 'totalTapCount' | 'affectedSessions'> & {
      sessionSet: Set<string>;
    }
  >();
  for (const f of frustrations) {
    const slot =
      map.get(f.componentPath) ?? {
        componentPath: f.componentPath,
        frustrationCount: 0,
        rageTapCount: 0,
        deadTapCount: 0,
        errorTapCount: 0,
        sessionSet: new Set<string>(),
      };
    slot.frustrationCount += 1;
    if (f.signals.includes('rage-tap')) slot.rageTapCount += 1;
    if (f.signals.includes('dead-tap')) slot.deadTapCount += 1;
    if (f.signals.includes('error-tap')) slot.errorTapCount += 1;
    if (f.sessionId) slot.sessionSet.add(f.sessionId);
    map.set(f.componentPath, slot);
  }

  const safeTotalSessions = totalSessions > 0 ? totalSessions : 1;
  const rows: ComponentImpact[] = [];
  for (const slot of map.values()) {
    const totalTapCount = taps.get(slot.componentPath) ?? 0;
    const errorRate = totalTapCount === 0 ? 0 : slot.errorTapCount / totalTapCount;
    const userImpactPct = slot.sessionSet.size / safeTotalSessions;
    rows.push({
      componentPath: slot.componentPath,
      totalTapCount,
      frustrationCount: slot.frustrationCount,
      rageTapCount: slot.rageTapCount,
      deadTapCount: slot.deadTapCount,
      errorTapCount: slot.errorTapCount,
      errorRate,
      affectedSessions: slot.sessionSet.size,
      userImpactPct,
      score: scoreOf(userImpactPct, errorRate, slot.frustrationCount),
    });
  }
  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.frustrationCount - a.frustrationCount;
  });
  return rows;
}

/**
 * Pick the headline sentence the panel renders at the top. The
 * "winner" is the highest-scoring component IF it carries a non-zero
 * user-impact pct AND has at least one error-tap. Otherwise we surface
 * a softer headline — silence is honest, fabricated drama is not.
 */
export function pickHeadline(
  impacts: readonly ComponentImpact[],
  totalSessions: number,
): FrustrationHeadline {
  if (impacts.length === 0 || totalSessions === 0) {
    return {
      componentPath: null,
      text: 'No frustration recorded in this window.',
      userImpactPct: 0,
      errorTapCount: 0,
    };
  }
  const winner = impacts.find((i) => i.errorTapCount > 0 && i.userImpactPct > 0);
  if (!winner) {
    const top = impacts[0]!;
    return {
      componentPath: top.componentPath,
      text: `Top frustration: ${top.componentPath} (${top.frustrationCount} signals).`,
      userImpactPct: top.userImpactPct,
      errorTapCount: top.errorTapCount,
    };
  }
  const pct = Math.round(winner.userImpactPct * 100);
  return {
    componentPath: winner.componentPath,
    text: `${winner.componentPath} causes errors for ${pct}% of users.`,
    userImpactPct: winner.userImpactPct,
    errorTapCount: winner.errorTapCount,
  };
}

/**
 * Composite score for the row sort. User-impact dominates because the
 * panel is answering the question "who is hurting" — error severity
 * second, frequency last (a high-frequency low-impact component is
 * less interesting than a low-frequency high-impact one).
 */
function scoreOf(userImpactPct: number, errorRate: number, frustrationCount: number): number {
  return userImpactPct * 100 + errorRate * 50 + Math.min(frustrationCount, 50);
}

function isLevel(v: unknown): v is FrustrationInstance['level'] {
  return v === 'low' || v === 'medium' || v === 'high';
}
