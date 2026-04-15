import {
  calculateMTTR,
  calculateChangeFailureRate,
  calculateDeploymentFrequency,
  calculateLeadTime,
  DORAMetricsService,
  type CrashResolutionRow,
  type DeploymentRow,
  type LeadTimeRow,
  type DORAQueryProvider,
} from './dora';

// ────────────────────────────────────────────────────────────
// Individual calculation tests
// ────────────────────────────────────────────────────────────

describe('calculateMTTR', () => {
  test('returns 0 for empty input', () => {
    expect(calculateMTTR([])).toBe(0);
  });

  test('returns 0 when no crashes are resolved', () => {
    const rows: CrashResolutionRow[] = [
      { fingerprint: 'a', first_seen: '2026-01-01T00:00:00Z', resolved_at: null },
    ];
    expect(calculateMTTR(rows)).toBe(0);
  });

  test('calculates average resolution time in minutes', () => {
    const rows: CrashResolutionRow[] = [
      {
        fingerprint: 'a',
        first_seen: '2026-01-01T00:00:00Z',
        resolved_at: '2026-01-01T01:00:00Z', // 60 min
      },
      {
        fingerprint: 'b',
        first_seen: '2026-01-01T00:00:00Z',
        resolved_at: '2026-01-01T02:00:00Z', // 120 min
      },
    ];
    expect(calculateMTTR(rows)).toBe(90); // avg of 60 and 120
  });

  test('ignores unresolved crashes in average', () => {
    const rows: CrashResolutionRow[] = [
      {
        fingerprint: 'a',
        first_seen: '2026-01-01T00:00:00Z',
        resolved_at: '2026-01-01T01:00:00Z',
      },
      {
        fingerprint: 'b',
        first_seen: '2026-01-01T00:00:00Z',
        resolved_at: null,
      },
    ];
    expect(calculateMTTR(rows)).toBe(60);
  });
});

describe('calculateChangeFailureRate', () => {
  test('returns 0 for empty input', () => {
    expect(calculateChangeFailureRate([])).toBe(0);
  });

  test('calculates ratio of deployments with new fingerprints', () => {
    const rows: DeploymentRow[] = [
      { version: '1.0', deployed_at: '2026-01-01', has_new_fingerprints: true },
      { version: '1.1', deployed_at: '2026-01-02', has_new_fingerprints: false },
      { version: '1.2', deployed_at: '2026-01-03', has_new_fingerprints: false },
      { version: '1.3', deployed_at: '2026-01-04', has_new_fingerprints: true },
    ];
    expect(calculateChangeFailureRate(rows)).toBe(0.5);
  });

  test('returns 1 when all deployments fail', () => {
    const rows: DeploymentRow[] = [
      { version: '1.0', deployed_at: '2026-01-01', has_new_fingerprints: true },
    ];
    expect(calculateChangeFailureRate(rows)).toBe(1);
  });

  test('returns 0 when no deployments fail', () => {
    const rows: DeploymentRow[] = [
      { version: '1.0', deployed_at: '2026-01-01', has_new_fingerprints: false },
      { version: '1.1', deployed_at: '2026-01-02', has_new_fingerprints: false },
    ];
    expect(calculateChangeFailureRate(rows)).toBe(0);
  });
});

describe('calculateDeploymentFrequency', () => {
  test('returns deployments per week', () => {
    const rows: DeploymentRow[] = [
      { version: '1.0', deployed_at: '2026-01-01', has_new_fingerprints: false },
      { version: '1.1', deployed_at: '2026-01-03', has_new_fingerprints: false },
      { version: '1.2', deployed_at: '2026-01-05', has_new_fingerprints: false },
      { version: '1.3', deployed_at: '2026-01-07', has_new_fingerprints: false },
    ];
    const start = new Date('2026-01-01');
    const end = new Date('2026-01-08'); // 1 week
    expect(calculateDeploymentFrequency(rows, start, end)).toBe(4);
  });

  test('returns fraction for fewer deploys', () => {
    const rows: DeploymentRow[] = [
      { version: '1.0', deployed_at: '2026-01-01', has_new_fingerprints: false },
    ];
    const start = new Date('2026-01-01');
    const end = new Date('2026-01-15'); // 2 weeks
    expect(calculateDeploymentFrequency(rows, start, end)).toBe(0.5);
  });
});

