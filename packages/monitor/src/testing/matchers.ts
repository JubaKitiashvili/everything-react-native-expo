/**
 * Task 117.76 — Jest matchers for `@erne/monitor/testing`.
 *
 * Custom assertions consumers run against a buffer of captured ERNE events
 * (e.g. collected via `signalBus.onAll(e => buffer.push(e))` in a test).
 * The "received" value for every matcher is the captured-events buffer:
 * an array of `MonitorEvent` (or anything event-shaped).
 *
 *   expect(events).toHaveEmittedEvent('navigation');
 *   expect(events).toHaveCrashWithFingerprint('abc123');
 *   expect(events).toHaveNoUnhandledRejections();
 *
 * Register once in a test setup file:
 *   import { registerMatchers } from '@erne/monitor/testing';
 *   registerMatchers();
 *
 * Nothing here touches the production runtime — this lives under the
 * tree-shakeable `/testing` subpath.
 */

import type { MonitorEvent, MonitorEventType } from '../types';

/** Minimal event shape the matchers read — keeps them usable on loose fixtures. */
export interface CapturedEventLike {
  type?: string;
  data?: unknown;
}

type AnyEvent = MonitorEvent | CapturedEventLike;

interface MatcherResultLike {
  pass: boolean;
  message: () => string;
}

function isEventArray(value: unknown): value is AnyEvent[] {
  return Array.isArray(value);
}

function typeOf(event: AnyEvent): string | undefined {
  return typeof event.type === 'string' ? event.type : undefined;
}

/**
 * Reads a crash fingerprint from an event. Fingerprints land on
 * `event.data.fingerprint` (set by the Fingerprinter processor) but we also
 * accept a top-level `fingerprint` for hand-built fixtures.
 */
function fingerprintOf(event: AnyEvent): string | undefined {
  const data = event.data as { fingerprint?: unknown } | undefined;
  if (data && typeof data.fingerprint === 'string') return data.fingerprint;
  const top = (event as { fingerprint?: unknown }).fingerprint;
  return typeof top === 'string' ? top : undefined;
}

/** True when the event is a crash representing an unhandled promise rejection. */
function isUnhandledRejection(event: AnyEvent): boolean {
  if (typeOf(event) !== 'crash') return false;
  const data = event.data as { kind?: unknown } | undefined;
  return !!data && data.kind === 'unhandled-rejection';
}

function summarizeTypes(events: AnyEvent[]): string {
  if (events.length === 0) return '(no events captured)';
  const counts = new Map<string, number>();
  for (const e of events) {
    const t = typeOf(e) ?? '<untyped>';
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].map(([t, n]) => `${t}×${n}`).join(', ');
}

/**
 * Asserts the buffer contains at least one event of the given type.
 */
export function toHaveEmittedEvent(
  received: unknown,
  type: MonitorEventType,
): MatcherResultLike {
  if (!isEventArray(received)) {
    return {
      pass: false,
      message: () =>
        `toHaveEmittedEvent: expected an array of captured events, got ${typeof received}`,
    };
  }
  const matches = received.filter((e) => typeOf(e) === type);
  const pass = matches.length > 0;
  return {
    pass,
    message: () =>
      pass
        ? `expected captured events NOT to include a "${type}" event, but found ${matches.length}`
        : `expected captured events to include a "${type}" event; captured: ${summarizeTypes(received)}`,
  };
}

/**
 * Asserts the buffer contains a crash event carrying the given fingerprint.
 */
export function toHaveCrashWithFingerprint(
  received: unknown,
  fingerprint: string,
): MatcherResultLike {
  if (!isEventArray(received)) {
    return {
      pass: false,
      message: () =>
        `toHaveCrashWithFingerprint: expected an array of captured events, got ${typeof received}`,
    };
  }
  const crashes = received.filter((e) => typeOf(e) === 'crash');
  const found = crashes.filter((e) => fingerprintOf(e) === fingerprint);
  const pass = found.length > 0;
  return {
    pass,
    message: () => {
      if (pass) {
        return `expected NO crash with fingerprint "${fingerprint}", but found ${found.length}`;
      }
      const seen = crashes
        .map((e) => fingerprintOf(e) ?? '<none>')
        .join(', ');
      return crashes.length === 0
        ? `expected a crash with fingerprint "${fingerprint}", but no crash events were captured`
        : `expected a crash with fingerprint "${fingerprint}", but captured crash fingerprints were: ${seen}`;
    },
  };
}

/**
 * Asserts the buffer contains zero unhandled-rejection crash events.
 */
export function toHaveNoUnhandledRejections(
  received: unknown,
): MatcherResultLike {
  if (!isEventArray(received)) {
    return {
      pass: false,
      message: () =>
        `toHaveNoUnhandledRejections: expected an array of captured events, got ${typeof received}`,
    };
  }
  const rejections = received.filter(isUnhandledRejection);
  const pass = rejections.length === 0;
  return {
    pass,
    message: () => {
      if (pass) {
        return `expected at least one unhandled rejection, but found none`;
      }
      const messages = rejections
        .map((e) => {
          const data = e.data as { message?: unknown } | undefined;
          return typeof data?.message === 'string' ? data.message : '<no message>';
        })
        .join('; ');
      return `expected no unhandled rejections, but found ${rejections.length}: ${messages}`;
    },
  };
}

/** The matcher map, shaped for `expect.extend`. */
export const erneMatchers = {
  toHaveEmittedEvent,
  toHaveCrashWithFingerprint,
  toHaveNoUnhandledRejections,
};

/**
 * Registers the ERNE matchers on Jest's `expect`. Call once in a test setup
 * file. No-ops gracefully if `expect.extend` is unavailable.
 */
export function registerMatchers(): void {
  const e = (globalThis as { expect?: { extend?: (m: object) => void } })
    .expect;
  if (e && typeof e.extend === 'function') {
    e.extend(erneMatchers);
  }
}

// ── TypeScript module augmentation ─────────────────────────────────────────
// Makes the matchers visible on `expect(...)` for consumers using Jest's
// types. Augments both the modern `jest` namespace and `expect` namespace.

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      /** Passes when the captured-events buffer contains an event of `type`. */
      toHaveEmittedEvent(type: MonitorEventType): R;
      /** Passes when the buffer contains a crash event with `fingerprint`. */
      toHaveCrashWithFingerprint(fingerprint: string): R;
      /** Passes when the buffer contains zero unhandled-rejection crashes. */
      toHaveNoUnhandledRejections(): R;
    }
  }
}

export {};
