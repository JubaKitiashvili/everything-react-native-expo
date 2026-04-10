import { Fingerprinter, type FingerprintedCrashData } from './Fingerprinter';
import type { MonitorEvent } from '../types';

function crash(
  message: string,
  stack: string | null,
  kind: 'exception' | 'unhandled-rejection' = 'exception',
): MonitorEvent {
  return {
    type: 'crash',
    timestamp: 0,
    wallTime: 0,
    sessionId: 's',
    data: {
      kind,
      message,
      stack,
      componentStack: null,
      isFatal: false,
    },
  };
}

const STACK_A = `TypeError: Cannot read properties of undefined (reading 'name')
    at Profile (app/profile.tsx:42:18)
    at renderWithHooks (node_modules/react/cjs/react.development.js:12345:9)
    at updateFunctionComponent (node_modules/react/cjs/react.development.js:12000:5)
    at Profile.render (app/profile.tsx:30:10)`;

const STACK_A_RELINED = `TypeError: Cannot read properties of undefined (reading 'name')
    at Profile (app/profile.tsx:99:1)
    at renderWithHooks (node_modules/react/cjs/react.development.js:9999:9)
    at updateFunctionComponent (node_modules/react/cjs/react.development.js:8000:5)
    at Profile.render (app/profile.tsx:80:10)`;

const STACK_B = `TypeError: Cannot read properties of undefined (reading 'email')
    at Settings (app/settings.tsx:12:3)
    at renderWithHooks (node_modules/react/cjs/react.development.js:12345:9)`;

describe('Fingerprinter', () => {
  it('returns null for non-crash events', () => {
    const fp = new Fingerprinter();
    const evt: MonitorEvent = {
      type: 'network',
      timestamp: 0,
      wallTime: 0,
      sessionId: 's',
      data: {},
    };
    expect(fp.fingerprint(evt)).toBeNull();
  });

  it('is stable across line-number differences', () => {
    const fp = new Fingerprinter();
    const a = fp.fingerprint(crash('TypeError: foo', STACK_A));
    const b = fp.fingerprint(crash('TypeError: foo', STACK_A_RELINED));
    expect(a).toBe(b);
  });

  it('differentiates crashes in different components', () => {
    const fp = new Fingerprinter();
    const a = fp.fingerprint(crash('TypeError: foo', STACK_A));
    const b = fp.fingerprint(crash('TypeError: foo', STACK_B));
    expect(a).not.toBe(b);
  });

  it('separates exceptions from unhandled rejections even with the same stack', () => {
    const fp = new Fingerprinter();
    const a = fp.fingerprint(crash('TypeError: foo', STACK_A, 'exception'));
    const b = fp.fingerprint(
      crash('TypeError: foo', STACK_A, 'unhandled-rejection'),
    );
    expect(a).not.toBe(b);
  });

  it('handles missing stacks', () => {
    const fp = new Fingerprinter();
    expect(fp.fingerprint(crash('Boom', null))).toBeTruthy();
  });

  it('annotate() attaches the fingerprint to crash data', () => {
    const fp = new Fingerprinter();
    const e = crash('TypeError: foo', STACK_A);
    fp.annotate(e);
    expect((e.data as FingerprintedCrashData).fingerprint).toBeTruthy();
  });
});
