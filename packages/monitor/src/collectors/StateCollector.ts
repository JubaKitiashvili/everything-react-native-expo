import type { Collector, MonitorConfig, MonitorEvent } from '../types';
import type { SignalBus } from '../core/SignalBus';

export interface StateEventData {
  /** 'zustand' | 'redux' | custom source. */
  source: string;
  /** Human-readable action / store name. */
  action: string;
  /** Keys that changed between prev and next state (shallow). */
  changedKeys: string[];
  /** Optional store identifier if multiple stores are monitored. */
  store?: string;
}

export interface StateCollectorDeps {
  signalBus: SignalBus;
  /**
   * Rate limit on emitted state events — drops excess when a store is
   * hot. Default 50/s.
   */
  maxPerSecond?: number;
  now?: () => number;
  wallNow?: () => number;
}

/**
 * StateCollector records state transitions from Zustand / Redux stores
 * via middleware. The collector itself is a passive sink; the middleware
 * factories below (zustandMiddleware, reduxMiddleware) return
 * framework-appropriate wrappers that feed `record()` here.
 *
 * We deliberately do NOT capture full state values — only the list of
 * top-level keys that changed. That keeps PII out of the event stream
 * and the payload small enough to buffer thousands of transitions.
 */
export class StateCollector implements Collector {
  readonly name = 'state';
  readonly priority = 60;

  private readonly deps: StateCollectorDeps;
  private readonly maxPerSecond: number;
  private readonly now: () => number;
  private readonly wallNow: () => number;

  private running = false;
  private windowStart = 0;
  private windowCount = 0;

  constructor(deps: StateCollectorDeps) {
    this.deps = deps;
    this.maxPerSecond = deps.maxPerSecond ?? 50;
    this.now =
      deps.now ??
      (() =>
        typeof performance !== 'undefined' &&
        typeof performance.now === 'function'
          ? performance.now()
          : Date.now());
    this.wallNow = deps.wallNow ?? Date.now;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  init(_config: MonitorConfig): void {}

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  dispose(): void {
    this.stop();
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Records a state change. Called by zustand/redux middleware. */
  record(data: StateEventData): void {
    if (!this.running) return;
    if (!this.allow()) return;
    const event: MonitorEvent = {
      type: 'custom',
      timestamp: this.now(),
      wallTime: this.wallNow(),
      sessionId: '',
      data: {
        name: 'state',
        attributes: data as unknown as Record<string, never>,
      },
    };
    this.deps.signalBus.emit(event);
  }

  /**
   * Zustand middleware factory. Wrap your store creator:
   *
   *   const useStore = create(monitor.collectors.state.zustandMiddleware('cart')(
   *     (set) => ({ ... })
   *   ));
   */
  zustandMiddleware(storeName: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (creator: any) => (set: any, get: any, api: any) => {
      const wrappedSet: typeof set = (updater: unknown, replace?: boolean) => {
        const prev = get();
        const result = set(updater as never, replace as never);
        const next = get();
        const changedKeys = shallowDiff(prev, next);
        if (changedKeys.length > 0) {
          this.record({
            source: 'zustand',
            action: 'set',
            changedKeys,
            store: storeName,
          });
        }
        return result;
      };
      return creator(wrappedSet, get, api);
    };
  }

  /**
   * Redux middleware (Redux Toolkit compatible).
   *
   *   const store = configureStore({
   *     reducer,
   *     middleware: (def) => def().concat(
   *       monitor.collectors.state.reduxMiddleware('app'),
   *     ),
   *   });
   */
  reduxMiddleware(storeName: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (api: { getState: () => any }) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (next: (action: any) => any) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (action: any) => {
          const prev = api.getState();
          const result = next(action);
          const nextState = api.getState();
          const changedKeys = shallowDiff(prev, nextState);
          if (changedKeys.length > 0) {
            this.record({
              source: 'redux',
              action:
                typeof action?.type === 'string' ? action.type : 'unknown',
              changedKeys,
              store: storeName,
            });
          }
          return result;
        };
  }

  private allow(): boolean {
    const now = this.now();
    if (now - this.windowStart > 1000) {
      this.windowStart = now;
      this.windowCount = 0;
    }
    if (this.windowCount >= this.maxPerSecond) return false;
    this.windowCount += 1;
    return true;
  }
}

function shallowDiff(
  prev: Record<string, unknown> | undefined,
  next: Record<string, unknown> | undefined,
): string[] {
  if (!prev || !next) return [];
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const changed: string[] = [];
  for (const k of keys) {
    if (prev[k] !== next[k]) changed.push(k);
  }
  return changed;
}
