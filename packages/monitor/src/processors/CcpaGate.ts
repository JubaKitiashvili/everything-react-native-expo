// Task 117.56 — CCPA "Do Not Sell My Personal Information" signal + California
// (CCPA/CPRA) disclosure metadata for the SDK.
//
// WHAT THIS IS
// ------------
// CCPA/CPRA gives California residents the right to opt out of the "sale" or
// "sharing" of their personal information. For an analytics/observability SDK,
// the relevant levers are the cross-context IDENTIFIERS and PROFILING /
// TRACKING data that could constitute "sale/sharing" when forwarded to a
// backend or third party:
//
//   - the opaque user id attached by `monitor.setUserId()`
//   - device identifiers / fingerprinting vectors (model, locale)
//   - custom user properties / slicing dimensions (profiling data)
//   - the attribute payload of `custom` analytics events (tracking data)
//
// When Do-Not-Sell is ON, this gate strips exactly those fields from the
// OUTBOUND (enriched) event while leaving operational telemetry — crash,
// network, navigation, render, performance signals — intact. This is a real
// enforcement gate, not a stored flag: the redaction runs on every event in
// the pipeline before it reaches the store / transport.
//
// WHY IT GATES THE ENRICHED EVENT (not the raw event)
// ---------------------------------------------------
// Identifiers live in the CONTEXT envelope that the Enricher attaches AFTER
// the Sanitizer runs (`context.userId`, `context.device.*`) plus the
// `dimensions` field. The Sanitizer (PII scrub) never sees that envelope, so
// the CCPA gate must run on the enriched event — right before persistence /
// transport — to catch identifiers at the point they'd actually leave the
// device. See createMonitorRuntime's pipeline.

import type { EnrichedEvent } from './Enricher';

const REDACTED = '[REDACTED]';

/** Runtime Do-Not-Sell state, persisted across sessions when a store is set. */
export interface CcpaState {
  /**
   * California "Do Not Sell My Personal Information" signal. When true, the
   * gate strips identifiers / tracking data from outbound events. Default
   * false (collection as normal) unless a config opts to default-on.
   */
  doNotSell: boolean;
}

/** Persistent store for the Do-Not-Sell signal across app launches. */
export interface CcpaStore {
  load(): Promise<CcpaState | null> | CcpaState | null;
  save(state: CcpaState): Promise<void> | void;
}

export interface CcpaGateOptions {
  /** Initial Do-Not-Sell value. Defaults to false (collect as normal). */
  doNotSell?: boolean;
  /** Optional persistence for the signal across sessions. */
  store?: CcpaStore;
}

/** A single category of personal information disclosed under CCPA §1798.110. */
export interface CcpaDataCategory {
  /** Stable machine id for the category. */
  readonly id: string;
  /** Human-readable label for a privacy screen. */
  readonly label: string;
  /** Concrete examples of fields collected in this category. */
  readonly examples: readonly string[];
  /** Business / commercial purpose for collecting it. */
  readonly purpose: string;
  /**
   * Whether this category carries cross-context identifiers / profiling data
   * that the Do-Not-Sell signal suppresses when enabled.
   */
  readonly suppressedByDoNotSell: boolean;
}

/** Structured CA-specific disclosure the host app can surface in its UI. */
export interface CcpaDisclosure {
  /** Jurisdiction this disclosure addresses. */
  readonly jurisdiction: 'US-CA';
  /** The statutes this disclosure is modeled on. */
  readonly regulations: readonly string[];
  /**
   * Verbatim "Do Not Sell" / "Do Not Share" statement for display. The SDK
   * does not sell personal information to third parties; it forwards
   * telemetry to the app's own configured backend for operational purposes.
   */
  readonly doNotSellStatement: string;
  /** Categories of personal information the SDK may collect. */
  readonly categories: readonly CcpaDataCategory[];
  /** Whether the Do-Not-Sell signal is currently enabled. */
  readonly doNotSellEnabled: boolean;
  /** Plain-language summary of what enabling Do-Not-Sell suppresses. */
  readonly whenDoNotSellEnabled: string;
}

