/**
 * Test-time network degrader. Monkey-patches `fetch` (and optionally
 * XHR) on a supplied target to simulate offline / slow / flaky network
 * conditions. Used from Maestro flows + dev diagnostics screens to
 * verify the SDK's offline-first transport + retry queue behavior.
 *
 * Pairs with `CrashInjector` for chaos tests. Nothing here touches
 * native code — it's pure JS monkey-patching that can be invoked from
 * any RN runtime.
 *
 * Usage:
 *   const degrader = new NetworkDegrader({ target: globalThis });
 *   degrader.simulateOffline();
 *   // ... run scenario, verify EventStore buffered ...
 *   degrader.restore();
 */

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface NetworkDegraderDeps {
  /**
   * Object whose `fetch` is patched. Defaults to `globalThis`. Tests
   * supply a mock so the real network is never touched.
   */
  target?: { fetch?: FetchLike };
  /** Override the dev gate. Defaults to `__DEV__`. */
  isDev?: boolean;
  /** Override setTimeout — tests inject fake timers. */
  schedule?: (fn: () => void, ms: number) => unknown;
}

function detectDev(): boolean {
  const g = globalThis as { __DEV__?: unknown };
  if (typeof g.__DEV__ === 'boolean') return g.__DEV__;
  if (typeof process !== 'undefined' && process.env?.NODE_ENV) {
    return process.env.NODE_ENV !== 'production';
  }
  return false;
}

export type DegradationMode =
  | { kind: 'none' }
  | { kind: 'offline' }
  | { kind: 'slow'; extraDelayMs: number }
  | { kind: 'flaky'; failureRate: number };

export class NetworkDegrader {
  private readonly target: { fetch?: FetchLike };
  private readonly isDev: boolean;
  private readonly schedule: (fn: () => void, ms: number) => unknown;
  private originalFetch: FetchLike | undefined;
  private mode: DegradationMode = { kind: 'none' };

  constructor(deps: NetworkDegraderDeps = {}) {
    this.target = deps.target ?? (globalThis as { fetch?: FetchLike });
    this.isDev = deps.isDev ?? detectDev();
    this.schedule =
      deps.schedule ??
      ((fn, ms) => setTimeout(fn, ms) as unknown);
  }

  getMode(): DegradationMode {
    return this.mode;
  }

  isActive(): boolean {
    return this.mode.kind !== 'none';
  }

  /** All requests reject with "offline" until `restore()` is called. */
  simulateOffline(): void {
    if (!this.isDev) return;
    this.mode = { kind: 'offline' };
    this.install();
  }

  /** Every request gets an extra `extraDelayMs` delay before it returns. */
  simulateSlowNetwork(extraDelayMs: number): void {
    if (!this.isDev) return;
    if (!Number.isFinite(extraDelayMs) || extraDelayMs < 0) return;
    this.mode = { kind: 'slow', extraDelayMs };
    this.install();
  }

  /**
   * Each request has probability `failureRate` (0..1) of rejecting with
   * a simulated network error. The remainder pass through. Useful for
   * verifying exponential-backoff retry logic.
   */
  simulateFlaky(failureRate: number): void {
    if (!this.isDev) return;
    const clamped = Math.max(0, Math.min(1, failureRate));
    this.mode = { kind: 'flaky', failureRate: clamped };
    this.install();
  }

  /** Removes patches and restores the original fetch, if any. */
  restore(): void {
    if (this.mode.kind === 'none') return;
    if (this.originalFetch) {
      this.target.fetch = this.originalFetch;
    } else {
      delete (this.target as Record<string, unknown>).fetch;
    }
    this.originalFetch = undefined;
    this.mode = { kind: 'none' };
  }

  private install(): void {
    if (this.originalFetch) return; // already patched — mode changed in-place
    this.originalFetch = this.target.fetch;
    const original = this.originalFetch;
    this.target.fetch = (async (input, init) => {
      const mode = this.mode;
      if (mode.kind === 'offline') {
        throw new TypeError('[synthetic] Network offline');
      }
      if (mode.kind === 'flaky' && Math.random() < mode.failureRate) {
        throw new TypeError('[synthetic] Network request failed');
      }
      if (mode.kind === 'slow') {
        await new Promise<void>((resolve) =>
          this.schedule(() => resolve(), mode.extraDelayMs),
        );
      }
      if (!original) {
        throw new TypeError('[synthetic] No underlying fetch available');
      }
      return original(input as RequestInfo | URL, init);
    }) as FetchLike;
  }
}
