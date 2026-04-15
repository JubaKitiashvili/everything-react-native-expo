/**
 * Alerting engine — evaluates rules against current metric values,
 * handles cooldown deduplication, triggers notifications, and
 * supports auto-resolution.
 */

import type { AlertRule, AlertHistoryRecord, DatabaseClient } from '../db/schema';
import type { NotificationChannel, AlertNotification } from './channels/slack';
import { evaluate, type EvaluationInput } from './evaluator';

// ────────────────────────────────────────────────────────────
// Metric provider interface
// ────────────────────────────────────────────────────────────

export interface MetricValue {
  readonly current: number;
  readonly previous?: number;
}

export interface MetricProvider {
  getMetricValue(appId: string, metric: string, windowSeconds: number): Promise<MetricValue | null>;
}

// ────────────────────────────────────────────────────────────
// Channel registry
// ────────────────────────────────────────────────────────────

export interface ChannelRegistry {
  get(channelName: string): NotificationChannel | undefined;
}

// ────────────────────────────────────────────────────────────
// Engine types
// ────────────────────────────────────────────────────────────

export interface AlertEngineConfig {
  /** How far back to look for cooldown violations (ms). Default: rule.cooldownSeconds * 1000. */
  readonly defaultCooldownMs?: number;
}

export interface EngineEvaluationResult {
  readonly ruleId: string;
  readonly fired: boolean;
  readonly reason: string;
  readonly notificationSent: boolean;
  readonly error?: string;
}

// ────────────────────────────────────────────────────────────
// Engine
// ────────────────────────────────────────────────────────────

export interface AlertEngine {
  /**
   * Evaluate all enabled rules for a given app.
   * Returns one result per rule.
   */
  evaluateApp(appId: string): Promise<readonly EngineEvaluationResult[]>;

  /**
   * Auto-resolve alerts whose condition is no longer met.
   * Returns the number of resolved alerts.
   */
  autoResolve(appId: string): Promise<number>;
}

interface AlertHistoryRow {
  readonly id: string;
  readonly rule_id: string;
  readonly triggered_at: string;
}

interface AlertRuleRow {
  readonly id: string;
  readonly app_id: string;
  readonly metric: string;
  readonly operator: string;
  readonly threshold: number;
  readonly window_seconds: number;
  readonly channel: string;
  readonly enabled: boolean;
  readonly cooldown_seconds: number;
  readonly created_at: string;
}

