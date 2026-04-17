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
  /**
   * Optional burst-throttle key derivation for events that have no
   * fingerprint (e.g. renders, navigation, network). When provided, the
   * first `burstMaxPerWindow` events sharing a burst key within
   * `windowMs` pass through; subsequent events are dropped. Returning
   * `null` means "pass through, no throttling for this event".
   */
  burstKey?: (event: MonitorEvent) => string | null;
  /** Max events per burst key per window. Default 3. */
  burstMaxPerWindow?: number;
}

interface BurstEntry {
  firstSeenAt: number;
  lastSeenAt: number;
  count: number;
}

/**
 * Groups events by fingerprint, merges duplicates inside a sliding
 * window, and returns one per unique fingerprint to the downstream
 * pipeline. For events without a fingerprint, an optional burst-throttle
 * keyed by a caller-supplied derivation prevents floods (e.g. 1000
 * render events per second on a busy screen).
 */
export class DedupEngine {
  private readonly windowMs: number;
  private readonly maxFingerprints: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, DedupEntry>();
  private readonly burstKey?: (event: MonitorEvent) => string | null;
  private readonly burstMaxPerWindow: number;
  private readonly bursts = new Map<string, BurstEntry>();

  constructor(options: DedupEngineOptions = {}) {
    this.windowMs = options.windowMs ?? 5000;
    this.maxFingerprints = options.maxFingerprints ?? 200;
    this.now = options.now ?? Date.now;
    this.burstKey = options.burstKey;
    this.burstMaxPerWindow = options.burstMaxPerWindow ?? 3;
  }

  /**
   * Accepts an event and returns either:
   *   - the event (first time we've seen this fingerprint within the window)
   *   - null (duplicate — caller should drop it)
   */
  process(event: MonitorEvent): MonitorEvent | null {
    const fp = (event.data as { fingerprint?: string }).fingerprint;
    const now = this.now();

    if (!fp) {
      return this.applyBurstThrottle(event, now);
    }

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

  private applyBurstThrottle(
    event: MonitorEvent,
    now: number,
  ): MonitorEvent | null {
    if (!this.burstKey) return event;
    const key = this.burstKey(event);
    if (key === null) return event;

    this.evictBursts(now);
    const existing = this.bursts.get(key);
    if (!existing) {
      this.bursts.set(key, { firstSeenAt: now, lastSeenAt: now, count: 1 });
      return event;
    }
    if (now - existing.firstSeenAt > this.windowMs) {
      // Window expired — reset.
      this.bursts.set(key, { firstSeenAt: now, lastSeenAt: now, count: 1 });
      return event;
    }
    existing.lastSeenAt = now;
    existing.count += 1;
    if (existing.count <= this.burstMaxPerWindow) {
      return event;
    }
    return null;
  }

  private evictBursts(now: number): void {
    for (const [k, v] of this.bursts.entries()) {
      if (now - v.firstSeenAt > this.windowMs) {
        this.bursts.delete(k);
      }
    }
  }

  /** Diagnostic: returns the current number of throttled burst keys. */
  burstSnapshotSize(): number {
    return this.bursts.size;
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
    this.bursts.clear();
  }

  private evict(now: number): void {
    for (const [k, v] of this.entries.entries()) {
      if (now - v.lastSeenAt > this.windowMs) {
        this.entries.delete(k);
      }
    }
  }
}
