import type { Collector, MonitorConfig, MonitorEvent } from '../types';
import type { SignalBus } from '../core/SignalBus';
import type { NetworkEventData } from './NetworkCollector';
import type { NavigationEventData } from './NavigationCollector';
import type { CrashEventData } from './CrashCollector';
import type { CustomEventData } from './CustomEventCollector';

export type BreadcrumbCategory =
  | 'navigation'
  | 'network'
  | 'crash'
  | 'custom'
  | 'ui.tap'
  | 'state'
  | 'console'
  | 'lifecycle';

export interface Breadcrumb {
  type: string;
  category: BreadcrumbCategory;
  message: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export interface BreadcrumbCollectorDeps {
  signalBus: SignalBus;
  /** Max ring buffer size. Default 100. */
  capacity?: number;
  now?: () => number;
}

const DEFAULT_CAPACITY = 100;

function summarize(event: MonitorEvent): Breadcrumb | null {
  switch (event.type) {
    case 'navigation': {
      const d = event.data as NavigationEventData;
      return {
        type: 'navigation',
        category: 'navigation',
        message: `${d.previousScreen ?? '∅'} → ${d.screen}`,
        timestamp: event.timestamp,
        data: { source: d.source, durationMs: d.durationMs },
      };
    }
    case 'network': {
      const d = event.data as NetworkEventData;
      return {
        type: 'http',
        category: 'network',
        message: `${d.method} ${d.url} → ${d.statusCode ?? 'ERR'}`,
        timestamp: event.timestamp,
        data: {
          durationMs: d.durationMs,
          transport: d.transport,
          ...(d.errorMessage ? { errorMessage: d.errorMessage } : {}),
        },
      };
    }
    case 'custom': {
      const d = event.data as CustomEventData;
      return {
        type: 'event',
        category: 'custom',
        message: d.name,
        timestamp: event.timestamp,
        data: d.attributes,
      };
    }
    case 'crash': {
      // Crashes do NOT add themselves to the trail — they consume it.
      return null;
    }
    default:
      return null;
  }
}

/**
 * BreadcrumbCollector maintains a ring buffer of the last N user-facing
 * events and attaches the trail to every crash event as context. This
 * turns an opaque stack trace into a story: "user tapped Profile → API
 * 500 → crash", which is what makes crash reports actionable.
 *
 * The collector subscribes to every non-crash event via the SignalBus
 * and intercepts crash events through a dedicated hook so we can mutate
 * the event data before downstream processors see it.
 */
export class BreadcrumbCollector implements Collector {
  readonly name = 'breadcrumb';
  readonly priority = 5; // after crash, before most other collectors

  private readonly deps: BreadcrumbCollectorDeps;
  private readonly capacity: number;
  private readonly buffer: Breadcrumb[] = [];
  private bufferStart = 0; // index of oldest entry
  private bufferSize = 0;
  private unsubscribe: (() => void) | null = null;
  private running = false;

  constructor(deps: BreadcrumbCollectorDeps) {
    this.deps = deps;
    this.capacity = deps.capacity ?? DEFAULT_CAPACITY;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  init(_config: MonitorConfig): void {}

  start(): void {
    if (this.running) return;
    this.unsubscribe = this.deps.signalBus.onAll((event) => {
      if (event.type === 'crash') {
        this.attachTrail(event);
        return;
      }
      const crumb = summarize(event);
      if (crumb) this.push(crumb);
    });
    this.running = true;
  }

  stop(): void {
    if (!this.running) return;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.running = false;
  }

  dispose(): void {
    this.stop();
    this.clear();
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Returns a shallow copy of the current trail in chronological order. */
  getTrail(): Breadcrumb[] {
    const out: Breadcrumb[] = [];
    for (let i = 0; i < this.bufferSize; i++) {
      const idx = (this.bufferStart + i) % this.capacity;
      const crumb = this.buffer[idx];
      if (crumb) out.push(crumb);
    }
    return out;
  }

  /** Manually pushes a breadcrumb. Host apps can use this for UI taps etc. */
  leave(crumb: Omit<Breadcrumb, 'timestamp'> & { timestamp?: number }): void {
    const now =
      crumb.timestamp ?? (this.deps.now ? this.deps.now() : Date.now());
    this.push({ ...crumb, timestamp: now });
  }

  clear(): void {
    this.buffer.length = 0;
    this.bufferStart = 0;
    this.bufferSize = 0;
  }

  private push(crumb: Breadcrumb): void {
    if (this.bufferSize < this.capacity) {
      this.buffer[
        (this.bufferStart + this.bufferSize) % this.capacity
      ] = crumb;
      this.bufferSize++;
    } else {
      this.buffer[this.bufferStart] = crumb;
      this.bufferStart = (this.bufferStart + 1) % this.capacity;
    }
  }

  private attachTrail(event: MonitorEvent): void {
    const trail = this.getTrail();
    const data = event.data as CrashEventData & {
      breadcrumbs?: Breadcrumb[];
    };
    data.breadcrumbs = trail;
  }
}
