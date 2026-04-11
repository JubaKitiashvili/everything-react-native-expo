import type { MonitorEvent, MonitorEventType } from '../types';

export interface CorrelationGroup {
  id: string;
  events: MonitorEvent[];
  confidence: number;
  startTime: number;
  endTime: number;
}

export interface CorrelationEngineOptions {
  /** Time window in ms for grouping related events. Default 2000. */
  windowMs?: number;
  /** Max correlation groups kept in memory. Default 50. */
  maxGroups?: number;
  now?: () => number;
}

/**
 * Links events across collectors that happen close in time, producing
 * causal-chain candidates. The confidence score increases with the
 * number of distinct event types in the group (more signals = more
 * confident).
 */
export class CorrelationEngine {
  private readonly windowMs: number;
  private readonly maxGroups: number;
  private readonly now: () => number;
  private groups: CorrelationGroup[] = [];
  private nextId = 1;

  constructor(options: CorrelationEngineOptions = {}) {
    this.windowMs = options.windowMs ?? 2000;
    this.maxGroups = options.maxGroups ?? 50;
    this.now = options.now ?? Date.now;
  }

  /**
   * Adds an event to the engine. Returns the updated group the event
   * joined (for inspection); null if no group was affected.
   */
  ingest(event: MonitorEvent): CorrelationGroup | null {
    const now = this.now();
    this.evict(now);
    // Find an open group that ends within the window of this event.
    const openGroup = this.groups.find(
      (g) => now - g.endTime <= this.windowMs,
    );
    let group: CorrelationGroup;
    if (openGroup) {
      openGroup.events.push(event);
      openGroup.endTime = now;
      openGroup.confidence = this.scoreConfidence(openGroup.events);
      group = openGroup;
    } else {
      group = {
        id: `corr-${this.nextId++}`,
        events: [event],
        confidence: this.scoreConfidence([event]),
        startTime: now,
        endTime: now,
      };
      this.groups.push(group);
      if (this.groups.length > this.maxGroups) {
        this.groups.shift();
      }
    }
    return group;
  }

  /**
   * Returns closed correlation groups — groups whose most recent event
   * was more than `windowMs` ago and that contain 2+ events.
   */
  drainClosed(): CorrelationGroup[] {
    const now = this.now();
    const closed: CorrelationGroup[] = [];
    const remaining: CorrelationGroup[] = [];
    for (const g of this.groups) {
      if (now - g.endTime > this.windowMs) {
        if (g.events.length >= 2) closed.push(g);
      } else {
        remaining.push(g);
      }
    }
    this.groups = remaining;
    return closed;
  }

  /** Diagnostic — open groups currently held in memory. */
  snapshot(): readonly CorrelationGroup[] {
    return this.groups;
  }

  clear(): void {
    this.groups = [];
  }

  private evict(now: number): void {
    // Drop groups whose end time is outside 10×windowMs (stale).
    const hardCutoff = now - this.windowMs * 10;
    this.groups = this.groups.filter((g) => g.endTime >= hardCutoff);
  }

  private scoreConfidence(events: MonitorEvent[]): number {
    const types = new Set<MonitorEventType>();
    for (const e of events) types.add(e.type);
    // Confidence scales with (a) number of events and (b) diversity of types.
    const base = Math.min(events.length * 10, 60);
    const diversity = Math.min(types.size * 15, 40);
    return Math.min(base + diversity, 100);
  }
}
