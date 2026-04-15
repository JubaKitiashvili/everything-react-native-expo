/**
 * Pure alert evaluation logic.
 * Given a rule and current metric value, determines whether the alert should fire.
 */

import type { AlertOperator, AlertRule } from '../db/schema';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface EvaluationInput {
  readonly rule: AlertRule;
  readonly currentValue: number;
  /** Previous value — required for change_pct operator. */
  readonly previousValue?: number;
}

export interface EvaluationResult {
  readonly shouldFire: boolean;
  readonly reason: string;
  readonly currentValue: number;
  readonly threshold: number;
}

// ────────────────────────────────────────────────────────────
// Operator evaluation
// ────────────────────────────────────────────────────────────

const evaluateOperator = (
  operator: AlertOperator,
  current: number,
  threshold: number,
  previous?: number,
): { fires: boolean; reason: string } => {
  switch (operator) {
    case '>':
      return {
        fires: current > threshold,
        reason: `${current} > ${threshold}`,
      };
    case '<':
      return {
        fires: current < threshold,
        reason: `${current} < ${threshold}`,
      };
    case '>=':
      return {
        fires: current >= threshold,
        reason: `${current} >= ${threshold}`,
      };
    case '<=':
      return {
        fires: current <= threshold,
        reason: `${current} <= ${threshold}`,
      };
    case '==':
      return {
        fires: current === threshold,
        reason: `${current} == ${threshold}`,
      };
    case 'change_pct': {
      if (previous === undefined || previous === 0) {
        return {
          fires: false,
          reason: 'No previous value available for change_pct comparison',
        };
      }
      const pctChange = ((current - previous) / Math.abs(previous)) * 100;
      return {
        fires: Math.abs(pctChange) >= threshold,
        reason: `Change: ${pctChange.toFixed(1)}% (threshold: ${threshold}%)`,
      };
    }
    default:
      return { fires: false, reason: `Unknown operator: ${String(operator)}` };
  }
};

// ────────────────────────────────────────────────────────────
// Evaluator
// ────────────────────────────────────────────────────────────

export const evaluate = (input: EvaluationInput): EvaluationResult => {
  if (!input.rule.enabled) {
    return {
      shouldFire: false,
      reason: 'Rule is disabled',
      currentValue: input.currentValue,
      threshold: input.rule.threshold,
    };
  }

  const { fires, reason } = evaluateOperator(
    input.rule.operator,
    input.currentValue,
    input.rule.threshold,
    input.previousValue,
  );

  return {
    shouldFire: fires,
    reason,
    currentValue: input.currentValue,
    threshold: input.rule.threshold,
  };
};
