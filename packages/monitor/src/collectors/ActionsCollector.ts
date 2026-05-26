/**
 * Task 117.24 — React 19 Actions instrumentation.
 *
 * Instruments React 19 form Actions and the `useActionState` reducer so the
 * SDK can see how long server/client actions take, whether they succeeded or
 * threw, and whether they ran while a transition was still pending.
 *
 * React 19 surface this wraps (verify against the live React 19 docs):
 *   - A "form Action" is any `(payload) => Promise<void> | void` passed to a
 *     `<form action={...}>` or a `useTransition` `startTransition` body.
 *   - `useActionState(action, initialState)` returns
 *     `[state, dispatch, isPending]` and the `action` it accepts has the
 *     signature `(previousState, formData) => newState | Promise<newState>`.
 *     `instrumentActionState` wraps that reducer-style action so the emitted
 *     event preserves the React 19 contract (the wrapped fn returns the new
 *     state, never swallows it) while still timing + capturing errors.
 *
 * This is a JS-only helper — no React renderer is required to use or test it.
 * Errors are always re-thrown after being recorded so React's own error
 * handling (error boundaries, action rejection) is never altered.
 */

import type { Collector, MonitorConfig, MonitorEvent } from '../types';
import type { SignalBus } from '../core/SignalBus';
import type { EventStore } from '../storage/EventStore';
import type { SessionManager } from '../core/SessionManager';

export type ActionStatus = 'success' | 'error';

export interface ActionEventData {
  /** Developer-supplied label for the action (e.g. "submit-login"). */
  actionName: string;
  /** Wall-clock execution time of the action, in milliseconds. */
  durationMs: number;
  /** Whether the action resolved or threw. */
  status: ActionStatus;
  /**
   * True when the action was still in-flight at the moment React reported a
   * pending transition. Defaults to false; pass via the wrapper options when
   * the host knows the `isPending` flag from `useActionState`/`useTransition`.
   */
  pending: boolean;
  /** Error name when `status === 'error'`. */
  errorName?: string;
  /** Error message when `status === 'error'`. */
  errorMessage?: string;
}

/**
 * Any function returning a value or a Promise. Covers both form Actions
 * (`(formData) => Promise<void>`) and `useActionState` reducers
 * (`(prevState, formData) => newState`).
 */
export type AnyAction = (...args: never[]) => unknown;

export interface WrapActionOptions {
  /**
   * Static hint that the surrounding transition is pending. When the host
   * has the live `isPending` flag it can pass a getter instead via
   * `isPending`.
   */
  pending?: boolean;
  /** Live pending reader, evaluated at emit time. Takes precedence over `pending`. */
  isPending?: () => boolean;
}

export interface ActionsCollectorDeps {
  signalBus: SignalBus;
  eventStore: EventStore;
  sessionManager: SessionManager;
  now?: () => number;
  wallNow?: () => number;
}

function defaultNow(): number {
  return typeof performance !== 'undefined' &&
    typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function toError(value: unknown): { name: string; message: string } {
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  return { name: 'NonError', message: String(value) };
}

/**
 * ActionsCollector owns the action-timing pipeline. It is a passive
 * collector — it has no global hooks to install, so start/stop only flip the
 * running flag. Host code obtains instrumented actions via `wrapAction` /
 * `instrumentActionState` and the resulting events flow through the bus.
 */
export class ActionsCollector implements Collector {
  readonly name = 'actions';
  readonly priority = 30;

  private readonly deps: ActionsCollectorDeps;
  private readonly now: () => number;
  private readonly wallNow: () => number;
  private running = false;

  constructor(deps: ActionsCollectorDeps) {
    this.deps = deps;
    this.now = deps.now ?? defaultNow;
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

  /**
   * Higher-order wrapper that times an action and emits an `action` event on
   * completion. Works for both sync and async actions: a thrown error or a
   * rejected promise is recorded as `status: 'error'` and re-thrown so the
   * caller's control flow is unchanged.
   *
   * Usage (React 19 form Action):
   *   const onSubmit = collector.wrapAction('submit-login', async (formData) => {
   *     await login(formData);
   *   });
   *   <form action={onSubmit} />
   */
  wrapAction<A extends AnyAction>(
    actionName: string,
    actionFn: A,
    options: WrapActionOptions = {},
  ): A {
    const self = this;
    const wrapped = function (this: unknown, ...args: Parameters<A>): unknown {
      const startedAt = self.now();
      const finish = (status: ActionStatus, err?: unknown): void => {
        self.record(
          actionName,
          self.now() - startedAt,
          status,
          options,
          err,
        );
      };

      let result: unknown;
      try {
        result = (
          actionFn as unknown as (...a: unknown[]) => unknown
        ).apply(this, args);
      } catch (err) {
        finish('error', err);
        throw err;
      }

      if (isThenable(result)) {
        return result.then(
          (value: unknown) => {
            finish('success');
            return value;
          },
          (err: unknown) => {
            finish('error', err);
            throw err;
          },
        );
      }

      finish('success');
      return result;
    };
    return wrapped as unknown as A;
  }

  /**
   * Instruments a `useActionState` reducer-style action. The wrapped function
   * keeps the React 19 contract `(previousState, formData) => newState` and
   * returns the action's resolved value untouched, so it can be passed
   * directly as the first argument to `useActionState`.
   *
   * Usage:
   *   const action = collector.instrumentActionState('update-name', reducer);
   *   const [state, dispatch, isPending] = useActionState(action, initial);
   */
  instrumentActionState<State, Payload>(
    actionName: string,
    action: (previousState: State, payload: Payload) => State | Promise<State>,
    options: WrapActionOptions = {},
  ): (previousState: State, payload: Payload) => State | Promise<State> {
    return this.wrapAction(
      actionName,
      action as unknown as AnyAction,
      options,
    ) as unknown as (
      previousState: State,
      payload: Payload,
    ) => State | Promise<State>;
  }

  private record(
    actionName: string,
    durationMs: number,
    status: ActionStatus,
    options: WrapActionOptions,
    err?: unknown,
  ): void {
    const pending = options.isPending ? !!options.isPending() : !!options.pending;
    const data: ActionEventData = {
      actionName,
      durationMs: Math.max(0, durationMs),
      status,
      pending,
    };
    if (status === 'error' && err !== undefined) {
      const e = toError(err);
      data.errorName = e.name;
      data.errorMessage = e.message;
    }
    const event: MonitorEvent = {
      type: 'action',
      timestamp: this.now(),
      wallTime: this.wallNow(),
      sessionId: this.deps.sessionManager.getCurrentSessionId(),
      data,
    };
    this.deps.signalBus.emit(event);
    void this.deps.eventStore
      .insert(event, status === 'error' ? 'high' : 'normal')
      .catch(() => {
        // swallow — bus already has it
      });
  }
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}
