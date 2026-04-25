// Task 117.3 — VLQ + segment decoder unit tests.

import { describe, expect, test } from 'vitest';
import {
  decodeMappings,
  decodeVLQ,
  isSectioned,
  lookupSegment,
  type DecodedSegment,
} from './sourceMapV3.js';

/**
 * Reference VLQ encoder used only by the tests. Mirrors the V3 spec —
 * 6 bits per base64 char, top bit is continuation, bottom bit of the
 * accumulated value is the sign. We don't ship encode in production
 * (the dashboard server only ever reads maps), so it lives here.
 */
function encodeVLQ(value: number): string {
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let v = value < 0 ? ((-value) << 1) | 1 : value << 1;
  let out = '';
  do {
    let digit = v & 0b11111;
    v >>>= 5;
    if (v > 0) digit |= 0b100000;
    out += ALPHA[digit];
  } while (v > 0);
  return out;
}

describe('decodeVLQ', () => {
  test('round-trips a range of signed values', () => {
    const values = [0, 1, -1, 5, -5, 16, -16, 31, -31, 32, -32, 1024, -1024, 65535];
    for (const v of values) {
      const encoded = encodeVLQ(v);
      const [decoded, next] = decodeVLQ(encoded, 0);
      expect(decoded).toBe(v);
      expect(next).toBe(encoded.length);
    }
  });

  test('continues across multiple base64 digits', () => {
    // 1024 → 11 bits → spans 3 base64 digits.
    const encoded = encodeVLQ(1024);
    expect(encoded.length).toBeGreaterThan(1);
    expect(decodeVLQ(encoded, 0)[0]).toBe(1024);
  });

  test('throws on invalid input', () => {
    expect(() => decodeVLQ('!', 0)).toThrow(/invalid base64/);
    expect(() => decodeVLQ('A', 5)).toThrow(/unexpected end/);
  });
});

describe('decodeMappings', () => {
  test('parses an empty string into a single empty line', () => {
    expect(decodeMappings('')).toEqual([[]]);
  });

  test('parses a single 4-VLQ segment with no name', () => {
    // genCol=0, srcIdx=0, srcLine=0, srcCol=0  → AAAA
    const out = decodeMappings('AAAA');
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual([
      { genCol: 0, srcIndex: 0, srcLine: 0, srcCol: 0, nameIndex: -1 },
    ]);
  });

  test('parses a 5-VLQ segment with a name index', () => {
    // genCol=0, srcIdx=0, srcLine=0, srcCol=0, nameIdx=0
    const out = decodeMappings('AAAAA');
    expect(out[0]).toEqual([
      { genCol: 0, srcIndex: 0, srcLine: 0, srcCol: 0, nameIndex: 0 },
    ]);
  });

  test('accumulates relative deltas across segments', () => {
    // Segment A: genCol=0, src=0, srcLine=0, srcCol=0  (AAAA)
    // Segment B: genCol+=4, src+=0, srcLine+=1, srcCol+=2  (IACE)
    // Encoded values: 4, 0, 1, 2 → I, A, C, E
    const out = decodeMappings('AAAA,IACE');
    expect(out[0]).toEqual([
      { genCol: 0, srcIndex: 0, srcLine: 0, srcCol: 0, nameIndex: -1 },
      { genCol: 4, srcIndex: 0, srcLine: 1, srcCol: 2, nameIndex: -1 },
    ]);
  });

  test('semicolons split lines and reset genCol', () => {
    const out = decodeMappings('AAAA;IACE');
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual([
      { genCol: 0, srcIndex: 0, srcLine: 0, srcCol: 0, nameIndex: -1 },
    ]);
    // genCol resets to 0 then +4 = 4 on the second line.
    expect(out[1]).toEqual([
      { genCol: 4, srcIndex: 0, srcLine: 1, srcCol: 2, nameIndex: -1 },
    ]);
  });
});

describe('lookupSegment', () => {
  const line: DecodedSegment[] = [
    { genCol: 0, srcIndex: 0, srcLine: 10, srcCol: 0, nameIndex: -1 },
    { genCol: 5, srcIndex: 0, srcLine: 10, srcCol: 5, nameIndex: -1 },
    { genCol: 10, srcIndex: 0, srcLine: 11, srcCol: 0, nameIndex: -1 },
    { genCol: 20, srcIndex: 1, srcLine: 5, srcCol: 0, nameIndex: 0 },
  ];

  test('returns the largest segment with genCol <= target', () => {
    expect(lookupSegment(line, 0)?.srcLine).toBe(10);
    expect(lookupSegment(line, 4)?.srcCol).toBe(0);
    expect(lookupSegment(line, 5)?.srcCol).toBe(5);
    expect(lookupSegment(line, 9)?.srcCol).toBe(5);
    expect(lookupSegment(line, 10)?.srcLine).toBe(11);
    expect(lookupSegment(line, 100)?.nameIndex).toBe(0);
  });

  test('returns null when no segments are present', () => {
    expect(lookupSegment([], 0)).toBeNull();
  });
});

describe('isSectioned', () => {
  test('discriminates between regular and sectioned maps', () => {
    expect(isSectioned({ version: 3, sources: [], mappings: '' })).toBe(false);
    expect(
      isSectioned({
        version: 3,
        sections: [
          {
            offset: { line: 0, column: 0 },
            map: { version: 3, sources: [], mappings: '' },
          },
        ],
      }),
    ).toBe(true);
  });
});
