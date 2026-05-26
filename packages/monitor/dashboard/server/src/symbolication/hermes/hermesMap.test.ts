// Task 117.3 — Hermes / SourceMap v3 parser + chain resolver tests.
// Acceptance: a synthetic 3-stage fixture resolves bytecode→bundle→TS
// in <200ms.

import { describe, expect, test } from 'vitest';
import {
  composeMaps,
  looksLikeHermesMap,
  parseHermesMap,
  resolveBytecodeFrame,
} from './hermesMap.js';

/** Test-only VLQ encoder. Production code only decodes. */
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

function buildMappings(rows: number[][]): string {
  // Each row is a line of segments. Each segment is an array of
  // [genCol, srcIdx, srcLine, srcCol] or [genCol, srcIdx, srcLine, srcCol, nameIdx].
  // Returns the spec-encoded mappings string with relative deltas.
  const prev = { genCol: 0, srcIdx: 0, srcLine: 0, srcCol: 0, nameIdx: 0 };
  const lineStrings: string[] = [];
  for (const row of rows) {
    let runningGenCol = 0;
    const segs: string[] = [];
    for (const segArr of row) {
      const [genCol, srcIdx, srcLine, srcCol, nameIdx] = segArr as unknown as [
        number,
        number,
        number,
        number,
        number?,
      ];
      const dGen = genCol - runningGenCol;
      runningGenCol = genCol;
      const dSrcIdx = srcIdx - prev.srcIdx;
      const dSrcLine = srcLine - prev.srcLine;
      const dSrcCol = srcCol - prev.srcCol;
      let s = encodeVLQ(dGen) + encodeVLQ(dSrcIdx) + encodeVLQ(dSrcLine) + encodeVLQ(dSrcCol);
      if (nameIdx !== undefined) {
        const dName = nameIdx - prev.nameIdx;
        s += encodeVLQ(dName);
        prev.nameIdx = nameIdx;
      }
      prev.srcIdx = srcIdx;
      prev.srcLine = srcLine;
      prev.srcCol = srcCol;
      segs.push(s);
    }
    lineStrings.push(segs.join(','));
  }
  return lineStrings.join(';');
}

describe('looksLikeHermesMap', () => {
  test('accepts well-formed Hermes / V3 JSON', () => {
    expect(
      looksLikeHermesMap('{"version":3,"sources":["x.ts"],"mappings":""}'),
    ).toBe(true);
  });
  test('rejects non-JSON or wrong shape', () => {
    expect(looksLikeHermesMap('com.example.Foo -> a.b.c:')).toBe(false);
    expect(looksLikeHermesMap('{}')).toBe(false);
    expect(looksLikeHermesMap('{"version":3}')).toBe(false);
  });
});

describe('parseHermesMap — regular map', () => {
  test('parses sources, names, sourceRoot, and decoded mappings', () => {
    const map = {
      version: 3 as const,
      file: 'index.bundle.js',
      sourceRoot: 'app/',
      sources: ['App.tsx', 'Home.tsx'],
      names: ['onPress'],
      mappings: buildMappings([
        // Line 0: two segments.
        [
          [0, 0, 0, 0],
          [10, 0, 0, 5, 0],
        ],
        // Line 1: switch source file.
        [[0, 1, 12, 3]],
      ]),
    };
    const parsed = parseHermesMap(map);
    expect(parsed.sources).toEqual(['App.tsx', 'Home.tsx']);
    expect(parsed.sourceRoot).toBe('app/');
    expect(parsed.names).toEqual(['onPress']);
    expect(parsed.decoded).toHaveLength(2);
    expect(parsed.decoded[0]).toHaveLength(2);
    expect(parsed.decoded[1]).toHaveLength(1);
  });

  test('throws on unsupported version', () => {
    expect(() => parseHermesMap({ version: 2 as never, sources: [], mappings: '' })).toThrow(
      /version/,
    );
  });
});

