import type { Collector, MonitorConfig, MonitorEvent } from '../types';
import type { SignalBus } from '../core/SignalBus';
import type { EventStore } from '../storage/EventStore';
import type { SessionManager } from '../core/SessionManager';
import type { AppStateStatus } from '../core/SessionManager';

export interface BackgroundTransitionEventData {
  from: AppStateStatus;
  to: AppStateStatus;
  timestamp: number;
}

export type BackgroundTaskResult = 'success' | 'failed' | 'no-data';

export interface BackgroundTaskEventData {
  taskName: string;
  durationMs: number;
  result: BackgroundTaskResult;
}

/**
 * Minimal slice of React Native `AppState`. Modeled as an interface so the
 * collector can be unit-tested without the RN runtime. Mirrors
 * `core/SessionManager`'s `AppStateLike` so a host can pass the same adapter.
 *
 * Verify against current docs (react-native `AppState`): the change handler
 * receives `'active' | 'background' | 'inactive'` (plus `'unknown'` on the
 * web). `currentState` is the synchronous current value.
 */
export interface BackgroundAppStateLike {
  addChangeListener(cb: (status: AppStateStatus) => void): { remove(): void };
  currentState(): AppStateStatus;
}

/**
 * A registration hook a host app can wire to surface background-task
 * execution boundaries (e.g. expo-background-task / expo-task-manager
 * `TaskManager.defineTask`). The host invokes the returned `begin()` when a
 * task starts and the resulting `end(result)` when it completes; the
 * collector measures duration and emits a `background_task` event.
 */
export interface BackgroundTaskRegistration {
  register(
    onTask: (taskName: string) => {
      end: (result: BackgroundTaskResult) => void;
    },
  ): () => void;
}

export interface BackgroundFetchCollectorDeps {
  signalBus: SignalBus;
  eventStore: EventStore;
  sessionManager: SessionManager;
  /**
   * AppState source. Omit in pure unit tests that drive transitions via
   * the manual `recordTransition` path instead.
   */
  appState?: BackgroundAppStateLike | null;
  /**
   * Optional background-task registration hook. When provided, the
   * collector subscribes and emits `background_task` events around each
   * task execution.
   */
  taskRegistration?: BackgroundTaskRegistration | null;
  now?: () => number;
  wallNow?: () => number;
}

/**
 * BackgroundFetchCollector captures app foreground/background lifecycle
 * transitions and, when a task-registration hook is provided, the execution
 * boundaries of background tasks.
 *
 * Emits:
 *   - `background_transition` { from, to, timestamp } on every AppState change
 *   - `background_task` { taskName, durationMs, result } around task runs
 */
export class BackgroundFetchCollector implements Collector {
  readonly name = 'background_fetch';
  readonly priority = 30;

  private readonly deps: BackgroundFetchCollectorDeps;
  private readonly now: () => number;
  private readonly wallNow: () => number;

  private running = false;
  private appStateSubscription: { remove(): void } | null = null;
  private taskUnsubscribe: (() => void) | null = null;
  private lastState: AppStateStatus = 'unknown';

  constructor(deps: BackgroundFetchCollectorDeps) {
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
  init(_config: MonitorConfig): void {}

  start(): void {
    if (this.running) return;
    this.running = true;

    const appState = this.deps.appState;
    if (appState) {
      this.lastState = appState.currentState();
      this.appStateSubscription = appState.addChangeListener((status) => {
        if (!this.running) return;
        this.recordTransition(status);
      });
    }

    const taskRegistration = this.deps.taskRegistration;
    if (taskRegistration) {
      this.taskUnsubscribe = taskRegistration.register((taskName) => {
        const startedAt = this.now();
        return {
          end: (result) => {
            if (!this.running) return;
            this.recordTask(taskName, this.now() - startedAt, result);
          },
        };
      });
    }
  }

  stop(): void {
    if (!this.running) return;
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
    this.taskUnsubscribe?.();
    this.taskUnsubscribe = null;
    this.running = false;
  }

  dispose(): void {
    this.stop();
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Records an AppState transition. Used by the AppState listener, and
   * callable directly by host apps that drive AppState themselves.
   * No-ops when the target state equals the last observed state.
   */
  recordTransition(to: AppStateStatus): void {
    if (!this.running) return;
    const from = this.lastState;
    if (from === to) return;
    this.lastState = to;
    const data: BackgroundTransitionEventData = {
      from,
      to,
      timestamp: this.wallNow(),
    };
    const event: MonitorEvent = {
      type: 'custom',
      timestamp: this.now(),
      wallTime: this.wallNow(),
      sessionId: this.deps.sessionManager.getCurrentSessionId(),
      data: {
        name: 'background_transition',
        attributes: data as unknown as Record<string, never>,
      },
    };
    this.deps.signalBus.emit(event);
    void this.deps.eventStore.insert(event, 'normal').catch(() => {
      // swallow — bus has it
    });
  }

  /**
   * Records a completed background task. Host apps without a registration
   * hook can call this directly from their task callback.
   */
  recordTask(
    taskName: string,
    durationMs: number,
    result: BackgroundTaskResult,
  ): void {
    if (!this.running) return;
    const data: BackgroundTaskEventData = {
      taskName,
      durationMs: Math.max(0, durationMs),
      result,
    };
    const event: MonitorEvent = {
      type: 'custom',
      timestamp: this.now(),
      wallTime: this.wallNow(),
      sessionId: this.deps.sessionManager.getCurrentSessionId(),
      data: {
        name: 'background_task',
        attributes: data as unknown as Record<string, never>,
      },
    };
    this.deps.signalBus.emit(event);
    void this.deps.eventStore.insert(event, 'normal').catch(() => {
      // swallow — bus has it
    });
  }
}
