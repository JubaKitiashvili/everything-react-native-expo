import type { Collector, MonitorConfig, MonitorEvent } from '../types';
import type { SignalBus } from '../core/SignalBus';
import type { EventStore } from '../storage/EventStore';
import type { SessionManager } from '../core/SessionManager';

export type ErrorUtilsHandler = (error: Error, isFatal?: boolean) => void;

export interface ErrorUtilsLike {
  setGlobalHandler(handler: ErrorUtilsHandler): void;
  getGlobalHandler(): ErrorUtilsHandler | null;
}

export interface RejectionTrackerLike {
  enable(options: {
    allRejections?: boolean;
    onUnhandled: (id: number, error: unknown) => void;
    onHandled?: (id: number) => void;
  }): void;
  disable(): void;
}

export interface CrashCollectorDeps {
  signalBus: SignalBus;
  eventStore: EventStore;
  sessionManager: SessionManager;
  /**
   * RN exposes `global.ErrorUtils`. We accept it as a dep so tests can
   * inject a fake and Phase 2 can swap in a native-backed variant.
   */
  errorUtils?: ErrorUtilsLike | null;
  /**
   * Hermes tracks unhandled promise rejections via
   * `promise/setimmediate/rejection-tracking`. Pass the tracker here so
   * the bridge stays testable.
   */
  rejectionTracker?: RejectionTrackerLike | null;
  /** Monotonic clock for event.timestamp; defaults to performance-style now. */
  now?: () => number;
  /** Wall-clock now(); defaults to Date.now. */
  wallNow?: () => number;
}

export interface CrashEventData {
  kind: 'exception' | 'unhandled-rejection';
  message: string;
  stack: string | null;
  componentStack: string | null;
  isFatal: boolean;
  rejectionId?: number;
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function extractStack(err: unknown): string | null {
  if (err instanceof Error && typeof err.stack === 'string') return err.stack;
  return null;
}

function extractComponentStack(err: unknown): string | null {
  if (
    err &&
    typeof err === 'object' &&
    'componentStack' in err &&
    typeof (err as { componentStack: unknown }).componentStack === 'string'
  ) {
    return (err as { componentStack: string }).componentStack;
  }
  return null;
}

/**
 * CrashCollector captures JS exceptions (via ErrorUtils) and unhandled
 * promise rejections. It chains original handlers rather than replacing
 * them so other monitoring tools and RN's own LogBox still function.
 */
export class CrashCollector implements Collector {
  readonly name = 'crash';
  readonly priority = 0; // highest — init first

  private readonly deps: CrashCollectorDeps;
  private previousHandler: ErrorUtilsHandler | null = null;
  private rejectionTrackerEnabled = false;
  private running = false;
  private readonly now: () => number;
  private readonly wallNow: () => number;

  constructor(deps: CrashCollectorDeps) {
    this.deps = deps;
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
  init(_config: MonitorConfig): void {
    // Config-driven behavior (e.g. consent.crashes) is enforced by
    // downstream processors in Phase 1b. Nothing to do here yet.
  }

  start(): void {
    if (this.running) return;

    const errorUtils = this.deps.errorUtils ?? this.detectErrorUtils();
    if (errorUtils) {
      this.previousHandler = errorUtils.getGlobalHandler();
      const chained: ErrorUtilsHandler = (error, isFatal) => {
        this.reportException(error, Boolean(isFatal));
        try {
          this.previousHandler?.(error, isFatal);
        } catch {
          // never let a broken previous handler mask the crash
        }
      };
      errorUtils.setGlobalHandler(chained);
    }

    const tracker = this.deps.rejectionTracker;
    if (tracker) {
      tracker.enable({
        allRejections: true,
        onUnhandled: (id, err) => this.reportRejection(id, err),
      });
      this.rejectionTrackerEnabled = true;
    }

    this.running = true;
  }

  stop(): void {
    if (!this.running) return;
    const errorUtils = this.deps.errorUtils ?? this.detectErrorUtils();
    if (errorUtils && this.previousHandler) {
      errorUtils.setGlobalHandler(this.previousHandler);
    }
    this.previousHandler = null;
    if (this.rejectionTrackerEnabled && this.deps.rejectionTracker) {
      this.deps.rejectionTracker.disable();
      this.rejectionTrackerEnabled = false;
    }
    this.running = false;
  }

  dispose(): void {
    this.stop();
  }

  isRunning(): boolean {
    return this.running;
  }

  private reportException(error: unknown, isFatal: boolean): void {
    const data: CrashEventData = {
      kind: 'exception',
      message: extractMessage(error),
      stack: extractStack(error),
      componentStack: extractComponentStack(error),
      isFatal,
    };
    this.deliver(data);
  }

  private reportRejection(id: number, error: unknown): void {
    const data: CrashEventData = {
      kind: 'unhandled-rejection',
      message: extractMessage(error),
      stack: extractStack(error),
      componentStack: null,
      isFatal: false,
      rejectionId: id,
    };
    this.deliver(data);
  }

  private deliver(data: CrashEventData): void {
    const event: MonitorEvent = {
      type: 'crash',
      timestamp: this.now(),
      wallTime: this.wallNow(),
      sessionId: this.deps.sessionManager.getCurrentSessionId(),
      data,
    };
    // Fatal crashes go to disk synchronously so we don't lose them if the
    // process dies before the next microtask. Non-fatal crashes and
    // rejections use the normal async path.
    if (data.isFatal) {
      try {
        this.deps.eventStore.insertSync(event, 'critical');
      } catch {
        // swallow — still try to emit so collectors downstream can react
      }
    } else {
      void this.deps.eventStore
        .insert(event, data.kind === 'unhandled-rejection' ? 'high' : 'high')
        .catch(() => {
          // swallow; EventStore buffers errors to globalThis already
        });
    }
    this.deps.signalBus.emit(event);
  }

  private detectErrorUtils(): ErrorUtilsLike | null {
    const g = globalThis as { ErrorUtils?: ErrorUtilsLike };
    return g.ErrorUtils ?? null;
  }
}
