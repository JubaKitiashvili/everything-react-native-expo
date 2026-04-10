import type { Collector, MonitorConfig, MonitorEvent } from '../types';
import type { SignalBus } from '../core/SignalBus';

export type StartupKind = 'cold' | 'warm' | 'hot';

export interface StartupEventData {
  kind: StartupKind;
  jsInitMs: number;
  firstRenderMs: number | null;
  firstNavigationMs: number | null;
  interactiveMs: number | null;
  coldStartBudgetMs: number;
  exceededBudget: boolean;
}

export interface StartupCollectorDeps {
  signalBus: SignalBus;
  /** Hint for classification. If absent, defaults to 'cold'. */
  kind?: StartupKind;
  /** Warn if cold start exceeds this. Default 3000ms. */
  coldStartBudgetMs?: number;
  now?: () => number;
  /** Instant the JS bundle started executing. Defaults to now(). */
  jsStartAt?: number;
}

/**
 * StartupCollector marks well-known startup milestones and emits a single
 * startup event once the app reaches "interactive". Host apps call
 * markFirstRender(), markFirstNavigation(), and markInteractive() at the
 * appropriate points in their boot flow.
 */
export class StartupCollector implements Collector {
  readonly name = 'startup';
  readonly priority = 25;

  private readonly deps: StartupCollectorDeps;
  private readonly now: () => number;
  private readonly coldStartBudgetMs: number;
  private readonly kind: StartupKind;
  private readonly jsStartAt: number;

  private firstRenderMs: number | null = null;
  private firstNavigationMs: number | null = null;
  private running = false;
  private emitted = false;

  constructor(deps: StartupCollectorDeps) {
    this.deps = deps;
    this.kind = deps.kind ?? 'cold';
    this.coldStartBudgetMs = deps.coldStartBudgetMs ?? 3000;
    this.now =
      deps.now ??
      (() =>
        typeof performance !== 'undefined' &&
        typeof performance.now === 'function'
          ? performance.now()
          : Date.now());
    this.jsStartAt = deps.jsStartAt ?? this.now();
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

  markFirstRender(): void {
    if (!this.running || this.firstRenderMs !== null) return;
    this.firstRenderMs = this.now() - this.jsStartAt;
  }

  markFirstNavigation(): void {
    if (!this.running || this.firstNavigationMs !== null) return;
    this.firstNavigationMs = this.now() - this.jsStartAt;
  }

  markInteractive(): void {
    if (!this.running || this.emitted) return;
    const interactiveMs = this.now() - this.jsStartAt;
    const data: StartupEventData = {
      kind: this.kind,
      jsInitMs: this.firstRenderMs ?? interactiveMs,
      firstRenderMs: this.firstRenderMs,
      firstNavigationMs: this.firstNavigationMs,
      interactiveMs,
      coldStartBudgetMs: this.coldStartBudgetMs,
      exceededBudget:
        this.kind === 'cold' && interactiveMs > this.coldStartBudgetMs,
    };
    const event: MonitorEvent = {
      type: 'custom',
      timestamp: this.now(),
      wallTime: Date.now(),
      sessionId: '',
      data: { name: 'startup', attributes: data as unknown as Record<string, never> },
    };
    this.deps.signalBus.emit(event);
    this.emitted = true;
  }
}
