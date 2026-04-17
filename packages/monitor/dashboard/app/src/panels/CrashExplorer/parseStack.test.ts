import { describe, expect, test } from 'vitest';
import { parseStack } from './parseStack';

describe('parseStack', () => {
  test('extracts the message and standard `at fn (loc)` frames', () => {
    const stack = [
      "TypeError: cannot read property 'id' of undefined",
      '    at UserList.render (App.tsx:128:12)',
      '    at Array.map (<anonymous>)',
      '    at processChildren (react.js:512:8)',
    ].join('\n');

    const parsed = parseStack(stack);
    expect(parsed.message).toBe("TypeError: cannot read property 'id' of undefined");
    expect(parsed.frames).toHaveLength(3);
    expect(parsed.frames[0]).toEqual({
      symbol: 'UserList.render',
      location: 'App.tsx:128:12',
      resolved: true,
    });
    expect(parsed.frames[1]).toEqual({
      symbol: 'Array.map',
      location: '<anonymous>',
      resolved: true,
    });
  });

  test('accepts location-only frames and marks their symbol as <anonymous>', () => {
    const stack = [
      'Error: ouch',
      '    at node_modules/react-native/Libraries/Core/ErrorUtils.js:30:21',
    ].join('\n');
    const parsed = parseStack(stack);
    expect(parsed.frames).toEqual([
      {
        symbol: '<anonymous>',
        location: 'node_modules/react-native/Libraries/Core/ErrorUtils.js:30:21',
        resolved: true,
      },
    ]);
  });

  test('preserves unrecognised lines as unresolved frames so nothing is silently lost', () => {
    const stack = ['TypeError: foo', 'weird-native-frame-not-matching-format'].join('\n');
    const parsed = parseStack(stack);
    expect(parsed.frames).toEqual([
      { symbol: 'weird-native-frame-not-matching-format', resolved: false },
    ]);
  });

  test('returns empty output for empty input without throwing', () => {
    expect(parseStack('')).toEqual({ message: '', frames: [] });
    expect(parseStack(undefined as unknown as string)).toEqual({ message: '', frames: [] });
  });
});
