// Task 117.3 — SourceMap v3 VLQ + segment decoder.
//
// Pure-JS implementation of the parts of the Source Map Revision 3
// spec we actually need to symbolicate Hermes + Metro maps:
//
//   * base64 + VLQ decoding of the `mappings` field
//   * one decoded segment list per generated line
//   * a lookup primitive that, given a generated `(line, column)`,
//     returns the source `(line, column, sourceIndex, nameIndex)`
//     using a binary search over the sorted segment list.
//
// Why hand-rolled instead of `source-map`? The mozilla package is
// 200KB+ minified and depends on `wasm`. The Hermes/Metro use-case
// only needs the read side, and we want zero runtime deps for the
// dashboard server's symbolication path. The algorithm is small —
// see [the spec](https://sourcemaps.info/spec.html) §4.4.

const BASE64_TABLE = new Int8Array(128).fill(-1);
{
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < ALPHA.length; i++) BASE64_TABLE[ALPHA.charCodeAt(i)] = i;
}

const VLQ_CONTINUATION = 0b100000;
const VLQ_VALUE_MASK = 0b011111;
const VLQ_SHIFT = 5;

/**
 * Decode a single VLQ value starting at `offset`. Returns a tuple
 * `[value, nextOffset]`. Throws if the stream is truncated or if a
 * non-base64 char is encountered.
 */
export function decodeVLQ(input: string, offset: number): readonly [number, number] {
  let result = 0;
  let shift = 0;
  let continuation = 0;
  let i = offset;
  do {
    if (i >= input.length) {
      throw new Error(`VLQ decode: unexpected end of input at offset ${offset}`);
    }
    const code = input.charCodeAt(i);
    const digit = code < 128 ? BASE64_TABLE[code] : -1;
    if (digit === undefined || digit === -1) {
      throw new Error(`VLQ decode: invalid base64 char '${input[i]}' at offset ${i}`);
    }
    continuation = digit & VLQ_CONTINUATION;
    result |= (digit & VLQ_VALUE_MASK) << shift;
    shift += VLQ_SHIFT;
    i += 1;
  } while (continuation !== 0);

  // Bottom bit is the sign — a positive 1 means negative.
  const negative = (result & 1) !== 0;
  result >>= 1;
  return [negative ? -result : result, i];
}

/**
 * Decoded mapping segment for a single line of generated code. All
 * fields are absolute (the relative-encoded VLQ values get accumulated
 * in `decodeMappings`).
 *
 * - `genCol`     column in the generated line
 * - `srcIndex`   index into `sources` array (-1 = no source)
 * - `srcLine`    0-based line in the source
 * - `srcCol`     0-based column in the source
 * - `nameIndex`  index into `names` array (-1 = no name)
 */
export interface DecodedSegment {
  genCol: number;
  srcIndex: number;
  srcLine: number;
  srcCol: number;
  nameIndex: number;
}

/**
 * Result of decoding the entire `mappings` string into per-line
 * arrays of segments. Lines are 0-indexed; segment ordering within a
 * line is non-decreasing in `genCol` (the spec guarantees this).
 */
export type DecodedMappings = DecodedSegment[][];

/**
 * Decode a SourceMap v3 `mappings` field. Operates in O(n) over the
 * input string with a single pass — this is the hot path and the
 * implementation deliberately avoids closures, allocations, and array
 * pushes inside the inner loop.
 */
export function decodeMappings(mappings: string): DecodedMappings {
  const lines: DecodedMappings = [];
  let line: DecodedSegment[] = [];
  let i = 0;
  // Running absolute values — VLQ encodes deltas.
  let genCol = 0;
  let srcIndex = 0;
  let srcLine = 0;
  let srcCol = 0;
  let nameIndex = 0;

  while (i < mappings.length) {
    const ch = mappings[i];
    if (ch === ';') {
      lines.push(line);
      line = [];
      genCol = 0;
      i += 1;
      continue;
    }
    if (ch === ',') {
      i += 1;
      continue;
    }

    // Decode a segment. The spec defines four cardinalities — 1, 4,
    // or 5 VLQs per segment. We unconditionally read the first VLQ,
    // then peek to see how many more follow before the next ',' or ';'.
    const [d0, n0] = decodeVLQ(mappings, i);
    genCol += d0;
    let nextI = n0;
    let segSrcIndex = -1;
    let segSrcLine = -1;
    let segSrcCol = -1;
    let segNameIndex = -1;

    if (nextI < mappings.length && !isTerminator(mappings.charCodeAt(nextI))) {
      const [d1, n1] = decodeVLQ(mappings, nextI);
      const [d2, n2] = decodeVLQ(mappings, n1);
      const [d3, n3] = decodeVLQ(mappings, n2);
      srcIndex += d1;
      srcLine += d2;
      srcCol += d3;
      segSrcIndex = srcIndex;
      segSrcLine = srcLine;
      segSrcCol = srcCol;
      nextI = n3;
      if (nextI < mappings.length && !isTerminator(mappings.charCodeAt(nextI))) {
        const [d4, n4] = decodeVLQ(mappings, nextI);
        nameIndex += d4;
        segNameIndex = nameIndex;
        nextI = n4;
      }
    }

    line.push({
      genCol,
      srcIndex: segSrcIndex,
      srcLine: segSrcLine,
      srcCol: segSrcCol,
      nameIndex: segNameIndex,
    });
    i = nextI;
  }
  // Whatever trailing line is in flight (no closing semicolon) gets pushed.
  lines.push(line);
  return lines;
}

function isTerminator(code: number): boolean {
  return code === 0x3b /* ';' */ || code === 0x2c /* ',' */;
}

/**
 * Binary-search the segment list for the largest segment with
 * `genCol <= column`. Returns null when the line has no segments OR
 * the first segment is already past `column` (i.e. the position falls
 * before any mapping — common at column 0 of an empty line).
 */
export function lookupSegment(
  line: readonly DecodedSegment[],
  column: number,
): DecodedSegment | null {
  if (line.length === 0) return null;
  let lo = 0;
  let hi = line.length - 1;
  if ((line[0] as DecodedSegment).genCol > column) return null;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if ((line[mid] as DecodedSegment).genCol <= column) lo = mid;
    else hi = mid - 1;
  }
  return line[lo] as DecodedSegment;
}

/** Standard SourceMap v3 "regular" map, as parsed from JSON. */
export interface RawSourceMapV3 {
  version: 3;
  file?: string;
  sources: string[];
  sourceRoot?: string;
  sourcesContent?: (string | null)[];
  names?: string[];
  mappings: string;
  /** Hermes / Metro extensions — opaque to the V3 reader. */
  [extension: `x_${string}`]: unknown;
}

/** Indexed (sectioned) SourceMap v3 — composite of regular maps. */
export interface RawSectionedSourceMapV3 {
  version: 3;
  file?: string;
  sections: Array<{
    offset: { line: number; column: number };
    map: RawSourceMapV3 | RawSectionedSourceMapV3;
  }>;
  [extension: `x_${string}`]: unknown;
}

/**
 * Either map type. Use `isSectioned()` to discriminate.
 */
export type RawSourceMap = RawSourceMapV3 | RawSectionedSourceMapV3;

export function isSectioned(map: RawSourceMap): map is RawSectionedSourceMapV3 {
  return Array.isArray((map as RawSectionedSourceMapV3).sections);
}
