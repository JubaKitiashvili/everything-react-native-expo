// Task 117.56 — CCPA "Do Not Sell" signal + CA disclosure tests.
//
// Strategy mirrors the 117.95 red-team approach: build a realistic OUTBOUND
// (enriched) event, run it through the gate, and assert on the SERIALIZED
// wire payload — the exact `JSON.stringify({ id, events, sentAt })` shape the
// BatchTransport ships. With Do-Not-Sell OFF, identifiers must survive
// (collection as normal). With it ON, identifiers / tracking data must be
// gone from the serialized payload, while operational telemetry survives.

import {
  CcpaGate,
  applyDoNotSell,
  type CcpaState,
} from './CcpaGate';
import type { EnrichedEvent } from './Enricher';

const REDACTED = '[REDACTED]';

const USER_ID = 'user-1234-opaque';
const DEVICE_MODEL = 'iPhone15,3';
const DEVICE_LOCALE = 'en-US';
const DIM_PLAN = 'enterprise-tier';
const DIM_COHORT = 'beta-cohort-7';
const CUSTOM_ATTR_VALUE = 'checkout-button-blue';

/**
 * Builds a realistic enriched event carrying every identifier / tracking
 * field the gate is responsible for, plus operational telemetry that must
 * always survive. `type`/`data` overridable for per-test shaping.
 */
function makeEnriched(
  overrides: Partial<EnrichedEvent> = {},
): EnrichedEvent {
  return {
    type: 'custom',
    timestamp: 123,
    wallTime: 1_716_800_000_000,
    sessionId: 'sess-abc',
    data: {
      name: 'cta_clicked',
      attributes: { variant: CUSTOM_ATTR_VALUE, durationMs: 42 },
    },
    context: {
      device: {
        platform: 'ios',
        osVersion: '17.4',
        model: DEVICE_MODEL,
        isEmulator: false,
        screenWidth: 393,
        screenHeight: 852,
        locale: DEVICE_LOCALE,
      },
      app: { version: '2.1.0', buildNumber: '210', bundleId: 'com.acme.app' },
      session: { id: 'sess-abc', durationMs: 5000 },
      connectionType: 'wifi',
      memory: { usedBytes: 100, totalBytes: 1000 },
      userId: USER_ID,
    },
    dimensions: { plan: DIM_PLAN, cohort: DIM_COHORT },
    ...overrides,
  };
}

/** Reproduce the exact wire serialization the transport performs. */
function serializedOutbound(event: EnrichedEvent): string {
  return JSON.stringify({ id: 'batch-1', events: [event], sentAt: 1 });
}