/**
 * Static catalogue of the personal-information categories an analytics /
 * observability SDK touches. Derived (not collected live) — safe to surface
 * verbatim in a privacy screen. Frozen so callers can't mutate the shared
 * disclosure.
 */
const DATA_CATEGORIES: readonly CcpaDataCategory[] = Object.freeze([
  Object.freeze({
    id: 'identifiers',
    label: 'Identifiers',
    examples: Object.freeze([
      'opaque user id (set by the app)',
      'session id',
      'device model',
      'device locale',
    ]),
    purpose:
      'Associating diagnostic events with a session / user so engineers can ' +
      'reproduce and fix bugs the user encountered.',
    suppressedByDoNotSell: true,
  }),
  Object.freeze({
    id: 'usage-and-profiling',
    label: 'Commercial / usage information & inferences',
    examples: Object.freeze([
      'custom user properties (e.g. plan tier, cohort)',
      'custom analytics event attributes',
      'screens viewed',
    ]),
    purpose:
      'Product analytics and audience segmentation. This is the profiling / ' +
      'tracking data the Do-Not-Sell signal removes.',
    suppressedByDoNotSell: true,
  }),
  Object.freeze({
    id: 'device-and-diagnostics',
    label: 'Device & diagnostic information',
    examples: Object.freeze([
      'crash stack traces',
      'performance metrics (frame drops, render timings, memory)',
      'network request timings and status codes (URLs and headers are PII-scrubbed)',
      'OS version, app version',
    ]),
    purpose:
      'Crash reporting and performance monitoring to keep the app stable and ' +
      'fast. Retained even under Do-Not-Sell because it is operational, not ' +
      'identifying, once identifiers are stripped.',
    suppressedByDoNotSell: false,
  }),
]);

const DO_NOT_SELL_STATEMENT =
  'We do not sell your personal information. Telemetry collected by this app ' +
  'is used for crash reporting, performance monitoring, and product analytics, ' +
  'and is sent only to the app operator’s own systems. You may opt out of ' +
  'the sale or sharing of your personal information at any time; doing so ' +
  'removes identifiers and profiling data from the telemetry we collect.';

const WHEN_ENABLED_SUMMARY =
  'Your opaque user id, device model, device locale, custom user properties, ' +
  'and custom event attributes are removed from outbound telemetry. ' +
  'Anonymous operational diagnostics (crashes, performance, network timings) ' +
  'continue so the app stays stable.';

/**
 * Pure transform: returns a copy of the enriched event with all CCPA
 * "Do Not Sell" identifiers / tracking data redacted. Returns the input
 * unchanged when `doNotSell` is false.
 *
 * Exposed as a free function so it can be unit-tested in isolation and reused
 * by any transport / exporter, independent of the gate's mutable state.
 *
 * Suppressed when Do-Not-Sell is ON:
 *   - context.userId           → null
 *   - context.device.model     → '[REDACTED]'
 *   - context.device.locale    → '[REDACTED]'
 *   - dimensions               → removed entirely
 *   - custom event attributes  → '[REDACTED]' per attribute (name preserved)
 *
 * Never touched (operational telemetry retained):
 *   - the event type / timestamp / sessionId
 *   - crash / network / navigation / render / perf payloads
 *   - context.app, context.session, context.connectionType, context.memory
 */
