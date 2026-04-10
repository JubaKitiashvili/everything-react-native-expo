import type { MonitorEvent, MonitorEventType } from '../types';

export type MonitorEventHandler = (event: MonitorEvent) => void;

/**
 * Central pub/sub for monitor events. Every collector emits here; every
 * processor subscribes. Handlers run synchronously in registration order
 * with per-handler try/catch so a buggy subscriber never takes down the bus
 * or blocks other subscribers.
 */
export class SignalBus {
  private readonly handlers = new Map<MonitorEventType, Set<MonitorEventHandler>>();
  private readonly wildcard = new Set<MonitorEventHandler>();

  /**
   * Monotonic clock used to stamp events. `performance.now()` when
   * available, else a monotonic shim on top of Date.now so ordering is
   * still stable in environments without `performance`.
   */
  static now(): number {
    if (
      typeof performance !== 'undefined' &&
      typeof performance.now === 'function'
    ) {
      return performance.now();
    }
    return Date.now();
  }

  emit(event: MonitorEvent): void {
    const typed = this.handlers.get(event.type);
    if (typed) {
      // Snapshot so that a handler that unsubscribes mid-dispatch doesn't
      // mutate the set we're iterating over.
      for (const handler of [...typed]) {
        this.runSafely(handler, event);
      }
    }
    if (this.wildcard.size > 0) {
      for (const handler of [...this.wildcard]) {
        this.runSafely(handler, event);
      }
    }
  }

  on(type: MonitorEventType, handler: MonitorEventHandler): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => this.off(type, handler);
  }

  onAll(handler: MonitorEventHandler): () => void {
    this.wildcard.add(handler);
    return () => {
      this.wildcard.delete(handler);
    };
  }

  off(type: MonitorEventType, handler: MonitorEventHandler): void {
    const set = this.handlers.get(type);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      this.handlers.delete(type);
    }
  }

  clear(): void {
    this.handlers.clear();
    this.wildcard.clear();
  }

  /** Diagnostic helper: number of subscribers for a given type. */
  listenerCount(type?: MonitorEventType): number {
    if (type === undefined) {
      let total = this.wildcard.size;
      for (const set of this.handlers.values()) total += set.size;
      return total;
    }
    return (this.handlers.get(type)?.size ?? 0) + this.wildcard.size;
  }

  private runSafely(handler: MonitorEventHandler, event: MonitorEvent): void {
    try {
      handler(event);
    } catch (err) {
      // Swallow and report via globalThis so we never break the bus. A
      // dedicated error reporter can hook this up in Phase 1b.
      const g = globalThis as {
        __erne_signal_bus_errors__?: unknown[];
      };
      if (!Array.isArray(g.__erne_signal_bus_errors__)) {
        g.__erne_signal_bus_errors__ = [];
      }
      g.__erne_signal_bus_errors__.push(err);
    }
  }
}
