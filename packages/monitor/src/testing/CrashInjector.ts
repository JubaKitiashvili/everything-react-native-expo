import type { ErneMonitorNative } from '../native/ErneMonitorNative';

/**
 * Test-time failure injector. Drives crash/ANR scenarios from a JS
 * surface so Maestro flows, integration tests, and dev diagnostics
 * screens can exercise the full SDK pipeline without hand-written
 * `throw` statements spread through app code.
 *
 * Every method is a no-op outside dev mode (guarded by __DEV__) — safe
 * to ship in release bundles because all native-side triggers also gate
 * on DEBUG / debuggable. In release builds the methods return instantly
 * so nothing happens.
 *
 * Usage:
 *   const injector = new CrashInjector({ native: runtime.native });
 *   injector.triggerJSCrash();
 *   injector.triggerNativeCrash();
 *   injector.triggerANR(6000);
 *   injector.triggerCrashLoop({ count: 5, intervalMs: 200 });
 */
export interface CrashInjectorDeps {
  /**
   * Native bridge — source of triggerTestCrash / triggerTestANR /
   * triggerTestSpanCrash. When omitted, native triggers no-op and
   * only JS crashes/loops are available.
   */
  native?: Pick<
    ErneMonitorNative,
    'triggerTestCrash' | 'triggerTestANR' | 'triggerTestSpanCrash'
  > | null;
  /** Override the dev gate. Defaults to `__DEV__`. */
  isDev?: boolean;
  /**
   * Scheduler for `triggerCrashLoop` — defaults to `setTimeout`. Tests
   * inject a manual one to avoid real timers.
   */
  schedule?: (fn: () => void, ms: number) => unknown;
  /**
   * Sink for thrown errors when running in JS-only mode. Defaults to
   * `throw` which lets ErrorUtils / CrashCollector pick it up. Tests
   * inject a collector to assert without propagating.
   */
  throwFn?: (err: Error) => void;
}

function detectDev(): boolean {
  const g = globalThis as { __DEV__?: unknown };
  if (typeof g.__DEV__ === 'boolean') return g.__DEV__;
  if (typeof process !== 'undefined' && process.env?.NODE_ENV) {
    return process.env.NODE_ENV !== 'production';
  }
  return false;
}

export interface CrashLoopOptions {
  /** Number of crashes to fire. Default 5. */
  count?: number;
  /** Delay between fires in ms. Default 100. */
  intervalMs?: number;
  /** Message prefix. Default 'crash-loop'. */
  messagePrefix?: string;
}

export class CrashInjector {
  private readonly deps: CrashInjectorDeps;
  private readonly isDev: boolean;
  private readonly schedule: (fn: () => void, ms: number) => unknown;
  private readonly throwFn: (err: Error) => void;
  private readonly pending: unknown[] = [];

  constructor(deps: CrashInjectorDeps = {}) {
    this.deps = deps;
    this.isDev = deps.isDev ?? detectDev();
    this.schedule =
      deps.schedule ??
      ((fn, ms) => setTimeout(fn, ms) as unknown);
    this.throwFn =
      deps.throwFn ??
      ((err) => {
        throw err;
      });
  }

  /**
   * Throws a synthetic Error tagged with `[synthetic]`. Intended to be
   * caught by ErrorUtils / CrashCollector. Returns without doing
   * anything when not in dev.
   */
  triggerJSCrash(message = 'Synthetic JS crash'): void {
    if (!this.isDev) return;
    const err = new Error(`[synthetic] ${message}`);
    err.name = 'SyntheticCrash';
    this.throwFn(err);
  }

  /**
   * Asks the native module to trigger a real signal (SIGSEGV on iOS,
   * abort on Android). Crashes the app — on next launch, the SDK drains
   * the persisted report. No-op when native module is absent or the
   * trigger method is missing.
   */
  triggerNativeCrash(): void {
    if (!this.isDev) return;
    this.deps.native?.triggerTestCrash?.();
  }

  /**
   * Blocks the main thread for `durationMs` via the native diagnostics
   * hook so the ANR watchdog (5s threshold) fires. Default 6s ensures
   * the watchdog catches it even with a late-arriving first tick.
   */
  triggerANR(durationMs = 6000): void {
    if (!this.isDev) return;
    this.deps.native?.triggerTestANR?.(durationMs / 1000);
  }

  /**
   * Starts a named span then crashes — verifies `drainInterruptedSpans`
   * surfaces the span on the next launch.
   */
  triggerSpanCrash(spanName = 'synthetic-span'): void {
    if (!this.isDev) return;
    this.deps.native?.triggerTestSpanCrash?.(spanName);
  }

  /**
   * Fires `count` JS crashes spaced `intervalMs` apart. Used to verify
   * the crash-loop circuit breaker (3 crashes within 5s → SDK disables
   * non-critical collectors).
   */
  triggerCrashLoop(options: CrashLoopOptions = {}): void {
    if (!this.isDev) return;
    const count = options.count ?? 5;
    const intervalMs = options.intervalMs ?? 100;
    const prefix = options.messagePrefix ?? 'crash-loop';
    for (let i = 0; i < count; i++) {
      const handle = this.schedule(() => {
        const err = new Error(`[synthetic] ${prefix} ${i + 1}/${count}`);
        err.name = 'SyntheticCrash';
        try {
          this.throwFn(err);
        } catch {
          // swallow — the injector's job is to deliver errors to
          // CrashCollector via the throw fn, not to propagate back up.
        }
      }, intervalMs * i);
      this.pending.push(handle);
    }
  }

  /** Cancels any queued crash-loop fires. Useful in test teardown. */
  cancel(): void {
    for (const handle of this.pending) {
      try {
        clearTimeout(handle as ReturnType<typeof setTimeout>);
      } catch {
        // handle may be a custom scheduler return — ignore
      }
    }
    this.pending.length = 0;
  }
}
