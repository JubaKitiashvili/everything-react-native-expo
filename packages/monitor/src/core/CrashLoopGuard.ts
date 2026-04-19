// Task 117.47 — Crash loop guard.
//
// Protects the host app from an SDK-induced crash loop. If the monitor's
// own initialization (or a collector) is crashing, every restart will
// hit the same bug, ship another report, and the user is stuck in a
// boot loop they can't escape. This guard counts crashes per launch,
// persists the counter across launches, and — if the same process
// crashes ≥ `threshold` times within `windowMs` — trips. While tripped,
// `shouldInitialize()` returns false so the runtime skips collectors
// and simply emits one `crash_loop_detected` event so the developer
// sees what happened. The operator (or an app update) has to call
// `reset()` to clear the trip.
//
// Persistence contract:
//   - Read must be fast + synchronous-equivalent (the guard blocks
//     startup on it). Implementations typically buffer in memory and
//     flush asynchronously on write.
//   - Write must survive unclean shutdown. The signal-handler layer
//     writes the counter BEFORE re-raising so POSIX sig-term paths keep
//     the count accurate. JS-level persistence (AsyncStorage / expo-
//     file-system) is still useful because most RN crashes come from
//     the JS runtime, not native code.
//   - clear() must be cheap — called after a successful cool-off window
//     elapses with no new crashes.

import type { SignalBus } from './SignalBus';
import type { MonitorEvent } from '../types';

export interface CrashLoopState {
  /** Crashes observed inside the current window. */
  readonly count: number;
  /** Monotonic timestamp (ms) when the current counting window opened. */
  readonly windowStart: number;
  /** Wall-clock timestamp of the most recent recorded crash. */
  readonly lastCrashAt: number | null;
  /**
   * Wall-clock timestamp when the guard tripped. null = not tripped.
   * Non-null disables further collectors until `reset()` is called.
   */
  readonly trippedAt: number | null;
}

export interface CrashLoopPersistence {
  read(): Promise<CrashLoopState | null>;
  write(state: CrashLoopState): Promise<void>;
  clear(): Promise<void>;
}

export interface CrashLoopGuardOptions {
  /** Where to persist state across app launches. */
  readonly persistence: CrashLoopPersistence;
  /**
   * Crashes within `windowMs` required to trip. Default 3 — matches
   * Sentry / Bugsnag's "first three launches" heuristic.
   */
  readonly threshold?: number;
  /**
   * Rolling window that `threshold` is evaluated against. Default
   * 5000ms. Crashes older than `windowMs` are discarded on the next
   * `recordCrash()` call.
   */
  readonly windowMs?: number;
  /**
   * How long a trip remains active once entered. After this elapses a
   * new launch will clear the trip automatically (a single boot-loop
   * shouldn't disable the SDK forever). Default 24h.
   */
  readonly resetAfterMs?: number;
  /**
   * Clock source. Injected for tests.
   */
  readonly now?: () => number;
}

const DEFAULT_THRESHOLD = 3;
const DEFAULT_WINDOW_MS = 5_000;
const DEFAULT_RESET_AFTER_MS = 24 * 60 * 60 * 1_000;

export class CrashLoopGuard {
  private readonly persistence: CrashLoopPersistence;
  private readonly threshold: number;
  private readonly windowMs: number;
  private readonly resetAfterMs: number;
  private readonly now: () => number;
  private state: CrashLoopState = {
    count: 0,
    windowStart: 0,
    lastCrashAt: null,
    trippedAt: null,
  };
  private hydrated = false;
  private tripAnnounced = false;
  private unsubscribe: (() => void) | null = null;

