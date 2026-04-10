import type { Collector, MonitorConfig, MonitorEvent } from '../types';
import type { SignalBus } from '../core/SignalBus';
import type { EventStore } from '../storage/EventStore';
import type { SessionManager } from '../core/SessionManager';

export type CustomAttributeValue = string | number | boolean;

export interface CustomEventData {
  name: string;
  attributes: Record<string, CustomAttributeValue>;
}

export interface CustomEventCollectorDeps {
  signalBus: SignalBus;
  eventStore: EventStore;
  sessionManager: SessionManager;
  now?: () => number;
  wallNow?: () => number;
}

export const CUSTOM_EVENT_LIMITS = Object.freeze({
  maxNameLength: 100,
  maxAttributes: 50,
  maxAttributeValueLength: 1000,
});

function validateName(name: string): void {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('[monitor] trackEvent: name must be a non-empty string');
  }
  if (name.length > CUSTOM_EVENT_LIMITS.maxNameLength) {
    throw new Error(
      `[monitor] trackEvent: name exceeds ${CUSTOM_EVENT_LIMITS.maxNameLength} chars`,
    );
  }
}

function validateAttributes(
  attributes: Record<string, unknown> | undefined,
): Record<string, CustomAttributeValue> {
  if (attributes === undefined) return {};
  if (typeof attributes !== 'object' || attributes === null) {
    throw new Error('[monitor] trackEvent: attributes must be an object');
  }
  const keys = Object.keys(attributes);
  if (keys.length > CUSTOM_EVENT_LIMITS.maxAttributes) {
    throw new Error(
      `[monitor] trackEvent: attributes exceed ${CUSTOM_EVENT_LIMITS.maxAttributes} entries`,
    );
  }
  const out: Record<string, CustomAttributeValue> = {};
  for (const key of keys) {
    const value = attributes[key];
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      throw new Error(
        `[monitor] trackEvent: attribute "${key}" must be string | number | boolean`,
      );
    }
    if (
      typeof value === 'string' &&
      value.length > CUSTOM_EVENT_LIMITS.maxAttributeValueLength
    ) {
      throw new Error(
        `[monitor] trackEvent: attribute "${key}" exceeds ${CUSTOM_EVENT_LIMITS.maxAttributeValueLength} chars`,
      );
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error(
        `[monitor] trackEvent: attribute "${key}" must be a finite number`,
      );
    }
    out[key] = value;
  }
  return out;
}

/**
 * CustomEventCollector exposes the public trackEvent() API. It has no
 * passive start/stop behavior — it simply validates and forwards events
 * emitted by host app code through MonitorClient.trackEvent().
 */
export class CustomEventCollector implements Collector {
  readonly name = 'custom';
  readonly priority = 100;

  private readonly deps: CustomEventCollectorDeps;
  private readonly now: () => number;
  private readonly wallNow: () => number;
  private running = false;

  constructor(deps: CustomEventCollectorDeps) {
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

  trackEvent(
    name: string,
    attributes?: Record<string, CustomAttributeValue>,
  ): void {
    validateName(name);
    const clean = validateAttributes(attributes);
    const event: MonitorEvent = {
      type: 'custom',
      timestamp: this.now(),
      wallTime: this.wallNow(),
      sessionId: this.deps.sessionManager.getCurrentSessionId(),
      data: { name, attributes: clean } satisfies CustomEventData,
    };
    this.deps.signalBus.emit(event);
    void this.deps.eventStore.insert(event, 'low').catch(() => {
      // swallow — bus has it
    });
  }
}
