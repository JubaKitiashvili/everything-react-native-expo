import type { MonitorEvent } from '../types';
import type { CorrelationGroup } from './CorrelationEngine';

export interface ConfidenceInput {
  event: MonitorEvent;
  correlationGroup?: CorrelationGroup;
  recurrenceCount?: number;
  patternMatchStrength?: number; // 0..1
}

export interface ConfidenceScorerOptions {
  /** Min score to dispatch. 0..100. Default 60. */
  threshold?: number;
}

/**
 * Scores a signal 0..100 based on its correlation group size, how many
 * times this fingerprint has recurred, and how strongly it matches a
 * known pattern from PatternLibrary.
 *
 * Formula:
 *   base = {crash:70, network-5xx:50, render-unnecessary:40, custom:20}
 *   + correlation bonus (up to 20 for large groups)
 *   + recurrence bonus (log-scaled, up to 15)
 *   + pattern bonus (up to 25 for perfect match)
 *   clamped to [0, 100]
 */
export class ConfidenceScorer {
  private readonly threshold: number;

  constructor(options: ConfidenceScorerOptions = {}) {
    this.threshold = options.threshold ?? 60;
  }

  score(input: ConfidenceInput): number {
    let score = this.baseFor(input.event);
    if (input.correlationGroup) {
      const groupSize = input.correlationGroup.events.length;
      score += Math.min(groupSize * 4, 20);
    }
    if (input.recurrenceCount && input.recurrenceCount > 1) {
      score += Math.min(Math.log2(input.recurrenceCount) * 5, 15);
    }
    if (
      input.patternMatchStrength !== undefined &&
      input.patternMatchStrength > 0
    ) {
      score += Math.min(input.patternMatchStrength * 25, 25);
    }
    return Math.max(0, Math.min(Math.round(score), 100));
  }

  shouldDispatch(score: number): boolean {
    return score >= this.threshold;
  }

  getThreshold(): number {
    return this.threshold;
  }

  private baseFor(event: MonitorEvent): number {
    if (event.type === 'crash') return 70;
    if (event.type === 'network') {
      const d = event.data as { statusCode?: number; errorMessage?: string };
      if (d.errorMessage || (d.statusCode !== undefined && d.statusCode >= 500))
        return 50;
      return 15;
    }
    if (event.type === 'render') {
      const d = event.data as { isUnnecessary?: boolean };
      return d.isUnnecessary ? 40 : 15;
    }
    if (event.type === 'navigation') return 15;
    if (event.type === 'custom') {
      const name = (event.data as { name?: string }).name;
      if (name === 'frustration') return 55;
      if (name === 'longTask') return 45;
      return 20;
    }
    return 20;
  }
}