  constructor(options: CrashLoopGuardOptions) {
    this.persistence = options.persistence;
    this.threshold = options.threshold ?? DEFAULT_THRESHOLD;
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.resetAfterMs = options.resetAfterMs ?? DEFAULT_RESET_AFTER_MS;
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Load persisted state. Call once at runtime construction, before
   * any collector is started. If persistence rejects, the guard
   * degrades to in-memory-only — better to protect nothing than to
   * fail the whole SDK.
   */
  async hydrate(): Promise<void> {
    try {
      const loaded = await this.persistence.read();
      if (loaded) this.state = loaded;
    } catch {
      // Swallow — a corrupt or unavailable store must not block boot.
    }
    // Expire trips older than `resetAfterMs` — a one-off crash loop
    // yesterday shouldn't silently disable the SDK today.
    if (
      this.state.trippedAt !== null &&
      this.now() - this.state.trippedAt > this.resetAfterMs
    ) {
      this.state = {
        count: 0,
        windowStart: 0,
        lastCrashAt: null,
        trippedAt: null,
      };
      try {
        await this.persistence.write(this.state);
      } catch {
        // non-fatal
      }
    }
    this.hydrated = true;
  }

  /** True if the guard has tripped and the runtime should stand down. */
  isTripped(): boolean {
    return this.state.trippedAt !== null;
  }

  getState(): CrashLoopState {
    return this.state;
  }

  /**
   * Record a crash observed this launch. Called from the SignalBus
   * subscription. Returns true if this crash caused a trip.
   */
  async recordCrash(at?: number): Promise<boolean> {
    const ts = at ?? this.now();
    // Rolling window: if the last recorded crash is outside the window,
    // start a fresh count. Otherwise accumulate.
    const withinWindow =
      this.state.count > 0 && ts - this.state.windowStart <= this.windowMs;
    const next: CrashLoopState = withinWindow
      ? {
          count: this.state.count + 1,
          windowStart: this.state.windowStart,
          lastCrashAt: ts,
          trippedAt: this.state.trippedAt,
        }
      : {
          count: 1,
          windowStart: ts,
          lastCrashAt: ts,
          trippedAt: this.state.trippedAt,
        };

    let tripped = false;
    if (next.trippedAt === null && next.count >= this.threshold) {
      tripped = true;
      this.state = { ...next, trippedAt: ts };
    } else {
      this.state = next;
    }

    try {
      await this.persistence.write(this.state);
    } catch {
      // best-effort persistence; in-memory state is still updated.
    }
    return tripped;
  }

  /**
   * After startup has been stable for this long (ms), clear the
   * in-memory counter. Called by the runtime after `stableAfterMs`
   * elapsed without crashes. Does not clear a trip — only the counter.
   */
  async clearCounter(): Promise<void> {
    if (this.state.count === 0 && this.state.trippedAt === null) return;
    this.state = {
      count: 0,
      windowStart: 0,
      lastCrashAt: null,
      trippedAt: this.state.trippedAt,
    };
    try {
      await this.persistence.write(this.state);
    } catch {
      // non-fatal
    }
  }

  /** Clear the trip. Used by recovery UI or after a new SDK version. */
  async reset(): Promise<void> {
    this.state = {
      count: 0,
      windowStart: 0,
      lastCrashAt: null,
      trippedAt: null,
    };
    try {
      await this.persistence.clear();
    } catch {
      // non-fatal
    }
  }

  /**
   * Subscribe to `crash` events on the bus so subsequent crashes keep
   * the counter accurate. Returns an unsubscribe handle that the
   * runtime calls on shutdown.
   */
  attachToBus(bus: SignalBus): () => void {
    if (this.unsubscribe) this.unsubscribe();
    const handler = (event: MonitorEvent): void => {
      if (event.type !== 'crash') return;
      // Fire-and-forget — bus handlers must stay sync. Persistence
      // errors are swallowed inside recordCrash().
      void this.recordCrash();
    };
    this.unsubscribe = bus.on('crash', handler);
    return () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
    };
  }

  /**
   * Emit a `crash_loop_detected` event on the given bus once per
   * runtime instance. Called by the runtime when `isTripped()` is true
   * at startup so the developer sees a clear signal instead of an
   * inexplicably silent SDK.
   */
  announceTripped(bus: SignalBus, sessionId: string): void {
    if (this.tripAnnounced) return;
    if (!this.isTripped()) return;
    this.tripAnnounced = true;
    bus.emit({
      type: 'crash_loop_detected',
      timestamp: this.now(),
      wallTime: this.now(),
      sessionId,
      data: {
        trippedAt: this.state.trippedAt,
        lastCrashAt: this.state.lastCrashAt,
        recentCount: this.state.count,
        threshold: this.threshold,
        windowMs: this.windowMs,
      },
    });
  }

  /** Assert `hydrate()` was called — used for test / invariant checks. */
  isHydrated(): boolean {
    return this.hydrated;
  }
}

/**
 * In-memory persistence — the sensible default when no platform-backed
 * implementation is injected. Loses state on process exit, which means
 * the guard still catches in-session crash loops but won't detect
 * cross-launch loops. Tests use this. Production wires a real backend
 * (AsyncStorage, expo-file-system, or native shared-prefs).
 */
export class MemoryCrashLoopPersistence implements CrashLoopPersistence {
  private state: CrashLoopState | null = null;

  async read(): Promise<CrashLoopState | null> {
    return this.state;
  }

  async write(state: CrashLoopState): Promise<void> {
    this.state = state;
  }

  async clear(): Promise<void> {
    this.state = null;
  }
}