describe('CcpaGate — applyDoNotSell (pure transform)', () => {
  describe('Do-Not-Sell OFF — identifiers flow as today', () => {
    it('returns the event unchanged (referential identity)', () => {
      const event = makeEnriched();
      const out = applyDoNotSell(event, false);
      expect(out).toBe(event);
    });

    it('serialized payload still contains all identifiers + tracking data', () => {
      const wire = serializedOutbound(applyDoNotSell(makeEnriched(), false));
      expect(wire).toContain(USER_ID);
      expect(wire).toContain(DEVICE_MODEL);
      expect(wire).toContain(DEVICE_LOCALE);
      expect(wire).toContain(DIM_PLAN);
      expect(wire).toContain(DIM_COHORT);
      expect(wire).toContain(CUSTOM_ATTR_VALUE);
      // No spurious redaction marker.
      expect(wire).not.toContain(REDACTED);
    });
  });

  describe('Do-Not-Sell ON — identifiers / tracking suppressed', () => {
    it('strips every identifier + tracking value from the serialized payload', () => {
      const wire = serializedOutbound(applyDoNotSell(makeEnriched(), true));
      for (const secret of [
        USER_ID,
        DEVICE_MODEL,
        DEVICE_LOCALE,
        DIM_PLAN,
        DIM_COHORT,
        CUSTOM_ATTR_VALUE,
      ]) {
        if (wire.includes(secret)) {
          throw new Error(
            `Do-Not-Sell leaked "${secret}" into the outbound payload:\n${wire}`,
          );
        }
        expect(wire).not.toContain(secret);
      }
    });

    it('nulls the user id and redacts device model + locale', () => {
      const out = applyDoNotSell(makeEnriched(), true);
      expect(out.context.userId).toBeNull();
      expect(out.context.device.model).toBe(REDACTED);
      expect(out.context.device.locale).toBe(REDACTED);
    });

    it('drops the dimensions field entirely', () => {
      const out = applyDoNotSell(makeEnriched(), true);
      expect('dimensions' in out).toBe(false);
      expect(out.dimensions).toBeUndefined();
    });

    it('redacts custom event attributes but preserves the event name + keys', () => {
      const out = applyDoNotSell(makeEnriched(), true);
      const data = out.data as {
        name: string;
        attributes: Record<string, unknown>;
      };
      expect(data.name).toBe('cta_clicked');
      // Keys preserved (so counts / schema survive), values redacted.
      expect(Object.keys(data.attributes).sort()).toEqual([
        'durationMs',
        'variant',
      ]);
      expect(data.attributes.variant).toBe(REDACTED);
      expect(data.attributes.durationMs).toBe(REDACTED);
    });

    it('preserves operational telemetry (app/session/connection/memory)', () => {
      const out = applyDoNotSell(makeEnriched(), true);
      expect(out.context.app).toEqual({
        version: '2.1.0',
        buildNumber: '210',
        bundleId: 'com.acme.app',
      });
      expect(out.context.session).toEqual({ id: 'sess-abc', durationMs: 5000 });
      expect(out.context.connectionType).toBe('wifi');
      expect(out.context.memory).toEqual({ usedBytes: 100, totalBytes: 1000 });
      // Device platform/os/screen are diagnostic, not identifying — retained.
      expect(out.context.device.platform).toBe('ios');
      expect(out.context.device.osVersion).toBe('17.4');
    });

    it('does not mutate the input event (pure)', () => {
      const event = makeEnriched();
      applyDoNotSell(event, true);
      expect(event.context.userId).toBe(USER_ID);
      expect(event.context.device.model).toBe(DEVICE_MODEL);
      expect(event.dimensions).toEqual({ plan: DIM_PLAN, cohort: DIM_COHORT });
    });

    it('leaves a crash event payload intact (operational, identifiers still stripped)', () => {
      const crash = makeEnriched({
        type: 'crash',
        data: {
          kind: 'exception',
          message: 'TypeError: undefined is not a function',
          stack: 'at foo (App.tsx:10)',
          isFatal: true,
        },
        dimensions: undefined,
      });
      delete (crash as { dimensions?: unknown }).dimensions;
      const out = applyDoNotSell(crash, true);
      const data = out.data as { message: string; stack: string };
      // Crash diagnostics survive untouched...
      expect(data.message).toBe('TypeError: undefined is not a function');
      expect(data.stack).toBe('at foo (App.tsx:10)');
      // ...but the identifier in the context envelope is still stripped.
      expect(out.context.userId).toBeNull();
      expect(out.context.device.model).toBe(REDACTED);
    });

    it('handles a custom event with no attributes gracefully', () => {
      const event = makeEnriched({
        data: { name: 'screen_view' },
        dimensions: undefined,
      });
      delete (event as { dimensions?: unknown }).dimensions;
      const out = applyDoNotSell(event, true);
      expect((out.data as { name: string }).name).toBe('screen_view');
    });
  });
});