export function applyDoNotSell(
  event: EnrichedEvent,
  doNotSell: boolean,
): EnrichedEvent {
  if (!doNotSell) return event;

  const next: EnrichedEvent = {
    ...event,
    context: {
      ...event.context,
      userId: null,
      device: {
        ...event.context.device,
        model: REDACTED,
        locale: REDACTED,
      },
    },
  };

  // Drop the profiling/slicing dimensions entirely.
  if ('dimensions' in next) {
    delete (next as { dimensions?: unknown }).dimensions;
  }

  // Redact the attribute payload of analytics ("custom") events — these are
  // app-defined tracking values. Keep the event name + shape so non-tracking
  // consumers and counts still work.
  if (next.type === 'custom' && isRecord(next.data)) {
    const data = next.data as { name?: unknown; attributes?: unknown };
    if (isRecord(data.attributes)) {
      const redactedAttributes: Record<string, unknown> = {};
      for (const key of Object.keys(data.attributes)) {
        redactedAttributes[key] = REDACTED;
      }
      next.data = { ...data, attributes: redactedAttributes };
    }
  }

  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * CcpaGate owns the runtime Do-Not-Sell signal and applies it to outbound
 * events. Mirrors ConsentGate's conventions (hydrate / getState / onChange /
 * persistent store) so the two privacy controls feel consistent.
 *
 * Unlike ConsentGate (which BUFFERS until consent is granted), the CCPA gate
 * never blocks the event stream — operational telemetry must keep flowing.
 * Instead it REDACTS identifiers / tracking data from each event as it passes.
 */
export class CcpaGate {
  private state: CcpaState;
  private readonly store: CcpaStore | undefined;
  private readonly listeners = new Set<(s: CcpaState) => void>();
  private hydrated = false;

  constructor(options: CcpaGateOptions = {}) {
    this.state = { doNotSell: options.doNotSell ?? false };
    this.store = options.store;
  }

  /** Loads any persisted Do-Not-Sell signal. Idempotent. */
  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    if (this.store) {
      const loaded = await this.store.load();
      if (loaded && typeof loaded.doNotSell === 'boolean') {
        this.state = { doNotSell: loaded.doNotSell };
      }
    }
    this.hydrated = true;
  }

  /** Whether the Do-Not-Sell signal is currently on. */
  isDoNotSell(): boolean {
    return this.state.doNotSell;
  }

  getState(): CcpaState {
    return { ...this.state };
  }

  /**
   * Sets the Do-Not-Sell signal, persists it (when a store is set), and
   * notifies listeners. No-op listeners fire even when the value is unchanged
   * so a privacy UI can rely on the callback.
   */
  async setDoNotSell(value: boolean): Promise<void> {
    this.state = { doNotSell: Boolean(value) };
    if (this.store) await this.store.save(this.state);
    for (const listener of [...this.listeners]) {
      try {
        listener(this.getState());
      } catch {
        // swallow — a bad listener must never break privacy enforcement
      }
    }
  }

  onChange(cb: (state: CcpaState) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /**
   * Applies the current Do-Not-Sell state to an outbound enriched event.
   * Pure with respect to state — returns the input unchanged when the signal
   * is off.
   */
  process(event: EnrichedEvent): EnrichedEvent {
    return applyDoNotSell(event, this.state.doNotSell);
  }

  /**
   * Returns the CA-specific disclosure metadata for surfacing in a privacy
   * screen. Reflects the current Do-Not-Sell state. Static category data is
   * frozen and safe to render verbatim.
   */
  disclosure(): CcpaDisclosure {
    return CcpaGate.disclosure(this.state.doNotSell);
  }

  /**
   * Static disclosure accessor — usable before a runtime is constructed
   * (e.g. a standalone "Privacy" screen). `doNotSellEnabled` defaults to
   * false; pass the current signal to reflect live state.
   */
  static disclosure(doNotSellEnabled: boolean = false): CcpaDisclosure {
    return {
      jurisdiction: 'US-CA',
      regulations: Object.freeze([
        'California Consumer Privacy Act (CCPA)',
        'California Privacy Rights Act (CPRA)',
      ]),
      doNotSellStatement: DO_NOT_SELL_STATEMENT,
      categories: DATA_CATEGORIES,
      doNotSellEnabled,
      whenDoNotSellEnabled: WHEN_ENABLED_SUMMARY,
    };
  }
}