describe('calculateLeadTime', () => {
  test('returns 0 for empty input', () => {
    expect(calculateLeadTime([])).toBe(0);
  });

  test('calculates average commit-to-deploy time', () => {
    const rows: LeadTimeRow[] = [
      {
        version: '1.0',
        commit_time: '2026-01-01T00:00:00Z',
        deployed_at: '2026-01-01T06:00:00Z', // 360 min
      },
      {
        version: '1.1',
        commit_time: '2026-01-02T00:00:00Z',
        deployed_at: '2026-01-02T02:00:00Z', // 120 min
      },
    ];
    expect(calculateLeadTime(rows)).toBe(240); // avg of 360 and 120
  });
});

// ────────────────────────────────────────────────────────────
// DORAMetricsService tests
// ────────────────────────────────────────────────────────────

describe('DORAMetricsService', () => {
  function createFakeProvider(
    data?: Partial<{
      crashes: CrashResolutionRow[];
      deployments: DeploymentRow[];
      leadTimes: LeadTimeRow[];
    }>,
  ): DORAQueryProvider {
    return {
      async getCrashResolutions(): Promise<readonly CrashResolutionRow[]> {
        return data?.crashes ?? [];
      },
      async getDeployments(): Promise<readonly DeploymentRow[]> {
        return data?.deployments ?? [];
      },
      async getLeadTimes(): Promise<readonly LeadTimeRow[]> {
        return data?.leadTimes ?? [];
      },
    };
  }

  test('calculate returns all four metrics', async () => {
    const provider = createFakeProvider({
      crashes: [
        { fingerprint: 'a', first_seen: '2026-01-01T00:00:00Z', resolved_at: '2026-01-01T01:00:00Z' },
      ],
      deployments: [
        { version: '1.0', deployed_at: '2026-01-01', has_new_fingerprints: false },
        { version: '1.1', deployed_at: '2026-01-04', has_new_fingerprints: true },
      ],
      leadTimes: [
        { version: '1.0', commit_time: '2026-01-01T00:00:00Z', deployed_at: '2026-01-01T03:00:00Z' },
      ],
    });

    const service = new DORAMetricsService(provider);
    const start = new Date('2026-01-01');
    const end = new Date('2026-01-08');
    const result = await service.calculate('app_1', start, end);

    expect(result.mttrMinutes).toBe(60);
    expect(result.changeFailureRate).toBe(0.5);
    expect(result.deploymentFrequency).toBe(2);
    expect(result.leadTimeMinutes).toBe(180);
    expect(result.period.start).toBe(start.toISOString());
    expect(result.period.end).toBe(end.toISOString());
  });

  test('trend returns data points for multiple periods', async () => {
    const provider = createFakeProvider();
    const service = new DORAMetricsService(provider);

    const periods = [
      { start: new Date('2026-01-01'), end: new Date('2026-01-08') },
      { start: new Date('2026-01-08'), end: new Date('2026-01-15') },
    ];

    const result = await service.trend('app_1', periods);
    expect(result).toHaveLength(2);
    expect(result[0]!.period).toBe(periods[0]!.start.toISOString());
    expect(result[1]!.period).toBe(periods[1]!.start.toISOString());
  });

  test('exportJSON returns valid JSON', async () => {
    const provider = createFakeProvider();
    const service = new DORAMetricsService(provider);

    const json = await service.exportJSON('app_1', new Date('2026-01-01'), new Date('2026-01-08'));
    const parsed = JSON.parse(json);
    expect(parsed).toHaveProperty('mttrMinutes');
    expect(parsed).toHaveProperty('changeFailureRate');
    expect(parsed).toHaveProperty('deploymentFrequency');
    expect(parsed).toHaveProperty('leadTimeMinutes');
    expect(parsed).toHaveProperty('period');
  });

  test('handles empty data gracefully', async () => {
    const provider = createFakeProvider();
    const service = new DORAMetricsService(provider);

    const result = await service.calculate('app_1', new Date('2026-01-01'), new Date('2026-01-08'));
    expect(result.mttrMinutes).toBe(0);
    expect(result.changeFailureRate).toBe(0);
    expect(result.deploymentFrequency).toBe(0);
    expect(result.leadTimeMinutes).toBe(0);
  });
});
