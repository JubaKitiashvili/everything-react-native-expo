import { describe, expect, test } from 'vitest';
import { translateLegacyFrame } from './wsHandler.js';

/**
 * Canonical wire-format ingest tests. The SDK's DashboardBridge ships
 * `{ type:'monitor:event', clientId, event: MonitorEvent }` where
 * `MonitorEvent = { type, timestamp, wallTime, sessionId, data }`. `data`
 * holds the event-specific fields flat; for custom events
 * `data = { name, attributes }`. `translateLegacyFrame` must flatten `data`
 * into the EventRecord `payload` and resolve the EventRecord `type`
 * (promoting `data.name` for custom events) so the dashboard panels — which
 * read a flat payload keyed by top-level type — actually receive data.
 *
 * This path was previously untested, which is why the nesting bug shipped.
 */

const NOW = 1_700_000_000_000;
const now = () => NOW;

/** Shape a real DashboardBridge `monitor:event` frame. */
function bridgeEvent(event: Record<string, unknown>, clientId = 'client-1'): unknown {
  return { type: 'monitor:event', clientId, event };
}

/** Translate + assert the result is the new `{kind:'event', event}` envelope. */
function translateEvent(frame: unknown): {
  type: string;
  severity: string;
  sessionId: string;
  timestamp: number;
  payload: Record<string, unknown>;
  id: string;
} {
  const out = translateLegacyFrame(frame, now) as {
    kind: string;
    event: {
      type: string;
      severity: string;
      sessionId: string;
      timestamp: number;
      payload: Record<string, unknown>;
      id: string;
    };
  };
  expect(out).not.toBeNull();
  expect(out.kind).toBe('event');
  return out.event;
}

