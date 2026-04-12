import type { SignalBus } from '../core/SignalBus';
import type { SessionManager } from '../core/SessionManager';
import type { MonitorEvent } from '../types';
import type { ErneMonitorNative } from './ErneMonitorNative';

/**
 * Cross-session span persistence. A "span" is an in-progress operation
 * the SDK consumer wants to track — e.g. "checkout", "image-upload",
 * "navigation:Profile". The native side (Tasks 43 iOS/Android) writes
 * span state to a memory-mapped append-only log on every start /
 * update / end so the data survives a crash.
 *
 * Boot semantics:
 *   1. JS calls `replayInterrupted()` once per session.
 *   2. Native returns the list of spans whose end was never recorded
 *      — these are the "interrupted" spans the previous run was
 *      executing when it died.
 *   3. JS dispatches each one as a `custom` event named
 *      `interrupted_span` with the span's name, parent, kind, and
 *      duration-so-far. Downstream the SignalRouter pattern library
 *      treats long interrupted spans as crash-correlated regressions.
 *
 * Live span control flows the other direction — JS starts/updates/ends
 * a span, the native module writes to the append-only log, the JS
 * pipeline carries on as if nothing native were involved. The log is
 * automatically truncated when the active set is empty (rotation).
 */
export interface ActiveSpanInfo {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly kind: string;
  readonly startedAt: number;
}

export interface InterruptedSpan {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly kind: string;
  readonly startedAt: number;
  readonly lastSeenAt: number;
  readonly durationMs: number;
}

export interface SpanSnapshotDeps {
  native: ErneMonitorNative;
  signalBus: SignalBus;
  sessionManager: SessionManager;
  now?: () => number;
  wallNow?: () => number;
  /** Test hook — defaults to native.startSpan / updateSpan / endSpan etc. */
  startSpanImpl?: (info: ActiveSpanInfo) => void;
  updateSpanImpl?: (id: string, attributes: Record<string, unknown>) => void;
  endSpanImpl?: (id: string) => void;
  drainInterruptedImpl?: () => Promise<readonly InterruptedSpan[]>;
}

export class SpanSnapshot {
  private replayedCount = 0;
  private readonly active = new Map<string, ActiveSpanInfo>();
  private readonly now: () => number;
  private readonly wallNow: () => number;

  constructor(private readonly deps: SpanSnapshotDeps) {
    this.now =
      deps.now ??
      (() =>
        typeof performance !== 'undefined' &&
        typeof performance.now === 'function'
          ? performance.now()
          : Date.now());
    this.wallNow = deps.wallNow ?? Date.now;
  }

  getActiveCount(): number {
    return this.active.size;
  }

  getReplayedCount(): number {
    return this.replayedCount;
  }

  /** Begin tracking a span. Persists immediately so a crash mid-op is recoverable. */
  startSpan(info: Omit<ActiveSpanInfo, 'startedAt'>): ActiveSpanInfo {
    if (this.active.size >= 50) {
      // Drop the oldest to keep the active set bounded — same rule the
      // native side enforces in its mmap log.
      const oldest = this.active.keys().next().value;
      if (typeof oldest === 'string') this.active.delete(oldest);
    }
    const full: ActiveSpanInfo = { ...info, startedAt: this.wallNow() };
    this.active.set(info.id, full);
    try {
      this.deps.startSpanImpl?.(full);
    } catch {
      // ignore — span tracking is best-effort
    }
    return full;
  }

  updateSpan(id: string, attributes: Record<string, unknown>): void {
    if (!this.active.has(id)) return;
    try {
      this.deps.updateSpanImpl?.(id, attributes);
    } catch {
      // ignore
    }
  }

  endSpan(id: string): void {
    if (!this.active.has(id)) return;
    this.active.delete(id);
    try {
      this.deps.endSpanImpl?.(id);
    } catch {
      // ignore
    }
  }

  /**
   * Drains any interrupted spans the native module persisted from the
   * previous session and dispatches them as `custom` events. Returns
   * the number replayed. Always swallows errors so SDK boot never
   * fails because the native module misbehaved.
   */
  async replayInterrupted(): Promise<number> {
    const drain = this.deps.drainInterruptedImpl;
    if (!drain) return 0;
    let interrupted: readonly InterruptedSpan[] = [];
    try {
      interrupted = await drain();
    } catch {
      return 0;
    }
    for (const span of interrupted) {
      this.dispatchInterrupted(span);
      this.replayedCount += 1;
    }
    return interrupted.length;
  }

  private dispatchInterrupted(span: InterruptedSpan): void {
    const event: MonitorEvent = {
      type: 'custom',
      timestamp: this.now(),
      wallTime: this.wallNow(),
      sessionId: this.deps.sessionManager.getCurrentSessionId(),
      data: {
        name: 'interrupted_span',
        attributes: {
          spanId: span.id,
          spanName: span.name,
          spanKind: span.kind,
          parentId: span.parentId ?? '',
          durationMs: span.durationMs,
          startedAt: span.startedAt,
          lastSeenAt: span.lastSeenAt,
        },
        span,
      },
    };
    this.deps.signalBus.emit(event);
  }
}
