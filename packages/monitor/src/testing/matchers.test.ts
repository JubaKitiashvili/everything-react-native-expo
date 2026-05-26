import {
  erneMatchers,
  registerMatchers,
  toHaveEmittedEvent,
  toHaveCrashWithFingerprint,
  toHaveNoUnhandledRejections,
} from './matchers';
import type { MonitorEvent } from '../types';

registerMatchers();

function navEvent(): MonitorEvent {
  return {
    type: 'navigation',
    timestamp: 1,
    wallTime: 1,
    sessionId: 's',
    data: { screen: 'Home', previousScreen: null, source: 'manual', durationMs: 0 },
  };
}

function crashEvent(fingerprint?: string, kind: 'exception' | 'unhandled-rejection' = 'exception'): MonitorEvent {
  return {
    type: 'crash',
    timestamp: 1,
    wallTime: 1,
    sessionId: 's',
    data: {
      kind,
      message: 'boom',
      stack: null,
      componentStack: null,
      isFatal: true,
      ...(fingerprint !== undefined ? { fingerprint } : {}),
    },
  };
}

describe('erne jest matchers', () => {
  describe('toHaveEmittedEvent', () => {
    it('passes when the type is present', () => {
      const events = [navEvent(), crashEvent()];
      expect(events).toHaveEmittedEvent('navigation');
      expect(events).toHaveEmittedEvent('crash');
    });

    it('fails when the type is absent', () => {
      expect([navEvent()]).not.toHaveEmittedEvent('render');
    });

    it('returns pass/fail and messages directly', () => {
      const pass = toHaveEmittedEvent([navEvent()], 'navigation');
      expect(pass.pass).toBe(true);
      const fail = toHaveEmittedEvent([navEvent()], 'render');
      expect(fail.pass).toBe(false);
      expect(fail.message()).toMatch(/include a "render" event/);
      expect(fail.message()).toMatch(/navigation×1/);
    });

    it('fails cleanly on a non-array received value', () => {
      const result = toHaveEmittedEvent('nope' as unknown, 'crash');
      expect(result.pass).toBe(false);
      expect(result.message()).toMatch(/expected an array/);
    });
  });

  describe('toHaveCrashWithFingerprint', () => {
    it('passes when a crash carries the fingerprint on data', () => {
      const events = [navEvent(), crashEvent('fp-123')];
      expect(events).toHaveCrashWithFingerprint('fp-123');
    });

    it('reads a top-level fingerprint on hand-built fixtures', () => {
      const event = { type: 'crash', fingerprint: 'top-fp', data: {} };
      const result = toHaveCrashWithFingerprint([event], 'top-fp');
      expect(result.pass).toBe(true);
    });

    it('fails when no crash matches the fingerprint', () => {
      const events = [crashEvent('other-fp')];
      const result = toHaveCrashWithFingerprint(events, 'fp-123');
      expect(result.pass).toBe(false);
      expect(result.message()).toMatch(/captured crash fingerprints were: other-fp/);
      expect(events).not.toHaveCrashWithFingerprint('fp-123');
    });

    it('reports when no crashes were captured at all', () => {
      const result = toHaveCrashWithFingerprint([navEvent()], 'fp-123');
      expect(result.pass).toBe(false);
      expect(result.message()).toMatch(/no crash events were captured/);
    });
  });

  describe('toHaveNoUnhandledRejections', () => {
    it('passes when there are no unhandled rejections', () => {
      const events = [navEvent(), crashEvent('fp', 'exception')];
      expect(events).toHaveNoUnhandledRejections();
    });

    it('fails when an unhandled rejection is present', () => {
      const events = [crashEvent(undefined, 'unhandled-rejection')];
      const result = toHaveNoUnhandledRejections(events);
      expect(result.pass).toBe(false);
      expect(result.message()).toMatch(/found 1: boom/);
      expect(events).not.toHaveNoUnhandledRejections();
    });

    it('ignores non-crash events', () => {
      expect([navEvent()]).toHaveNoUnhandledRejections();
    });
  });

  describe('registration surface', () => {
    it('exposes all three matchers in the map', () => {
      expect(Object.keys(erneMatchers).sort()).toEqual([
        'toHaveCrashWithFingerprint',
        'toHaveEmittedEvent',
        'toHaveNoUnhandledRejections',
      ]);
    });

    it('registerMatchers is idempotent and safe to call again', () => {
      expect(() => registerMatchers()).not.toThrow();
    });
  });
});
