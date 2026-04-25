// Task 117.6 — confidence decay store.
//
// Each fix candidate carries a `classification` string (e.g.
// `null-check`, `missing-await`, `type-cast`). We keep a per-class
// success counter that the orchestrator multiplies into Claude's
// self-reported confidence to decide whether a PR should be opened
// at all.
//
// Math:
//   trust(class) = (alpha + merged) / (alpha + merged + beta + rejected)
//
// — a Beta-distribution mean with smoothing priors, a.k.a. Bayesian
// success rate. Defaults to 0.5 with no history (alpha=beta=1) so a
// brand-new classification still gets a fair shot, and grows or
// shrinks toward 1 / 0 as outcomes accumulate.
//
// Persistence is decoupled — pass a `Storage` so tests use an in-memory
// implementation and production uses the dashboard's `server_settings`
// table via a thin REST shim.

const PRIOR_ALPHA = 1;
const PRIOR_BETA = 1;

export interface ConfidenceBucket {
  /** Total PRs the orchestrator opened in this class. */
  proposed: number;
  /** Of those, how many were merged. */
  merged: number;
  /** Of those, how many were closed without merging. */
  rejected: number;
  /**
   * Of those, how many sat in `open` state past the staleness window
   * and were marked `ignored`. Counted separately from rejection.
   */
  ignored: number;
  /** When the classification was first proposed. */
  firstSeen: number;
  /** When the bucket last updated. */
  lastUpdated: number;
}

export type FixOutcome = 'merged' | 'rejected' | 'ignored';

export interface Storage {
  load(): Promise<Record<string, ConfidenceBucket>>;
  save(record: Record<string, ConfidenceBucket>): Promise<void>;
}

/** In-memory storage, useful for tests + ephemeral runs. */
export class InMemoryConfidenceStorage implements Storage {
  private store: Record<string, ConfidenceBucket> = {};
  async load(): Promise<Record<string, ConfidenceBucket>> {
    return JSON.parse(JSON.stringify(this.store)) as Record<string, ConfidenceBucket>;
  }
  async save(record: Record<string, ConfidenceBucket>): Promise<void> {
    this.store = JSON.parse(JSON.stringify(record)) as Record<string, ConfidenceBucket>;
  }
}

export interface ConfidenceStoreOptions {
  storage: Storage;
  /** Clock injection for tests. Defaults to `Date.now`. */
  now?: () => number;
}

export class ConfidenceStore {
  private readonly storage: Storage;
  private readonly now: () => number;
  private cache: Record<string, ConfidenceBucket> | null = null;

  constructor(options: ConfidenceStoreOptions) {
    this.storage = options.storage;
    this.now = options.now ?? Date.now;
  }

  /** Pre-load the cache; future reads avoid the storage round trip. */
  async hydrate(): Promise<void> {
    if (this.cache !== null) return;
    this.cache = await this.storage.load();
  }

  /**
   * Trust score in [0,1] for `classification`. Combined with Claude's
   * self-reported confidence and a hard floor in `AIFixPR.shouldOpen`.
   */
  trustScore(classification: string): number {
    const bucket = this.cache?.[classification];
    const merged = bucket?.merged ?? 0;
    const rejected = (bucket?.rejected ?? 0) + (bucket?.ignored ?? 0);
    return (
      (PRIOR_ALPHA + merged) /
      (PRIOR_ALPHA + merged + PRIOR_BETA + rejected)
    );
  }

  /** Read the bucket. Returns a default-shaped record when absent. */
  bucket(classification: string): ConfidenceBucket {
    return (
      this.cache?.[classification] ?? {
        proposed: 0,
        merged: 0,
        rejected: 0,
        ignored: 0,
        firstSeen: 0,
        lastUpdated: 0,
      }
    );
  }

  /**
   * Effective confidence the orchestrator gates on:
   *   final = self-reported × trust(class)
   *
   * — multiplicative because both signals carry independent noise.
   * Returns a value in [0,100] to match the LLM's scale.
   */
  effectiveConfidence(classification: string, selfReported: number): number {
    const t = this.trustScore(classification);
    const clamped = Math.max(0, Math.min(100, selfReported));
    return Math.round(clamped * t);
  }

  /**
   * Mark a fresh proposal. Call once per PR opened. Does NOT count an
   * outcome — outcomes get recorded later via `recordOutcome()` once
   * the PR is merged / closed / left to rot.
   */
  async recordProposal(classification: string): Promise<void> {
    await this.hydrate();
    const map = this.cache ?? {};
    const ts = this.now();
    const prev = map[classification] ?? {
      proposed: 0,
      merged: 0,
      rejected: 0,
      ignored: 0,
      firstSeen: ts,
      lastUpdated: ts,
    };
    map[classification] = {
      ...prev,
      proposed: prev.proposed + 1,
      lastUpdated: ts,
    };
    this.cache = map;
    await this.storage.save(map);
  }

  /**
   * Record a final outcome for a previously-proposed PR. `merged`
   * reinforces the bucket; `rejected` and `ignored` decay it.
   */
  async recordOutcome(classification: string, outcome: FixOutcome): Promise<void> {
    await this.hydrate();
    const map = this.cache ?? {};
    const ts = this.now();
    const prev = map[classification] ?? {
      // `recordOutcome` may be called for a class that was never
      // formally `recordProposal`'d (e.g. a manual back-fill from a
      // historical PR). Don't synthesise a proposal — the proposed
      // counter only tracks PRs the orchestrator opened in-process.
      proposed: 0,
      merged: 0,
      rejected: 0,
      ignored: 0,
      firstSeen: ts,
      lastUpdated: ts,
    };
    map[classification] = {
      ...prev,
      merged: prev.merged + (outcome === 'merged' ? 1 : 0),
      rejected: prev.rejected + (outcome === 'rejected' ? 1 : 0),
      ignored: prev.ignored + (outcome === 'ignored' ? 1 : 0),
      lastUpdated: ts,
    };
    this.cache = map;
    await this.storage.save(map);
  }

  /** Snapshot the full table. Useful for the dashboard's audit panel. */
  snapshot(): Record<string, ConfidenceBucket> {
    return JSON.parse(JSON.stringify(this.cache ?? {})) as Record<string, ConfidenceBucket>;
  }
}
