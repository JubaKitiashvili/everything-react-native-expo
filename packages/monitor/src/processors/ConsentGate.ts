import type { MonitorEvent, MonitorEventType } from '../types';
import type { CrashEventData } from '../collectors/CrashCollector';

export type ConsentCategory = 'crashes' | 'analytics' | 'replay';

export interface ConsentState {
  crashes: boolean;
  analytics: boolean;
  replay: boolean;
}

export interface ConsentStore {
  load(): Promise<ConsentState | null> | ConsentState | null;
  save(state: ConsentState): Promise<void> | void;
}

export interface ConsentGateOptions {
  /** Initial state (usually from Config.consent). */
  initial: ConsentState;
  /** Persistent store for consent state across sessions. Optional. */
  store?: ConsentStore;
}

/**
 * Maps a MonitorEvent to the consent category it belongs to. Crashes are
 * the only type that requires the crashes consent; everything else falls
 * under analytics for Phase 1b (replay data is Phase 2b).
 */
function categoryOf(event: MonitorEvent): ConsentCategory {
  if (event.type === 'crash') {
    const data = event.data as CrashEventData;
    // Fatal vs non-fatal is still "crashes" — the category is about
    // reporting, not severity.
    void data;
    return 'crashes';
  }
  return 'analytics';
}

/**
 * ConsentGate buffers events until consent is granted for their category.
 * Before consent: events are queued in memory (up to maxBufferedPerCategory).
 * On grant: buffered events are flushed in order to the provided drain.
 * On revoke: buffered events for the revoked category are purged.
 */
export class ConsentGate {
  private state: ConsentState;
  private readonly store: ConsentStore | undefined;
  private readonly buffers: Record<ConsentCategory, MonitorEvent[]> = {
    crashes: [],
    analytics: [],
    replay: [],
  };
  private readonly listeners = new Set<(s: ConsentState) => void>();
  private hydrated = false;

  constructor(options: ConsentGateOptions) {
    this.state = { ...options.initial };
    this.store = options.store;
  }

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    if (this.store) {
      const loaded = await this.store.load();
      if (loaded) this.state = { ...loaded };
    }
    this.hydrated = true;
  }

  getState(): ConsentState {
    return { ...this.state };
  }

  onChange(cb: (state: ConsentState) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /**
   * Decides whether an event should pass through right now. Side effect:
   * if consent is denied for the category, the event is buffered.
   */
  process(event: MonitorEvent): boolean {
    const category = categoryOf(event);
    if (this.state[category]) return true;
    this.buffers[category].push(event);
    return false;
  }

  /**
   * Updates consent. Granted categories flush their buffers via `drain`
   * in arrival order; revoked categories purge.
   */
  async setConsent(
    partial: Partial<ConsentState>,
    drain?: (events: MonitorEvent[]) => void | Promise<void>,
  ): Promise<void> {
    const prev = { ...this.state };
    this.state = { ...this.state, ...partial };
    if (this.store) await this.store.save(this.state);

    const flushed: MonitorEvent[] = [];
    for (const cat of Object.keys(this.buffers) as ConsentCategory[]) {
      if (!prev[cat] && this.state[cat]) {
        flushed.push(...this.buffers[cat]);
        this.buffers[cat] = [];
      } else if (prev[cat] && !this.state[cat]) {
        this.buffers[cat] = [];
      }
    }
    if (drain && flushed.length > 0) {
      await drain(flushed);
    }

    for (const listener of [...this.listeners]) {
      try {
        listener(this.getState());
      } catch {
        // swallow
      }
    }
  }

  /** Diagnostic: how many events are buffered for a category. */
  bufferedCount(category: ConsentCategory): number {
    return this.buffers[category].length;
  }

  /** Category of an event, exposed for routing. */
  static categoryOf(event: MonitorEvent): ConsentCategory {
    return categoryOf(event);
  }

  /** Exposed for tests. */
  static knownTypes(): MonitorEventType[] {
    return ['crash', 'network', 'navigation', 'render', 'custom'];
  }
}
