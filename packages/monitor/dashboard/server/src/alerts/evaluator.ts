// Task 117.99 — alert evaluator.
//
// Inserted between the ingest pipeline and the dashboard storage layer.
// Every persisted event is fed through `onEvent`. For each enabled rule
// whose metric matches the event, the evaluator pushes the timestamp
// onto a per-rule rolling window, prunes anything older than
// `windowSeconds`, and fires when the window count crosses the
// threshold AND the cooldown has elapsed.
//
// Design choices:
//   - Per-rule timestamps are stored in plain arrays. A rule that never
//     fires accumulates at most `windowSeconds * eventsPerSecond`
//     entries; pruning on every push keeps it bounded. The hot path is
//     a single `push + shift` once entries age out.
//   - Firing happens synchronously inside `onEvent` so the alert
//     persists in the same tick as the underlying event. Delivery is
//     awaited too — the WS handler awaits `onEvent`, which means slow
//     webhooks can backpressure ingest. We accept that: the queue
//     (Task 117.5) already absorbs short bursts, and a webhook latency
//     of >1s is itself an alert-worthy condition.
//   - `reloadRules()` is called by the REST layer whenever an operator
//     mutates the rule list. Per-rule state for vanished rules is
//     dropped; per-rule state for new rules starts empty.
//   - `testFire(ruleId)` builds a synthetic firing with `metricValue=0`
//     and a `test: true` flag the transports use to render a "[TEST]"
//     prefix. The firing IS persisted to alert_history so the operator
//     can confirm the round-trip end-to-end.

import { randomUUID } from 'node:crypto';
import type {
  AlertFiringRecord,
  AlertRuleRecord,
  EventRecord,
  Severity,
} from '../storage/types.js';
import type { IMonitorStore } from '../storage/IMonitorStore.js';
import type { AlertDelivery } from './delivery.js';
import {
  severityForMetric,
  type AlertDeliveryResult,
  type AlertMetric,
} from './types.js';

export interface AlertEvaluatorOptions {
  store: IMonitorStore;
  delivery: AlertDelivery;
  /** Clock injection for deterministic tests. Defaults to `Date.now`. */
  now?: () => number;
  /**
   * Hard cap on per-rule timestamp buffer. A rule with a 1h window and
   * 1k events/s would otherwise allocate ~3.6M entries — still tiny by
   * Node standards, but capping forces an obvious failure mode for an
   * obviously-misconfigured rule (impossible threshold + huge window).
   * Default 100_000.
   */
  maxTimestampsPerRule?: number;
  /**
   * Logger hook for delivery + evaluator failures. Defaults to a quiet
   * console.error so production never grows a stderr ringbuffer that
   * starves on a misconfigured webhook.
   */
  onError?: (err: Error, context: { rule?: string }) => void;
}

interface RuleState {
  rule: AlertRuleRecord;
  timestamps: number[];
  lastFiredAt: number;
}

/**
 * Result returned by `testFire(...)` — exposed via REST so the
 * dashboard's "Test fire" button can show per-channel delivery status
 * inline instead of sending the operator on a Slack/Discord scavenger
 * hunt.
 */
export interface TestFireResult {
  firing: AlertFiringRecord;
  results: AlertDeliveryResult[];
}

const DEFAULT_MAX_TIMESTAMPS = 100_000;

export class AlertEvaluator {
  private readonly store: IMonitorStore;
  private readonly delivery: AlertDelivery;
  private readonly now: () => number;
  private readonly maxTimestampsPerRule: number;
  private readonly onError: (err: Error, context: { rule?: string }) => void;

  private rules = new Map<string, RuleState>();

  constructor(options: AlertEvaluatorOptions) {
    this.store = options.store;
    this.delivery = options.delivery;
    this.now = options.now ?? Date.now;
    this.maxTimestampsPerRule = options.maxTimestampsPerRule ?? DEFAULT_MAX_TIMESTAMPS;
    this.onError =
      options.onError ??
      ((err, ctx) => {
        console.error(
          `[dashboard-server:alert-evaluator]${ctx.rule ? ` rule=${ctx.rule}` : ''} ${err.message}`,
        );
      });
    this.reloadRules();
  }

  /**
   * Refresh the in-memory rule snapshot from the store. Called by the
   * REST layer after every rule mutation. Cheap (a few dozen rows in
   * the realistic case); we don't bother with delta merging.
   */
  reloadRules(): void {
    const next = new Map<string, RuleState>();
    for (const rule of this.store.listAlertRules()) {
      const previous = this.rules.get(rule.id);
      next.set(rule.id, {
        rule,
        timestamps: previous?.timestamps ?? [],
        lastFiredAt: previous?.lastFiredAt ?? 0,
      });
    }
    this.rules = next;
  }