describe('parseHermesMap — sectioned map', () => {
  test('flattens sections by applying offsets', () => {
    const sectionMap = {
      version: 3 as const,
      sources: ['Other.tsx'],
      names: [],
      mappings: buildMappings([[[0, 0, 7, 0]]]),
    };
    const main = {
      version: 3 as const,
      sources: ['App.tsx'],
      names: [],
      mappings: buildMappings([[[0, 0, 0, 0]]]),
    };
    const sectioned = {
      version: 3 as const,
      sections: [
        { offset: { line: 0, column: 0 }, map: main },
        { offset: { line: 5, column: 2 }, map: sectionMap },
      ],
    };
    const parsed = parseHermesMap(sectioned);
    // Sources merged; offset for second section applied → line 5.
    expect(parsed.sources).toEqual(['App.tsx', 'Other.tsx']);
    expect(parsed.decoded).toHaveLength(6);
    const offsetLine = parsed.decoded[5] ?? [];
    expect(offsetLine).toHaveLength(1);
    expect(offsetLine[0]?.genCol).toBe(2);
    // sourceIndex was rebased: section 2 sources start at index 1.
    expect(offsetLine[0]?.srcIndex).toBe(1);
    expect(offsetLine[0]?.srcLine).toBe(7);
  });
});

describe('resolveBytecodeFrame', () => {
  const map = parseHermesMap({
    version: 3 as const,
    sourceRoot: '',
    sources: ['App.tsx'],
    names: ['onPress'],
    mappings: buildMappings([
      [
        [0, 0, 10, 0],
        [4, 0, 10, 4, 0],
        [12, 0, 11, 0],
      ],
    ]),
  });

  test('returns the largest segment ≤ column with name resolved', () => {
    const frame = resolveBytecodeFrame(map, 0, 6);
    expect(frame).toEqual({
      source: 'App.tsx',
      sourceLine: 10,
      sourceColumn: 4,
      name: 'onPress',
    });
  });

  test('returns null for a missing line', () => {
    expect(resolveBytecodeFrame(map, 99, 0)).toBeNull();
  });

  test('returns null when the line has no mappings before column', () => {
    const empty = parseHermesMap({
      version: 3 as const,
      sources: [],
      mappings: ';',
    });
    expect(resolveBytecodeFrame(empty, 0, 0)).toBeNull();
  });
});

describe('composeMaps — 3-stage chain', () => {
  test('outer (bytecode→bundle) feeds into inner (bundle→TS)', () => {
    // Outer: bytecode line 0 col 0 → bundle "bundle.js" line 5 col 2
    const outer = parseHermesMap({
      version: 3 as const,
      sources: ['bundle.js'],
      names: [],
      mappings: buildMappings([[[0, 0, 5, 2]]]),
    });
    // Inner: bundle line 5 col 2 → original "src/App.tsx" line 42 col 7
    // To make the inner map respond at (5,2), we add three empty lines
    // and segments at col 0 + col 2 of the 6th line (line index 5).
    const inner = parseHermesMap({
      version: 3 as const,
      sources: ['src/App.tsx'],
      names: ['render'],
      mappings: buildMappings([
        [[0, 0, 0, 0]],
        [],
        [],
        [],
        [],
        [
          [0, 0, 41, 0],
          [2, 0, 42, 7, 0],
        ],
      ]),
    });

    const chain = composeMaps(outer, inner);
    const frame = chain.resolve(0, 0);
    expect(frame).toEqual({
      source: 'src/App.tsx',
      sourceLine: 42,
      sourceColumn: 7,
      name: 'render',
    });
  });
});

describe('parse + resolve performance budget', () => {
  test('resolves 1000 frames against a 1000-line map in <200ms', () => {
    // Build a moderately sized synthetic map: 1000 lines, 5 segments
    // each, single source file. ~5000 segments — still pure-JS fast.
    const rows: number[][][] = [];
    for (let line = 0; line < 1000; line++) {
      rows.push([
        [0, 0, line, 0],
        [10, 0, line, 5],
        [20, 0, line, 10],
        [30, 0, line, 15],
        [40, 0, line, 20],
      ]);
    }
    const map = {
      version: 3 as const,
      sources: ['big.ts'],
      names: [],
      mappings: buildMappings(rows),
    };
    const t0 = Date.now();
    const parsed = parseHermesMap(map);
    for (let i = 0; i < 1000; i++) {
      const frame = resolveBytecodeFrame(parsed, i, 25);
      expect(frame?.sourceLine).toBe(i);
      expect(frame?.sourceColumn).toBe(10);
    }
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(200);
  });
});
