export type FeedbackRating = 'helpful' | 'not-helpful' | 'applied' | 'dismissed';

export interface FeedbackEntry {
  signalId: string;
  rating: FeedbackRating;
  ts: number;
  note?: string;
}

export interface FeedbackStore {
  save(entry: FeedbackEntry): Promise<void> | void;
  list(limit?: number): Promise<FeedbackEntry[]> | FeedbackEntry[];
}

export interface FeedbackTrackerOptions {
  store?: FeedbackStore;
  now?: () => number;
}

/**
 * Tracks developer feedback on dispatched signals. Feedback feeds back
 * into PatternLibrary / ConfidenceScorer tuning in Phase 4.
 */
export class FeedbackTracker {
  private readonly memory: FeedbackEntry[] = [];
  private readonly store: FeedbackStore | undefined;
  private readonly now: () => number;

  constructor(options: FeedbackTrackerOptions = {}) {
    this.store = options.store;
    this.now = options.now ?? Date.now;
  }

  async record(
    signalId: string,
    rating: FeedbackRating,
    note?: string,
  ): Promise<FeedbackEntry> {
    const entry: FeedbackEntry = {
      signalId,
      rating,
      ts: this.now(),
      ...(note !== undefined ? { note } : {}),
    };
    this.memory.push(entry);
    if (this.store) await this.store.save(entry);
    return entry;
  }

  all(): readonly FeedbackEntry[] {
    return this.memory;
  }

  forSignal(signalId: string): FeedbackEntry[] {
    return this.memory.filter((e) => e.signalId === signalId);
  }

  /** Ratio of positive feedback (helpful + applied) to total. 0..1. */
  helpfulnessRatio(): number {
    if (this.memory.length === 0) return 0;
    const positive = this.memory.filter(
      (e) => e.rating === 'helpful' || e.rating === 'applied',
    ).length;
    return positive / this.memory.length;
  }

  clear(): void {
    this.memory.length = 0;
  }
}
