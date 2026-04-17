import { describe, expect, test } from 'vitest';
import { computeFallbackFingerprint, djb2, normaliseStack } from './fingerprint.js';

describe('computeFallbackFingerprint', () => {
  test('collapses variable memory addresses + line/column numbers so the same bug clusters', () => {
    const a = computeFallbackFingerprint({
      type: 'crash',
      severity: 'critical',
      payload: {
        message: 'TypeError: cannot read property id',
        stack:
          'TypeError: cannot read property id\n' +
          '    at UserList.render (App.tsx:128:12) 0xdeadbeef\n' +
          '    at Array.map (<anonymous>)',
      },
    });
    const b = computeFallbackFingerprint({
      type: 'crash',
      severity: 'critical',
      payload: {
        message: 'TypeError: cannot read property id',
        stack:
          'TypeError: cannot read property id\n' +
          '    at UserList.render (App.tsx:255:3) 0xcafed00d\n' +
          '    at Array.map (<anonymous>)',
      },
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-z0-9]+$/);
  });

  test('produces a different hash when the top frame actually changes', () => {
    const a = computeFallbackFingerprint({
      type: 'crash',
      severity: 'critical',
      payload: {
        message: 'TypeError: cannot read property id',
        stack: 'at UserList.render',
      },
    });
    const b = computeFallbackFingerprint({
      type: 'crash',
      severity: 'critical',
      payload: {
        message: 'TypeError: cannot read property id',
        stack: 'at UserDetail.render',
      },
    });
    expect(a).not.toBe(b);
  });

  test('djb2 is deterministic and base36-encoded', () => {
    expect(djb2('hello')).toBe(djb2('hello'));
    expect(djb2('hello')).toMatch(/^[a-z0-9]+$/);
  });

  test('normaliseStack keeps only the first five frames', () => {
    const stack = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s) => `    at ${s}`).join('\n');
    expect(normaliseStack(stack).split('|')).toHaveLength(5);
  });
});
