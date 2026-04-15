/**
 * Tests for alert evaluator and alerting engine.
 */

import { evaluate, type EvaluationInput } from './evaluator';
import { createAlertEngine, type MetricProvider, type ChannelRegistry, type MetricValue } from './engine';
import type { AlertRule, DatabaseClient } from '../db/schema';
import type { NotificationChannel, AlertNotification } from './channels/slack';

// ────────────────────────────────────────────────────────────
// Evaluator tests
// ────────────────────────────────────────────────────────────

describe('evaluate', () => {
  const baseRule: AlertRule = {
    id: 'rule_1',
    appId: 'app_1',
    metric: 'crash_count',
    operator: '>',
    threshold: 10,
    windowSeconds: 3600,
    channel: 'slack',
    enabled: true,
    cooldownSeconds: 300,
    createdAt: new Date(),
  };

  test('fires when current > threshold', () => {
    const result = evaluate({ rule: baseRule, currentValue: 15 });
    expect(result.shouldFire).toBe(true);
    expect(result.reason).toContain('15 > 10');
  });

  test('does not fire when current <= threshold', () => {
    const result = evaluate({ rule: baseRule, currentValue: 5 });
    expect(result.shouldFire).toBe(false);
  });

  test('handles < operator', () => {
    const rule = { ...baseRule, operator: '<' as const, threshold: 30 };
    expect(evaluate({ rule, currentValue: 20 }).shouldFire).toBe(true);
    expect(evaluate({ rule, currentValue: 40 }).shouldFire).toBe(false);
  });

  test('handles >= operator', () => {
    const rule = { ...baseRule, operator: '>=' as const, threshold: 10 };
    expect(evaluate({ rule, currentValue: 10 }).shouldFire).toBe(true);
    expect(evaluate({ rule, currentValue: 9 }).shouldFire).toBe(false);
  });

  test('handles <= operator', () => {
    const rule = { ...baseRule, operator: '<=' as const, threshold: 10 };
    expect(evaluate({ rule, currentValue: 10 }).shouldFire).toBe(true);
    expect(evaluate({ rule, currentValue: 11 }).shouldFire).toBe(false);
  });

  test('handles == operator', () => {
    const rule = { ...baseRule, operator: '==' as const, threshold: 42 };
    expect(evaluate({ rule, currentValue: 42 }).shouldFire).toBe(true);
    expect(evaluate({ rule, currentValue: 43 }).shouldFire).toBe(false);
  });

  test('handles change_pct operator', () => {
    const rule = { ...baseRule, operator: 'change_pct' as const, threshold: 50 };

    // 100 → 200 = 100% change, fires at 50% threshold
    const result = evaluate({ rule, currentValue: 200, previousValue: 100 });
    expect(result.shouldFire).toBe(true);

    // 100 → 110 = 10% change, does not fire at 50% threshold
    const result2 = evaluate({ rule, currentValue: 110, previousValue: 100 });
    expect(result2.shouldFire).toBe(false);
  });

  test('change_pct does not fire without previous value', () => {
    const rule = { ...baseRule, operator: 'change_pct' as const, threshold: 50 };
    const result = evaluate({ rule, currentValue: 200 });
    expect(result.shouldFire).toBe(false);
  });

  test('change_pct does not fire with zero previous value', () => {
    const rule = { ...baseRule, operator: 'change_pct' as const, threshold: 50 };
    const result = evaluate({ rule, currentValue: 200, previousValue: 0 });
    expect(result.shouldFire).toBe(false);
  });

  test('does not fire when rule is disabled', () => {
    const rule = { ...baseRule, enabled: false };
    const result = evaluate({ rule, currentValue: 999 });
    expect(result.shouldFire).toBe(false);
    expect(result.reason).toContain('disabled');
  });
});

// ────────────────────────────────────────────────────────────
// Engine tests
// ────────────────────────────────────────────────────────────