describe('translateLegacyFrame — canonical event wire format', () => {
  describe('custom events promote data.name and flatten attributes', () => {
    test('custom/rsc → type:rsc, payload = attributes (flat, not nested under data)', () => {
      const record = translateEvent(
        bridgeEvent({
          type: 'custom',
          timestamp: NOW - 1000,
          wallTime: NOW - 1000,
          sessionId: 'internal-uuid',
          data: {
            name: 'rsc',
            attributes: { kind: 'server-render', routePath: '/x', serverRenderTimeMs: 5 },
          },
        }),
      );

      expect(record.type).toBe('rsc');
      expect(record.payload.kind).toBe('server-render');
      expect(record.payload.routePath).toBe('/x');
      expect(record.payload.serverRenderTimeMs).toBe(5);
      // No nesting: the attributes are AT THE TOP of payload, not under `data`.
      expect(record.payload.data).toBeUndefined();
      expect(record.payload.name).toBeUndefined();
      expect(record.payload.attributes).toBeUndefined();
    });

    test('custom/native_metrics → type:native_metrics, payload carries cpuUsagePercent', () => {
      const record = translateEvent(
        bridgeEvent({
          type: 'custom',
          timestamp: NOW,
          wallTime: NOW,
          sessionId: 'internal-uuid',
          data: {
            name: 'native_metrics',
            attributes: { cpuUsagePercent: 37.2, memoryMb: 412, threadCount: 18 },
          },
        }),
      );

      expect(record.type).toBe('native_metrics');
      expect(record.payload.cpuUsagePercent).toBe(37.2);
      expect(record.payload.memoryMb).toBe(412);
      expect(record.payload.threadCount).toBe(18);
      expect(record.payload.data).toBeUndefined();
    });

    test('custom/hermes_profile_captured → renamed to type:profile (NAME_MAP)', () => {
      const record = translateEvent(
        bridgeEvent({
          type: 'custom',
          timestamp: NOW,
          wallTime: NOW,
          sessionId: 'internal-uuid',
          data: {
            name: 'hermes_profile_captured',
            attributes: { profileId: 'p-1', sampleCount: 9001, durationMs: 1500 },
          },
        }),
      );

      expect(record.type).toBe('profile');
      expect(record.payload.profileId).toBe('p-1');
      expect(record.payload.sampleCount).toBe(9001);
    });

    test('custom event with no/invalid attributes → empty payload object', () => {
      const record = translateEvent(
        bridgeEvent({
          type: 'custom',
          timestamp: NOW,
          wallTime: NOW,
          // No sessionId so __sdkSessionId is not retained — proves the
          // canonical payload from missing attributes is exactly {}.
          data: { name: 'app_opened' },
        }),
      );

      expect(record.type).toBe('app_opened');
      expect(record.payload).toEqual({});
    });

    test('unmapped custom name passes through unchanged', () => {
      const record = translateEvent(
        bridgeEvent({
          type: 'custom',
          timestamp: NOW,
          wallTime: NOW,
          sessionId: 'internal-uuid',
          data: { name: 'checkout_completed', attributes: { cartValue: 99 } },
        }),
      );

      expect(record.type).toBe('checkout_completed');
      expect(record.payload.cartValue).toBe(99);
    });
  });

  describe('non-custom events map type and flatten data', () => {
    test('crash → type:crash, payload.stack present (NOT payload.data.stack)', () => {
      const record = translateEvent(
        bridgeEvent({
          type: 'crash',
          timestamp: NOW,
          wallTime: NOW,
          sessionId: 'internal-uuid',
          data: {
            kind: 'exception',
            message: "TypeError: undefined is not an object",
            stack: 'TypeError\n  at Foo.render (Foo.tsx:12)',
            breadcrumbs: [{ category: 'nav', message: 'to /checkout' }],
            isFatal: true,
          },
        }),
      );

      expect(record.type).toBe('crash');
      expect(record.severity).toBe('critical');
      // The stack must be promoted to the TOP of payload — not buried.
      expect(record.payload.stack).toBe('TypeError\n  at Foo.render (Foo.tsx:12)');
      expect(record.payload.message).toBe("TypeError: undefined is not an object");
      expect(record.payload.breadcrumbs).toEqual([{ category: 'nav', message: 'to /checkout' }]);
      // No double nesting.
      expect(record.payload.data).toBeUndefined();
    });

    test('navigation → type:breadcrumb with category:nav default', () => {
      const record = translateEvent(
        bridgeEvent({
          type: 'navigation',
          timestamp: NOW,
          wallTime: NOW,
          sessionId: 'internal-uuid',
          data: { screen: '/home', previousScreen: null, source: 'expo-router', durationMs: 120 },
        }),
      );

      expect(record.type).toBe('breadcrumb');
      expect(record.payload.category).toBe('nav');
      expect(record.payload.screen).toBe('/home');
    });

    test('render → type:performance (TYPE_MAP)', () => {
      const record = translateEvent(
        bridgeEvent({
          type: 'render',
          timestamp: NOW,
          wallTime: NOW,
          sessionId: 'internal-uuid',
          data: { componentName: 'Feed', renderCount: 3, totalDurationMs: 50 },
        }),
      );

      expect(record.type).toBe('performance');
      expect(record.payload.componentName).toBe('Feed');
      expect(record.payload.renderCount).toBe(3);
    });

    test('network with a 5xx statusCode → severity warning', () => {
      const record = translateEvent(
        bridgeEvent({
          type: 'network',
          timestamp: NOW,
          wallTime: NOW,
          sessionId: 'internal-uuid',
          data: {
            url: 'https://api.example.com/v1/feed',
            method: 'GET',
            statusCode: 503,
            durationMs: 980,
            transport: 'fetch',
          },
        }),
      );

      expect(record.type).toBe('network');
      expect(record.severity).toBe('warning');
      // statusCode (NOT `status`) is the confirmed NetworkCollector field,
      // sitting flat at the top of payload after flattening.
      expect(record.payload.statusCode).toBe(503);
    });

    test('network with a 2xx statusCode → severity info', () => {
      const record = translateEvent(
        bridgeEvent({
          type: 'network',
          timestamp: NOW,
          wallTime: NOW,
          sessionId: 'internal-uuid',
          data: { url: 'https://api.example.com/ok', method: 'GET', statusCode: 200, durationMs: 40 },
        }),
      );

      expect(record.severity).toBe('info');
    });

    test('unknown envelope type passes through unchanged', () => {
      const record = translateEvent(
        bridgeEvent({
          type: 'anr',
          timestamp: NOW,
          wallTime: NOW,
          sessionId: 'internal-uuid',
          data: { durationMs: 8200, stackHead: 'Checkout.finalize()' },
        }),
      );

      expect(record.type).toBe('anr');
      expect(record.payload.durationMs).toBe(8200);
    });
  });

  describe('session attribution + debug retention', () => {
    test('sessionId derives from clientId as sdk-<clientId>', () => {
      const record = translateEvent(
        bridgeEvent(
          {
            type: 'custom',
            timestamp: NOW,
            wallTime: NOW,
            sessionId: 'internal-uuid-xyz',
            data: { name: 'rsc', attributes: { kind: 'payload', routePath: '/a' } },
          },
          'abc-123',
        ),
      );

      expect(record.sessionId).toBe('sdk-abc-123');
    });

    test('original SDK sessionId retained as payload.__sdkSessionId', () => {
      const record = translateEvent(
        bridgeEvent({
          type: 'crash',
          timestamp: NOW,
          wallTime: NOW,
          sessionId: 'internal-uuid-xyz',
          data: { message: 'boom', stack: 's' },
        }),
      );

      expect(record.payload.__sdkSessionId).toBe('internal-uuid-xyz');
    });

    test('deterministic id is stable across identical retried frames', () => {
      const frame = bridgeEvent({
        type: 'custom',
        timestamp: NOW,
        wallTime: NOW,
        sessionId: 'internal-uuid',
        data: { name: 'rsc', attributes: { kind: 'reload', routePath: '/a', reloadDurationMs: 9 } },
      });

      const a = translateEvent(frame);
      const b = translateEvent(frame);
      expect(a.id).toBe(b.id);
      expect(a.id).toMatch(/^ev_[0-9a-f]{16}$/);
    });

    test('missing timestamp falls back to now()', () => {
      const record = translateEvent(
        bridgeEvent({
          type: 'custom',
          wallTime: NOW,
          sessionId: 'internal-uuid',
          data: { name: 'app_opened' },
        }),
      );

      expect(record.timestamp).toBe(NOW);
    });
  });

  describe('monitor:hello passthrough is unaffected', () => {
    test('hello frame still translates to a session', () => {
      const out = translateLegacyFrame(
        {
          type: 'monitor:hello',
          clientId: 'client-9',
          device: { platform: 'ios', appVersion: '3.1.4' },
        },
        now,
      ) as { kind: string; session: { id: string; platform?: string; appVersion?: string } };

      expect(out.kind).toBe('hello');
      expect(out.session.id).toBe('sdk-client-9');
      expect(out.session.platform).toBe('ios');
    });
  });

  describe('non-legacy frames return null (already-canonical / unknown)', () => {
    test('new-protocol {kind:event} frame is left alone', () => {
      const out = translateLegacyFrame(
        { kind: 'event', event: { type: 'custom', sessionId: 's', payload: { x: 1 } } },
        now,
      );
      expect(out).toBeNull();
    });

    test('monitor:event with non-string event.type returns null', () => {
      const out = translateLegacyFrame(
        bridgeEvent({ timestamp: NOW, sessionId: 's', data: {} }),
        now,
      );
      expect(out).toBeNull();
    });

    test('non-object input returns null', () => {
      expect(translateLegacyFrame(null, now)).toBeNull();
      expect(translateLegacyFrame(42, now)).toBeNull();
    });
  });
});