export const createAlertEngine = (deps: {
  readonly db: DatabaseClient;
  readonly metricProvider: MetricProvider;
  readonly channels: ChannelRegistry;
  readonly config?: AlertEngineConfig;
}): AlertEngine => {
  /**
   * Check if a rule is in cooldown (was triggered recently).
   */
  const isInCooldown = async (ruleId: string, cooldownSeconds: number): Promise<boolean> => {
    const cutoff = new Date(Date.now() - cooldownSeconds * 1000);
    const rows = await deps.db.query<AlertHistoryRow>(
      `SELECT id FROM alert_history
       WHERE rule_id = $1 AND triggered_at > $2
       ORDER BY triggered_at DESC LIMIT 1`,
      [ruleId, cutoff.toISOString()],
    );
    return rows.length > 0;
  };

  /**
   * Record a triggered alert in history.
   */
  const recordAlert = async (
    ruleId: string,
    payload: Record<string, unknown>,
  ): Promise<void> => {
    await deps.db.execute(
      `INSERT INTO alert_history (rule_id, triggered_at, payload_json)
       VALUES ($1, $2, $3)`,
      [ruleId, new Date().toISOString(), JSON.stringify(payload)],
    );
  };

  /**
   * Send notification through the appropriate channel.
   */
  const notify = async (
    rule: AlertRule,
    currentValue: number,
    reason: string,
  ): Promise<{ success: boolean; error?: string }> => {
    const channel = deps.channels.get(rule.channel);
    if (!channel) {
      return { success: false, error: `Channel "${rule.channel}" not registered` };
    }

    const notification: AlertNotification = {
      ruleId: rule.id,
      metric: rule.metric,
      currentValue,
      threshold: rule.threshold,
      reason,
      appId: rule.appId,
      triggeredAt: new Date(),
    };

    return channel.send(notification);
  };

  const evaluateApp = async (appId: string): Promise<readonly EngineEvaluationResult[]> => {
    // Fetch all enabled rules for this app
    const ruleRows = await deps.db.query<AlertRuleRow>(
      `SELECT * FROM alert_rules WHERE app_id = $1 AND enabled = TRUE`,
      [appId],
    );

    const results: EngineEvaluationResult[] = [];

    for (const row of ruleRows) {
      const rule: AlertRule = {
        id: row.id,
        appId: row.app_id,
        metric: row.metric as AlertRule['metric'],
        operator: row.operator as AlertRule['operator'],
        threshold: row.threshold,
        windowSeconds: row.window_seconds,
        channel: row.channel as AlertRule['channel'],
        enabled: row.enabled,
        cooldownSeconds: row.cooldown_seconds,
        createdAt: new Date(row.created_at),
      };

      // Get current metric value
      const metricValue = await deps.metricProvider.getMetricValue(
        appId,
        rule.metric,
        rule.windowSeconds,
      );

      if (!metricValue) {
        results.push({
          ruleId: rule.id,
          fired: false,
          reason: `No metric data available for ${rule.metric}`,
          notificationSent: false,
        });
        continue;
      }

      // Evaluate
      const input: EvaluationInput = {
        rule,
        currentValue: metricValue.current,
        previousValue: metricValue.previous,
      };
      const evalResult = evaluate(input);

      if (!evalResult.shouldFire) {
        results.push({
          ruleId: rule.id,
          fired: false,
          reason: evalResult.reason,
          notificationSent: false,
        });
        continue;
      }

      // Check cooldown
      const inCooldown = await isInCooldown(rule.id, rule.cooldownSeconds);
      if (inCooldown) {
        results.push({
          ruleId: rule.id,
          fired: true,
          reason: `${evalResult.reason} (in cooldown)`,
          notificationSent: false,
        });
        continue;
      }

      // Record and notify
      await recordAlert(rule.id, {
        currentValue: metricValue.current,
        threshold: rule.threshold,
        reason: evalResult.reason,
      });

      const notifyResult = await notify(rule, metricValue.current, evalResult.reason);

      results.push({
        ruleId: rule.id,
        fired: true,
        reason: evalResult.reason,
        notificationSent: notifyResult.success,
        error: notifyResult.error,
      });
    }

    return results;
  };

  const autoResolve = async (appId: string): Promise<number> => {
    // Find unresolved alerts for this app's rules
    const unresolvedRows = await deps.db.query<AlertHistoryRow & { metric: string; operator: string; threshold: number; window_seconds: number }>(
      `SELECT ah.id, ah.rule_id, ah.triggered_at, ar.metric, ar.operator, ar.threshold, ar.window_seconds
       FROM alert_history ah
       JOIN alert_rules ar ON ar.id = ah.rule_id
       WHERE ar.app_id = $1 AND ah.resolved_at IS NULL AND ar.enabled = TRUE`,
      [appId],
    );

    let resolved = 0;

    for (const row of unresolvedRows) {
      const metricValue = await deps.metricProvider.getMetricValue(
        appId,
        row.metric,
        row.window_seconds,
      );

      if (!metricValue) continue;

      // Build a minimal rule to evaluate
      const rule: AlertRule = {
        id: row.rule_id,
        appId,
        metric: row.metric as AlertRule['metric'],
        operator: row.operator as AlertRule['operator'],
        threshold: row.threshold,
        windowSeconds: row.window_seconds,
        channel: 'slack',
        enabled: true,
        cooldownSeconds: 0,
        createdAt: new Date(),
      };

      const evalResult = evaluate({
        rule,
        currentValue: metricValue.current,
        previousValue: metricValue.previous,
      });

      // If condition is no longer met, resolve the alert
      if (!evalResult.shouldFire) {
        await deps.db.execute(
          `UPDATE alert_history SET resolved_at = $1 WHERE id = $2`,
          [new Date().toISOString(), row.id],
        );
        resolved++;
      }
    }

    return resolved;
  };

  return { evaluateApp, autoResolve };
};
