import type { MonitorEvent } from '../types';

export interface DedupEntry {
  fingerprint: string;
  firstSeenAt: number;
  lastSeenAt: number;
  count: number;
  latest: MonitorEvent;
}

export interface DedupEngineOptions {
  /** Window in ms — same-fingerprint events within this range are dups. */
  windowMs?: number;
  /** Max concurrent fingerprints kept in memory. Default 200. */
  maxFingerprints?: number;
  now?: () => number;
}

/**
 * Groups events by fingerprint, merges duplicates inside a sliding
 * window, and returns one per unique fingerprint to the downstream
 * pipeline. Events without a fingerprint (non-crash types) pass
 * straight through without grouping.
 */
export class DedupEngine {
  private readonly windowMs: number;
  private readonly maxFingerprints: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, DedupEntry>();

  constructor(options: DedupEngineOptions = {}) {
    this.windowMs = options.windowMs ?? 5000;
    this.maxFingerprints = options.maxFingerprints ?? 200;
    this.now = options.now ?? Date.now;
  }

  /**
   * Accepts an event and returns either:
   *   - the event (first time we've seen this fingerprint within the window)
   *   - null (duplicate — caller should drop it)
   */
  process(event: MonitorEvent): MonitorEvent | null {
    const fp = (event.data as { fingerprint?: string }).fingerprint;
    if (!fp) return event;
    const now = this.now();
    this.evict(now);
    const existing = this.entries.get(fp);
    if (existing && now - existing.lastSeenAt <= this.windowMs) {
      existing.count += 1;
      existing.lastSeenAt = now;
      existing.latest = event;
      return null;
    }
    if (this.entries.size >= this.maxFingerprints) {
      // Evict oldest entry
      let oldestKey: string | null = null;
      let oldestAt = Infinity;
      for (const [k, v] of this.entries.entries()) {
        if (v.lastSeenAt < oldestAt) {
          oldestAt = v.lastSeenAt;
          oldestKey = k;
        }
      }
      if (oldestKey) this.entries.delete(oldestKey);
    }
    this.entries.set(fp, {
      fingerprint: fp,
      firstSeenAt: now,
      lastSeenAt: now,
      count: 1,
      latest: event,
    });
    return event;
  }

  getEntry(fp: string): DedupEntry | null {
    return this.entries.get(fp) ?? null;
  }

  /** Diagnostic — all known fingerprints and their counts. */
  snapshot(): DedupEntry[] {
    return Array.from(this.entries.values());
  }

  clear(): void {
    this.entries.clear();
  }

  private evict(now: number): void {
    for (const [k, v] of this.entries.entries()) {
      if (now - v.lastSeenAt > this.windowMs) {
        this.entries.delete(k);
      }
    }
  }
}
