import type { CrashGroupRecord, SessionRecord } from '../../shared/api/types';

export interface Deploy {
  /** `${appVersion}@${channel ?? 'default'}`. */
  id: string;
  appVersion: string;
  channel: string;
  /** First session timestamp where this deploy appeared. */
  firstSeen: number;
}

export interface DoraMetric {
  /** Current-period value; null when not computable. */
  value: number | null;
  /** Previous-period value for trend arrows; null when unknown. */
  previous: number | null;
  /** Sample count that fed the value — shown in the small print. */
  samples: number;
}

export type TrendDirection = 'up' | 'down' | 'flat';

/**
 * Extract the set of distinct app-version / channel combos seen in
 * sessions, in chronological order of first appearance. These are the
 * "deploys" the dashboard reasons about — we don't currently have a
 * first-class deploy event, so the session fleet is our proxy.
 */
export function extractDeploys(sessions: SessionRecord[]): Deploy[] {
  const byKey = new Map<string, Deploy>();
  for (const session of sessions) {
    const appVersion = session.appVersion?.trim();
    if (!appVersion) continue;
    const channel = session.channel?.trim() || 'default';
    const key = `${appVersion}@${channel}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { id: key, appVersion, channel, firstSeen: session.startedAt });
    } else if (session.startedAt < existing.firstSeen) {
      existing.firstSeen = session.startedAt;
    }
  }
  return [...byKey.values()].sort((a, b) => a.firstSeen - b.firstSeen);
}

/**
 * Mean time to recovery in ms over the selected window (default: the
 * last 14 days from `now`). Uses `lastSeen - firstSeen` as the best
 * available proxy for "time it took to resolve" on crash groups with
 * status === 'resolved'.
 */
export function computeMttr(
  groups: CrashGroupRecord[],
  options: { now?: number; windowMs?: number } = {},
): DoraMetric {
  const now = options.now ?? Date.now();
  const windowMs = options.windowMs ?? 14 * 86_400_000;
  const previousStart = now - windowMs * 2;
  const currentStart = now - windowMs;

  const current = averageResolution(groups, currentStart, now);
  const previous = averageResolution(groups, previousStart, currentStart);
  return {
    value: current.mean,
    previous: previous.mean,
    samples: current.count,
  };
}

function averageResolution(
  groups: CrashGroupRecord[],
  startTs: number,
  endTs: number,
): { mean: number | null; count: number } {
  let total = 0;
  let count = 0;
  for (const group of groups) {
    if (group.status !== 'resolved') continue;
    if (group.lastSeen < startTs || group.lastSeen > endTs) continue;
    total += Math.max(0, group.lastSeen - group.firstSeen);
    count += 1;
  }
  return { mean: count > 0 ? total / count : null, count };
}

/**
 * Change Failure Rate ≈ fraction of deploys that were followed by at
 * least one crash within `failureWindowMs` (default 24h). When no
 * deploys exist in the window, value is null.
 */
export function computeChangeFailureRate(
  groups: CrashGroupRecord[],
  deploys: Deploy[],
  options: { now?: number; windowMs?: number; failureWindowMs?: number } = {},
): DoraMetric {
  const now = options.now ?? Date.now();
  const windowMs = options.windowMs ?? 14 * 86_400_000;
  const failureWindowMs = options.failureWindowMs ?? 86_400_000;

  const withinCurrent = deploys.filter((d) => d.firstSeen >= now - windowMs && d.firstSeen <= now);
  const withinPrevious = deploys.filter(
    (d) => d.firstSeen >= now - windowMs * 2 && d.firstSeen < now - windowMs,
  );

  const rateFor = (list: Deploy[]): number | null => {
    if (list.length === 0) return null;
    let failures = 0;
    for (const deploy of list) {
      const windowEnd = deploy.firstSeen + failureWindowMs;
      const hasCrash = groups.some(
        (g) => g.firstSeen >= deploy.firstSeen && g.firstSeen <= windowEnd,
      );
      if (hasCrash) failures += 1;
    }
    return failures / list.length;
  };

  return {
    value: rateFor(withinCurrent),
    previous: rateFor(withinPrevious),
    samples: withinCurrent.length,
  };
}

/**
 * Deploys per day over the window. Null when zero deploys were seen.
 */
export function computeDeployFrequency(
  deploys: Deploy[],
  options: { now?: number; windowMs?: number } = {},
): DoraMetric {
  const now = options.now ?? Date.now();
  const windowMs = options.windowMs ?? 14 * 86_400_000;
  const days = windowMs / 86_400_000;

  const perDay = (list: Deploy[]): number | null => (list.length === 0 ? null : list.length / days);
  const current = deploys.filter((d) => d.firstSeen >= now - windowMs && d.firstSeen <= now);
  const previous = deploys.filter(
    (d) => d.firstSeen >= now - windowMs * 2 && d.firstSeen < now - windowMs,
  );
  return {
    value: perDay(current),
    previous: perDay(previous),
    samples: current.length,
  };
}

/**
 * Median gap between consecutive deploys (ms). Stand-in for Lead Time
 * since the SDK can't see code-commit → production directly.
 */
export function computeLeadTime(
  deploys: Deploy[],
  options: { now?: number; windowMs?: number } = {},
): DoraMetric {
  const now = options.now ?? Date.now();
  const windowMs = options.windowMs ?? 14 * 86_400_000;

  const median = (list: Deploy[]): number | null => {
    if (list.length < 2) return null;
    const gaps: number[] = [];
    for (let i = 1; i < list.length; i++) {
      gaps.push(list[i]!.firstSeen - list[i - 1]!.firstSeen);
    }
    gaps.sort((a, b) => a - b);
    const mid = gaps.length >> 1;
    return gaps.length % 2 === 0 ? (gaps[mid - 1]! + gaps[mid]!) / 2 : gaps[mid]!;
  };
  const current = deploys.filter((d) => d.firstSeen >= now - windowMs && d.firstSeen <= now);
  const previous = deploys.filter(
    (d) => d.firstSeen >= now - windowMs * 2 && d.firstSeen < now - windowMs,
  );
  return {
    value: median(current),
    previous: median(previous),
    samples: current.length,
  };
}

export function trendDirection(metric: DoraMetric, betterWhen: 'lower' | 'higher'): TrendDirection {
  if (metric.value === null || metric.previous === null) return 'flat';
  if (metric.value === metric.previous) return 'flat';
  const improved =
    betterWhen === 'lower' ? metric.value < metric.previous : metric.value > metric.previous;
  return improved ? 'up' : 'down';
}

export function formatMsHuman(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1_000)} s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)} h`;
  return `${(ms / 86_400_000).toFixed(1)} d`;
}

export function formatPerDay(value: number | null): string {
  if (value === null) return '—';
  if (value >= 1) return `${value.toFixed(2)} / day`;
  if (value >= 1 / 7) return `${(value * 7).toFixed(1)} / week`;
  return `${(value * 30).toFixed(1)} / month`;
}

export function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return `${Math.round(value * 100)}%`;
}
