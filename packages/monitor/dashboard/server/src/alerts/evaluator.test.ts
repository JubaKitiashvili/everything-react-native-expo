// Task 117.99 — AlertEvaluator unit tests.

import { afterEach, describe, expect, test } from 'vitest';
import { DashboardStore } from '../storage/sqliteStore.js';
import { AlertEvaluator } from './evaluator.js';
import { AlertDelivery } from './delivery.js';
import type { AlertRuleRecord, EventRecord } from '../storage/types.js';

const NOW = 1_770_000_000_000;

function openStore(): DashboardStore {
  const store = new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true });
  store.upsertSession({
    id: 's1',
    startedAt: NOW,
    eventCount: 0,
    crashCount: 0,
  });
  return store;
}

function ruleFixture(overrides: Partial<AlertRuleRecord> = {}): AlertRuleRecord {
  return {
    id: 'rule-1',
    name: 'Crash spike',
    metric: 'crash_count',
    threshold: 3,
    windowSeconds: 60,
    channels: ['webhook:https://example.com/erne'],
    cooldownSeconds: 60,
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function crashEvent(id: string, ts: number, sessionId = 's1'): EventRecord {
  return {
    id,
    type: 'crash',
    severity: 'critical',
    sessionId,
    fingerprint: 'fp-1',
    timestamp: ts,
    receivedAt: ts,
    payload: { message: `boom ${id}` },
  };
}

function infoEvent(id: string, ts: number, sessionId = 's1'): EventRecord {
  return {
    id,
    type: 'breadcrumb',
    severity: 'info',
    sessionId,
    timestamp: ts,
    receivedAt: ts,
    payload: { msg: 'hi' },
  };
}

interface CapturedDelivery {
  ruleId: string;
  metricValue: number;
  test: boolean;
}

class CapturingDelivery extends AlertDelivery {
  public calls: CapturedDelivery[] = [];
  override async deliverAll(
    rule: AlertRuleRecord,
    firing: { metricValue: number },
    options: { test?: boolean } = {},
  ): Promise<never[]> {
    this.calls.push({
      ruleId: rule.id,
      metricValue: firing.metricValue,
      test: options.test ?? false,
    });
    return [];
  }
}

describe('AlertEvaluator — windowing + threshold', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  test('fires when threshold reached inside window, persists firing, resets window', async () => {
    store = openStore();
    store.saveAlertRule(ruleFixture());
    const delivery = new CapturingDelivery();
    const evaluator = new AlertEvaluator({ store, delivery, now: () => NOW });

    await evaluator.onEvent(crashEvent('e1', NOW));
    await evaluator.onEvent(crashEvent('e2', NOW));
    await evaluator.onEvent(crashEvent('e3', NOW));
    expect(delivery.calls).toHaveLength(1);
    expect(delivery.calls[0]?.metricValue).toBe(3);

    const fired = store.listAlertHistory();
    expect(fired).toHaveLength(1);
    expect(fired[0]?.ruleId).toBe('rule-1');
    expect(fired[0]?.severity).toBe('critical');
  });

  test('events outside the window do not contribute to the count', async () => {
    store = openStore();
    store.saveAlertRule(ruleFixture({ windowSeconds: 10 }));
    const delivery = new CapturingDelivery();
    let now = NOW;
    const evaluator = new AlertEvaluator({ store, delivery, now: () => now });

    await evaluator.onEvent(crashEvent('e1', now));
    now += 11_000;
    await evaluator.onEvent(crashEvent('e2', now));
    await evaluator.onEvent(crashEvent('e3', now));
    expect(delivery.calls).toHaveLength(0);
  });

  test('cooldown blocks a re-fire while active', async () => {
    store = openStore();
    store.saveAlertRule(ruleFixture({ cooldownSeconds: 30, windowSeconds: 60, threshold: 2 }));
    const delivery = new CapturingDelivery();
    let now = NOW;
    const evaluator = new AlertEvaluator({ store, delivery, now: () => now });

    await evaluator.onEvent(crashEvent('e1', now));
    await evaluator.onEvent(crashEvent('e2', now));
    expect(delivery.calls).toHaveLength(1);

    // Two more events within cooldown — should not refire.
    now += 1_000;
    await evaluator.onEvent(crashEvent('e3', now));
    await evaluator.onEvent(crashEvent('e4', now));
    expect(delivery.calls).toHaveLength(1);

    // After cooldown elapses + new threshold-crossing burst, fires again.
    now += 60_000;
    await evaluator.onEvent(crashEvent('e5', now));
    await evaluator.onEvent(crashEvent('e6', now));
    expect(delivery.calls).toHaveLength(2);
  });

  test('disabled rules are ignored', async () => {
    store = openStore();
    store.saveAlertRule(ruleFixture({ enabled: false, threshold: 1 }));
    const delivery = new CapturingDelivery();
    const evaluator = new AlertEvaluator({ store, delivery, now: () => NOW });
    await evaluator.onEvent(crashEvent('e1', NOW));
    expect(delivery.calls).toHaveLength(0);
  });

  test('non-matching event types do not fire crash_count rules', async () => {
    store = openStore();
    store.saveAlertRule(ruleFixture({ threshold: 1 }));
    const delivery = new CapturingDelivery();
    const evaluator = new AlertEvaluator({ store, delivery, now: () => NOW });
    await evaluator.onEvent(infoEvent('e1', NOW));
    expect(delivery.calls).toHaveLength(0);
  });

  test('error_event_count fires on critical-severity events of any type', async () => {
    store = openStore();
    store.saveAlertRule(
      ruleFixture({ id: 'rule-err', metric: 'error_event_count', threshold: 2 }),
    );
    const delivery = new CapturingDelivery();
    const evaluator = new AlertEvaluator({ store, delivery, now: () => NOW });
    await evaluator.onEvent(crashEvent('c1', NOW));
    await evaluator.onEvent({
      id: 'n1',
      type: 'native_anr',
      severity: 'critical',
      sessionId: 's1',
      timestamp: NOW,
      receivedAt: NOW,
      payload: {},
    });
    expect(delivery.calls).toHaveLength(1);
    expect(delivery.calls[0]?.ruleId).toBe('rule-err');
  });

  test('event_count matches every event', async () => {
    store = openStore();
    store.saveAlertRule(
      ruleFixture({ id: 'rule-any', metric: 'event_count', threshold: 2, channels: [] }),
    );
    const delivery = new CapturingDelivery();
    const evaluator = new AlertEvaluator({ store, delivery, now: () => NOW });
    await evaluator.onEvent(crashEvent('c1', NOW));
    await evaluator.onEvent(infoEvent('i1', NOW));
    expect(delivery.calls).toHaveLength(1);
  });

  test('unknown metric never fires', async () => {
    store = openStore();
    store.saveAlertRule(ruleFixture({ metric: 'unknown_metric', threshold: 1 }));
    const delivery = new CapturingDelivery();
    const evaluator = new AlertEvaluator({ store, delivery, now: () => NOW });
    await evaluator.onEvent(crashEvent('e1', NOW));
    expect(delivery.calls).toHaveLength(0);
  });
});

describe('AlertEvaluator — reloadRules', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  test('picks up newly added rules without restart', async () => {
    store = openStore();
    const delivery = new CapturingDelivery();
    const evaluator = new AlertEvaluator({ store, delivery, now: () => NOW });
    await evaluator.onEvent(crashEvent('e1', NOW));
    expect(delivery.calls).toHaveLength(0);

    store.saveAlertRule(ruleFixture({ threshold: 1 }));
    evaluator.reloadRules();
    await evaluator.onEvent(crashEvent('e2', NOW));
    expect(delivery.calls).toHaveLength(1);
  });

  test('drops state for deleted rules', async () => {
    store = openStore();
    store.saveAlertRule(ruleFixture({ threshold: 5 }));
    const delivery = new CapturingDelivery();
    const evaluator = new AlertEvaluator({ store, delivery, now: () => NOW });
    expect(evaluator.ruleCount).toBe(1);

    store.deleteAlertRule('rule-1');
    evaluator.reloadRules();
    expect(evaluator.ruleCount).toBe(0);
    await evaluator.onEvent(crashEvent('e1', NOW));
    expect(delivery.calls).toHaveLength(0);
  });

  test('preserves window state across an unrelated reload', async () => {
    store = openStore();
    store.saveAlertRule(ruleFixture({ threshold: 3 }));
    const delivery = new CapturingDelivery();
    const evaluator = new AlertEvaluator({ store, delivery, now: () => NOW });
    await evaluator.onEvent(crashEvent('e1', NOW));
    await evaluator.onEvent(crashEvent('e2', NOW));
    // No fire yet (1 short of threshold). Reload should preserve count.
    evaluator.reloadRules();
    await evaluator.onEvent(crashEvent('e3', NOW));
    expect(delivery.calls).toHaveLength(1);
  });
});