describe('CcpaGate — class state + toggle', () => {
  it('defaults to Do-Not-Sell OFF', () => {
    const gate = new CcpaGate();
    expect(gate.isDoNotSell()).toBe(false);
    expect(gate.getState()).toEqual({ doNotSell: false });
  });

  it('honors a default-on initial value', () => {
    const gate = new CcpaGate({ doNotSell: true });
    expect(gate.isDoNotSell()).toBe(true);
  });

  it('process() is a no-op while OFF and redacts after toggling ON', async () => {
    const gate = new CcpaGate();
    const before = gate.process(makeEnriched());
    expect(before.context.userId).toBe(USER_ID);

    await gate.setDoNotSell(true);
    expect(gate.isDoNotSell()).toBe(true);
    const after = gate.process(makeEnriched());
    expect(after.context.userId).toBeNull();
    expect(after.context.device.model).toBe(REDACTED);
  });

  it('can be toggled back OFF (resumes normal collection)', async () => {
    const gate = new CcpaGate({ doNotSell: true });
    await gate.setDoNotSell(false);
    const out = gate.process(makeEnriched());
    expect(out.context.userId).toBe(USER_ID);
  });

  it('persists the signal via the store', async () => {
    let saved: CcpaState | null = null;
    const gate = new CcpaGate({
      store: {
        load: () => saved,
        save: (s) => {
          saved = s;
        },
      },
    });
    await gate.setDoNotSell(true);
    expect(saved).toEqual({ doNotSell: true });
  });

  it('hydrate() loads a persisted opt-out', async () => {
    const gate = new CcpaGate({
      store: {
        load: () => ({ doNotSell: true }),
        save: () => {},
      },
    });
    await gate.hydrate();
    expect(gate.isDoNotSell()).toBe(true);
  });

  it('onChange fires on setDoNotSell', async () => {
    const gate = new CcpaGate();
    const states: CcpaState[] = [];
    const unsub = gate.onChange((s) => states.push(s));
    await gate.setDoNotSell(true);
    expect(states).toEqual([{ doNotSell: true }]);
    unsub();
    await gate.setDoNotSell(false);
    expect(states).toHaveLength(1); // unsubscribed
  });

  it('a throwing listener never breaks enforcement', async () => {
    const gate = new CcpaGate();
    gate.onChange(() => {
      throw new Error('boom');
    });
    await expect(gate.setDoNotSell(true)).resolves.toBeUndefined();
    expect(gate.isDoNotSell()).toBe(true);
  });
});

describe('CcpaGate — disclosure accessor', () => {
  it('returns a well-formed CA disclosure (static)', () => {
    const d = CcpaGate.disclosure();
    expect(d.jurisdiction).toBe('US-CA');
    expect(d.regulations).toEqual(
      expect.arrayContaining([
        'California Consumer Privacy Act (CCPA)',
        'California Privacy Rights Act (CPRA)',
      ]),
    );
    expect(d.doNotSellStatement.toLowerCase()).toContain(
      'do not sell',
    );
    expect(d.doNotSellEnabled).toBe(false);
    expect(d.whenDoNotSellEnabled).toMatch(/identifiers|profiling|removed/i);
  });

  it('enumerates data categories with purposes and suppression flags', () => {
    const d = CcpaGate.disclosure();
    expect(d.categories.length).toBeGreaterThanOrEqual(3);
    const ids = d.categories.map((c) => c.id);
    expect(ids).toContain('identifiers');
    expect(ids).toContain('usage-and-profiling');
    expect(ids).toContain('device-and-diagnostics');

    for (const cat of d.categories) {
      expect(typeof cat.label).toBe('string');
      expect(cat.label.length).toBeGreaterThan(0);
      expect(Array.isArray(cat.examples)).toBe(true);
      expect(cat.examples.length).toBeGreaterThan(0);
      expect(typeof cat.purpose).toBe('string');
      expect(cat.purpose.length).toBeGreaterThan(0);
      expect(typeof cat.suppressedByDoNotSell).toBe('boolean');
    }

    // The identifier + profiling categories are the ones the gate suppresses;
    // diagnostics are retained.
    const byId = Object.fromEntries(d.categories.map((c) => [c.id, c]));
    expect(byId['identifiers']?.suppressedByDoNotSell).toBe(true);
    expect(byId['usage-and-profiling']?.suppressedByDoNotSell).toBe(true);
    expect(byId['device-and-diagnostics']?.suppressedByDoNotSell).toBe(false);
  });

  it('reflects the live Do-Not-Sell state on the instance', () => {
    const gate = new CcpaGate({ doNotSell: true });
    expect(gate.disclosure().doNotSellEnabled).toBe(true);
    const off = new CcpaGate();
    expect(off.disclosure().doNotSellEnabled).toBe(false);
  });

  it('disclosure is frozen / not mutable by callers', () => {
    const d = CcpaGate.disclosure();
    expect(Object.isFrozen(d.categories)).toBe(true);
    expect(Object.isFrozen(d.categories[0])).toBe(true);
  });
});
