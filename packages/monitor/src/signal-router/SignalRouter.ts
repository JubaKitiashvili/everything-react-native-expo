import type { MonitorEvent } from '../types';
import type { Breadcrumb } from '../collectors/BreadcrumbCollector';
import { DedupEngine, type DedupEngineOptions } from './DedupEngine';
import {
  CorrelationEngine,
  type CorrelationEngineOptions,
} from './CorrelationEngine';
import { ConfidenceScorer, type ConfidenceScorerOptions } from './ConfidenceScorer';
import { ContextBuilder, type ContextBuilderDeps } from './ContextBuilder';
import {
  DispatchEngine,
  type DispatchEngineOptions,
  type DispatchedSignal,
} from './DispatchEngine';
import { FeedbackTracker, type FeedbackTrackerOptions } from './FeedbackTracker';
import { PatternLibrary } from './PatternLibrary';

export interface SignalRouterDeps {
  getBreadcrumbs: (limit: number) => Breadcrumb[];
  getCurrentScreen?: () => string | null;
  resolveSourceLocation?: ContextBuilderDeps['resolveSourceLocation'];
  outputs: DispatchEngineOptions['outputs'];
  dedup?: DedupEngineOptions;
  correlation?: CorrelationEngineOptions;
  scorer?: ConfidenceScorerOptions;
  feedback?: FeedbackTrackerOptions;
  patternLibrary?: PatternLibrary;
  ratePerMinute?: number;
  now?: () => number;
}

export interface SignalRouterStats {
  processed: number;
  deduped: number;
  dispatched: number;
  dropped: number;
}

/**
 * SignalRouter — the intelligence core. Wires every sub-engine together
 * and exposes a single `process(event)` entry point. Typically called
 * by createMonitorRuntime's pipeline after sanitizer+enricher.
 *
 *   process(event)
 *     → DedupEngine.process → drop if duplicate
 *     → CorrelationEngine.ingest → build group
 *     → PatternLibrary.match
 *     → ConfidenceScorer.score
 *     → ContextBuilder.build
 *     → DispatchEngine.dispatch → outputs
 */
export class SignalRouter {
  readonly dedup: DedupEngine;
  readonly correlation: CorrelationEngine;
  readonly scorer: ConfidenceScorer;
  readonly contextBuilder: ContextBuilder;
  readonly dispatch: DispatchEngine;
  readonly feedback: FeedbackTracker;
  readonly patterns: PatternLibrary;

  private readonly now: () => number;
  private readonly recurrence = new Map<string, number>();
  private readonly stats: SignalRouterStats = {
    processed: 0,
    deduped: 0,
    dispatched: 0,
    dropped: 0,
  };

  constructor(deps: SignalRouterDeps) {
    this.now = deps.now ?? Date.now;
    this.dedup = new DedupEngine({ ...deps.dedup, now: this.now });
    this.correlation = new CorrelationEngine({
      ...deps.correlation,
      now: this.now,
    });
    this.scorer = new ConfidenceScorer(deps.scorer);
    this.contextBuilder = new ContextBuilder({
      getBreadcrumbs: deps.getBreadcrumbs,
      getCurrentScreen: deps.getCurrentScreen,
      resolveSourceLocation: deps.resolveSourceLocation,
    });
    this.dispatch = new DispatchEngine({
      outputs: deps.outputs,
      ratePerMinute: deps.ratePerMinute,
      now: this.now,
    });
    this.feedback = new FeedbackTracker({ ...deps.feedback, now: this.now });
    this.patterns = deps.patternLibrary ?? new PatternLibrary();
  }

  /**
   * Processes a single event. Returns the DispatchedSignal that was
   * actually delivered, or null if the event was deduped, scored too
   * low, or rate-limited.
   */
  process(event: MonitorEvent): DispatchedSignal | null {
    this.stats.processed += 1;

    const unique = this.dedup.process(event);
    if (unique === null) {
      this.stats.deduped += 1;
      return null;
    }

    const fp = (event.data as { fingerprint?: string }).fingerprint;
    if (fp) {
      this.recurrence.set(fp, (this.recurrence.get(fp) ?? 0) + 1);
    }

    const group = this.correlation.ingest(unique);
    const match = this.patterns.match(unique);
    const dedupEntry = fp ? this.dedup.getEntry(fp) : null;

    const score = this.scorer.score({
      event: unique,
      correlationGroup: group ?? undefined,
      recurrenceCount: fp ? (this.recurrence.get(fp) ?? 1) : undefined,
      patternMatchStrength: match ? match.strength : undefined,
    });

    if (!this.scorer.shouldDispatch(score)) {
      this.stats.dropped += 1;
      return null;
    }

    const context = this.contextBuilder.build(
      unique,
      group ?? undefined,
      dedupEntry?.count ?? 1,
    );

    const dispatched = this.dispatch.dispatch(context, score);
    if (dispatched) {
      this.stats.dispatched += 1;
    } else {
      this.stats.dropped += 1;
    }
    return dispatched;
  }

  /** Returns a snapshot of router stats. */
  getStats(): Readonly<SignalRouterStats> {
    return { ...this.stats };
  }

  clear(): void {
    this.dedup.clear();
    this.correlation.clear();
    this.recurrence.clear();
    this.feedback.clear();
    this.stats.processed = 0;
    this.stats.deduped = 0;
    this.stats.dispatched = 0;
    this.stats.dropped = 0;
  }
}