  /** Snapshot of the current in-memory rules — exposed for tests. */
  get ruleCount(): number {
    return this.rules.size;
  }

  /**
   * Hot path. Called for every persisted event from the ingest queue.
   * Synchronous push + prune; async firing only when a rule actually
   * crosses its threshold AND its cooldown has elapsed.
   */
  async onEvent(event: EventRecord): Promise<void> {
    const fireQueue: RuleState[] = [];
    const now = this.now();
    for (const state of this.rules.values()) {
      const { rule } = state;
      if (!rule.enabled) continue;
      if (!eventMatchesMetric(event, rule.metric)) continue;
      const windowMs = rule.windowSeconds * 1_000;
      // Push, prune, and only mark for firing if we cross the threshold.
      state.timestamps.push(event.timestamp);
      const cutoff = now - windowMs;
      while (state.timestamps.length > 0 && state.timestamps[0]! < cutoff) {
        state.timestamps.shift();
      }
      if (state.timestamps.length > this.maxTimestampsPerRule) {
        state.timestamps.splice(0, state.timestamps.length - this.maxTimestampsPerRule);
      }
      const cooldownMs = rule.cooldownSeconds * 1_000;
      const cooldownActive = state.lastFiredAt > 0 && now - state.lastFiredAt < cooldownMs;
      if (state.timestamps.length >= rule.threshold && !cooldownActive) {
        fireQueue.push(state);
      }
    }
    for (const state of fireQueue) {
      try {
        await this.fire(state, state.timestamps.length, now);
      } catch (err) {
        this.onError(err instanceof Error ? err : new Error(String(err)), { rule: state.rule.id });
      }
    }
  }

  /**
   * Manual fire — used by `POST /api/alert-rules/:id/test-fire` and by
   * the dashboard's "Test fire" button. Persists a firing tagged with
   * `payload.test = true` and dispatches via every configured channel.
   */
  async testFire(ruleId: string): Promise<TestFireResult | null> {
    const state = this.rules.get(ruleId);
    if (!state) return null;
    const firing: AlertFiringRecord = {
      id: `fire_${randomUUID()}`,
      ruleId,
      firedAt: this.now(),
      metricValue: 0,
      severity: severityForMetric(state.rule.metric as AlertMetric),
      payload: { test: true, message: 'Test fire from dashboard' },
    };
    this.store.insertAlertFiring(firing);
    const results = await this.delivery.deliverAll(state.rule, firing, { test: true });
    return { firing, results };
  }

  private async fire(state: RuleState, metricValue: number, now: number): Promise<void> {
    const severity = severityForMetric(state.rule.metric as AlertMetric);
    const firing: AlertFiringRecord = {
      id: `fire_${randomUUID()}`,
      ruleId: state.rule.id,
      firedAt: now,
      metricValue,
      severity,
      payload: {
        windowSeconds: state.rule.windowSeconds,
        threshold: state.rule.threshold,
      },
    };
    this.store.insertAlertFiring(firing);
    state.lastFiredAt = now;
    // Reset the rolling window so the same burst doesn't refire on the
    // next event in the same window — the cooldown is the only gate
    // after this point. Clearing matches the contract of "one firing
    // per crossing", which is what every other monitoring product does.
    state.timestamps = [];
    try {
      await this.delivery.deliverAll(state.rule, firing, { test: false });
    } catch (err) {
      // Delivery should never throw (it returns failure rows), but
      // belt + braces — record the error rather than crashing ingest.
      this.onError(err instanceof Error ? err : new Error(String(err)), {
        rule: state.rule.id,
      });
    }
  }
}

/**
 * Map an event onto the metric ids the evaluator understands. Anything
 * we don't know about returns false so a typo never crashes the hot
 * path.
 */
export function eventMatchesMetric(event: EventRecord, metric: string): boolean {
  switch (metric) {
    case 'event_count':
      return true;
    case 'crash_count':
      return event.type === 'crash';
    case 'error_event_count':
      return isErrorSeverity(event.severity);
    case 'anr_count':
      return event.type === 'native_anr';
    case 'frame_drop_count':
      return event.type === 'frame_drop';
    default:
      return false;
  }
}

function isErrorSeverity(severity: Severity): boolean {
  return severity === 'critical';
}