describe('AlertEngine', () => {
  // Fake database
  const createFakeDb = (rules: Record<string, unknown>[], alertHistory: Record<string, unknown>[] = []): DatabaseClient => {
    const history = [...alertHistory];

    return {
      query: async <T>(sql: string, _params?: readonly unknown[]): Promise<readonly T[]> => {
        if (sql.includes('alert_rules')) {
          return rules as unknown as readonly T[];
        }
        if (sql.includes('alert_history') && sql.includes('resolved_at IS NULL')) {
          return history.filter((h) => !(h as Record<string, unknown>)['resolved_at']) as unknown as readonly T[];
        }
        if (sql.includes('alert_history')) {
          return [] as unknown as readonly T[];
        }
        return [] as unknown as readonly T[];
      },
      execute: async (sql: string, params?: readonly unknown[]) => {
        if (sql.includes('INSERT INTO alert_history')) {
          history.push({
            id: `ah_${history.length}`,
            rule_id: params?.[0],
            triggered_at: params?.[1],
            payload_json: params?.[2],
          });
        }
        if (sql.includes('UPDATE alert_history SET resolved_at')) {
          const item = history.find((h) => (h as Record<string, unknown>)['id'] === params?.[1]);
          if (item) {
            (item as Record<string, unknown>)['resolved_at'] = params?.[0];
          }
        }
        return { rowCount: 1 };
      },
      transaction: async <T>(fn: (c: DatabaseClient) => Promise<T>) => {
        const self: DatabaseClient = {
          query: async <U>(): Promise<readonly U[]> => [],
          execute: async () => ({ rowCount: 0 }),
          transaction: async <U>(inner: (c: DatabaseClient) => Promise<U>) => inner(self),
        };
        return fn(self);
      },
    };
  };

  const createFakeMetricProvider = (values: Record<string, MetricValue>): MetricProvider => ({
    getMetricValue: async (_appId: string, metric: string) => values[metric] ?? null,
  });

  const createFakeChannels = (): ChannelRegistry & { sent: AlertNotification[] } => {
    const sent: AlertNotification[] = [];
    const channel: NotificationChannel = {
      send: async (notification) => {
        sent.push(notification);
        return { success: true };
      },
    };
    return {
      sent,
      get: (name: string) => (name === 'slack' ? channel : undefined),
    };
  };

  const ruleRow = {
    id: 'rule_1',
    app_id: 'app_1',
    metric: 'crash_count',
    operator: '>',
    threshold: 10,
    window_seconds: 3600,
    channel: 'slack',
    enabled: true,
    cooldown_seconds: 300,
    created_at: new Date().toISOString(),
  };

  test('fires alert when threshold exceeded', async () => {
    const channels = createFakeChannels();
    const engine = createAlertEngine({
      db: createFakeDb([ruleRow]),
      metricProvider: createFakeMetricProvider({ crash_count: { current: 15 } }),
      channels,
    });

    const results = await engine.evaluateApp('app_1');

    expect(results).toHaveLength(1);
    expect(results[0]!.fired).toBe(true);
    expect(results[0]!.notificationSent).toBe(true);
    expect(channels.sent).toHaveLength(1);
  });

  test('does not fire when threshold not exceeded', async () => {
    const channels = createFakeChannels();
    const engine = createAlertEngine({
      db: createFakeDb([ruleRow]),
      metricProvider: createFakeMetricProvider({ crash_count: { current: 5 } }),
      channels,
    });

    const results = await engine.evaluateApp('app_1');

    expect(results[0]!.fired).toBe(false);
    expect(results[0]!.notificationSent).toBe(false);
    expect(channels.sent).toHaveLength(0);
  });

  test('skips notification when no metric data', async () => {
    const engine = createAlertEngine({
      db: createFakeDb([ruleRow]),
      metricProvider: createFakeMetricProvider({}),
      channels: createFakeChannels(),
    });

    const results = await engine.evaluateApp('app_1');

    expect(results[0]!.fired).toBe(false);
    expect(results[0]!.reason).toContain('No metric data');
  });

  test('reports error when channel not found', async () => {
    const engine = createAlertEngine({
      db: createFakeDb([{ ...ruleRow, channel: 'nonexistent' }]),
      metricProvider: createFakeMetricProvider({ crash_count: { current: 15 } }),
      channels: createFakeChannels(), // only has 'slack'
    });

    const results = await engine.evaluateApp('app_1');

    expect(results[0]!.fired).toBe(true);
    expect(results[0]!.notificationSent).toBe(false);
    expect(results[0]!.error).toContain('not registered');
  });

  test('handles multiple rules', async () => {
    const rules = [
      ruleRow,
      {
        ...ruleRow,
        id: 'rule_2',
        metric: 'error_rate',
        threshold: 0.05,
      },
    ];

    const engine = createAlertEngine({
      db: createFakeDb(rules),
      metricProvider: createFakeMetricProvider({
        crash_count: { current: 15 },
        error_rate: { current: 0.01 },
      }),
      channels: createFakeChannels(),
    });

    const results = await engine.evaluateApp('app_1');

    expect(results).toHaveLength(2);
    expect(results[0]!.fired).toBe(true);
    expect(results[1]!.fired).toBe(false);
  });

  test('auto-resolves alerts when condition no longer met', async () => {
    const unresolvedAlert = {
      id: 'ah_1',
      rule_id: 'rule_1',
      triggered_at: new Date().toISOString(),
      resolved_at: null,
      metric: 'crash_count',
      operator: '>',
      threshold: 10,
      window_seconds: 3600,
    };

    const engine = createAlertEngine({
      db: createFakeDb([ruleRow], [unresolvedAlert]),
      metricProvider: createFakeMetricProvider({ crash_count: { current: 3 } }),
      channels: createFakeChannels(),
    });

    const resolved = await engine.autoResolve('app_1');
    expect(resolved).toBe(1);
  });

  test('does not auto-resolve when condition still met', async () => {
    const unresolvedAlert = {
      id: 'ah_1',
      rule_id: 'rule_1',
      triggered_at: new Date().toISOString(),
      resolved_at: null,
      metric: 'crash_count',
      operator: '>',
      threshold: 10,
      window_seconds: 3600,
    };

    const engine = createAlertEngine({
      db: createFakeDb([ruleRow], [unresolvedAlert]),
      metricProvider: createFakeMetricProvider({ crash_count: { current: 15 } }),
      channels: createFakeChannels(),
    });

    const resolved = await engine.autoResolve('app_1');
    expect(resolved).toBe(0);
  });
});