describe('AlertEvaluator — testFire', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  test('persists a marker firing and dispatches with test=true', async () => {
    store = openStore();
    store.saveAlertRule(ruleFixture());
    const delivery = new CapturingDelivery();
    const evaluator = new AlertEvaluator({ store, delivery, now: () => NOW });
    const result = await evaluator.testFire('rule-1');
    expect(result).not.toBeNull();
    expect(result?.firing.metricValue).toBe(0);
    expect(result?.firing.payload).toEqual({ test: true, message: 'Test fire from dashboard' });
    expect(delivery.calls).toHaveLength(1);
    expect(delivery.calls[0]?.test).toBe(true);
    const fired = store.listAlertHistory();
    expect(fired).toHaveLength(1);
  });

  test('returns null when ruleId is unknown', async () => {
    store = openStore();
    const delivery = new CapturingDelivery();
    const evaluator = new AlertEvaluator({ store, delivery, now: () => NOW });
    const result = await evaluator.testFire('does-not-exist');
    expect(result).toBeNull();
    expect(delivery.calls).toHaveLength(0);
  });
});

describe('AlertEvaluator — error isolation', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  test('a delivery throw is caught and surfaced via onError without breaking ingest', async () => {
    store = openStore();
    store.saveAlertRule(ruleFixture({ threshold: 1 }));
    class ThrowingDelivery extends AlertDelivery {
      override async deliverAll(): Promise<never[]> {
        throw new Error('webhook borked');
      }
    }
    const delivery = new ThrowingDelivery({ sleep: async () => {}, onError: () => {} });
    const errors: { rule?: string; message: string }[] = [];
    const evaluator = new AlertEvaluator({
      store,
      delivery,
      now: () => NOW,
      onError: (err, ctx) => errors.push({ rule: ctx.rule, message: err.message }),
    });
    await evaluator.onEvent(crashEvent('e1', NOW));
    expect(errors).toHaveLength(1);
    expect(errors[0]?.rule).toBe('rule-1');
    // Firing still persisted — the alert occurred even if the delivery
    // didn't reach Slack.
    expect(store.listAlertHistory()).toHaveLength(1);
  });
});

