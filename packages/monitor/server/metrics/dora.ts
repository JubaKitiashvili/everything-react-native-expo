/**
 * Task 67 — MTTR/DORA Metrics
 *
 * Calculates: MTTR (first crash -> resolution), Change Failure Rate
 * (versions with new fingerprints), Deployment Frequency, Lead Time.
 * Trend over weeks/months. Export as JSON.
 */

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface DORAMetrics {
  readonly mttrMinutes: number;
  readonly changeFailureRate: number; // 0-1
  readonly deploymentFrequency: number; // deploys per week
  readonly leadTimeMinutes: number;
  readonly period: {
    readonly start: string; // ISO date
    readonly end: string;
  };
}

export interface DORADataPoint {
  readonly period: string; // ISO date of week/month start
  readonly metrics: DORAMetrics;
}

export interface CrashResolutionRow {
  readonly fingerprint: string;
  readonly first_seen: string;
  readonly resolved_at: string | null;
}

export interface DeploymentRow {
  readonly version: string;
  readonly deployed_at: string;
  readonly has_new_fingerprints: boolean;
}

export interface LeadTimeRow {
  readonly version: string;
  readonly commit_time: string;
  readonly deployed_at: string;
}

/** Injectable query interface for ClickHouse or Postgres results. */
export interface DORAQueryProvider {
  getCrashResolutions(appId: string, start: Date, end: Date): Promise<readonly CrashResolutionRow[]>;
  getDeployments(appId: string, start: Date, end: Date): Promise<readonly DeploymentRow[]>;
  getLeadTimes(appId: string, start: Date, end: Date): Promise<readonly LeadTimeRow[]>;
}

// ────────────────────────────────────────────────────────────
// Calculations
// ────────────────────────────────────────────────────────────

function minutesBetween(a: string, b: string): number {
  const diff = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(0, diff / 60_000);
}

function weeksBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, ms / (7 * 24 * 60 * 60 * 1000));
}

export function calculateMTTR(rows: readonly CrashResolutionRow[]): number {
  const resolved = rows.filter((r) => r.resolved_at !== null);
  if (resolved.length === 0) return 0;

  const total = resolved.reduce(
    (sum, r) => sum + minutesBetween(r.first_seen, r.resolved_at!),
    0,
  );
  return total / resolved.length;
}

export function calculateChangeFailureRate(rows: readonly DeploymentRow[]): number {
  if (rows.length === 0) return 0;
  const failures = rows.filter((r) => r.has_new_fingerprints).length;
  return failures / rows.length;
}

export function calculateDeploymentFrequency(
  rows: readonly DeploymentRow[],
  start: Date,
  end: Date,
): number {
  const weeks = weeksBetween(start, end);
  return rows.length / weeks;
}

export function calculateLeadTime(rows: readonly LeadTimeRow[]): number {
  if (rows.length === 0) return 0;
  const total = rows.reduce(
    (sum, r) => sum + minutesBetween(r.commit_time, r.deployed_at),
    0,
  );
  return total / rows.length;
}

// ────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────

export class DORAMetricsService {
  constructor(private readonly provider: DORAQueryProvider) {}

  async calculate(appId: string, start: Date, end: Date): Promise<DORAMetrics> {
    const [crashes, deployments, leadTimes] = await Promise.all([
      this.provider.getCrashResolutions(appId, start, end),
      this.provider.getDeployments(appId, start, end),
      this.provider.getLeadTimes(appId, start, end),
    ]);

    return {
      mttrMinutes: calculateMTTR(crashes),
      changeFailureRate: calculateChangeFailureRate(deployments),
      deploymentFrequency: calculateDeploymentFrequency(deployments, start, end),
      leadTimeMinutes: calculateLeadTime(leadTimes),
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
    };
  }

  async trend(
    appId: string,
    periods: readonly { start: Date; end: Date }[],
  ): Promise<readonly DORADataPoint[]> {
    const results: DORADataPoint[] = [];
    for (const period of periods) {
      const metrics = await this.calculate(appId, period.start, period.end);
      results.push({
        period: period.start.toISOString(),
        metrics,
      });
    }
    return results;
  }

  /** Export as JSON string. */
  async exportJSON(appId: string, start: Date, end: Date): Promise<string> {
    const metrics = await this.calculate(appId, start, end);
    return JSON.stringify(metrics, null, 2);
  }
}
