// Task 117.3 — Hermes source map parser + 3-stage chain resolver.
//
// Hermes compiles JavaScript to bytecode. A crash report references
// either:
//
//   (a) a Hermes bytecode `(line, column)` (Hermes synthesises virtual
//       lines so that a single bytecode address has a `(line, column)`
//       shape — this is what `Error.stack` reports), or
//   (b) the JS bundle position (when running on a non-Hermes engine).
//
// Either way, after running through the right map, we end up at the
// original TS source. The task spec calls this a "3-stage" resolution:
//
//   bytecode → JS bundle → original TS file
//
// Modern Expo (SDK ≥ 53) emits a single composite map (`.hbc.map` or
// `index.bundle.map`) whose `mappings` field already does the full
// chain in one decode. The "3 stages" then are conceptual: the SAME
// segment carries the source name and source line — we just expose
// that to callers as a clean record.
//
// For builds that ship two separate maps (rare with Hermes, but
// possible when consumers post-process the bundle), `composeMaps()`
// chains them deterministically: lookup in map A, then feed that
// (file, line, col) into map B.
//
// Minimum API:
//
//   parseHermesMap(json) → ParsedHermesMap
//   resolveBytecodeFrame(map, line, column) → ResolvedHermesFrame | null
//   composeMaps(outerMap, innerMap) → ParsedHermesMap (for split builds)

import {
  decodeMappings,
  isSectioned,
  lookupSegment,
  type DecodedMappings,
  type DecodedSegment,
  type RawSectionedSourceMapV3,
  type RawSourceMap,
  type RawSourceMapV3,
} from './sourceMapV3.js';

export interface ResolvedHermesFrame {
  /** 0-based original source file index into `sources`. */
  source: string | null;
  /** 0-based source line. -1 when the segment has no source. */
  sourceLine: number;
  /** 0-based source column. -1 when the segment has no source. */
  sourceColumn: number;
  /** Original symbol name from `names`, when the segment carried one. */
  name: string | null;
}

/**
 * Parsed + decoded Hermes (or Metro) source map. Keeps the metadata
 * arrays alongside the decoded mappings so a lookup can join the
 * source-index back to a path.
 */
export interface ParsedHermesMap {
  /** Original `sources` array — usually file paths relative to root. */
  sources: string[];
  /** `sourceRoot` if specified — paths are normalised when joining. */
  sourceRoot: string;
  /** Original `names` array. */
  names: string[];
  /** Decoded mappings — `decoded[generatedLine][segmentIndex]`. */
  decoded: DecodedMappings;
}

/**
 * Parse a SourceMap v3 JSON document. Accepts both regular and
 * sectioned (indexed) maps. Sectioned maps are flattened into a
 * single `decoded` array with offsets applied — that lets the
 * lookup primitive stay branchless.
 */
export function parseHermesMap(input: string | RawSourceMap): ParsedHermesMap {
  const raw: RawSourceMap = typeof input === 'string' ? (JSON.parse(input) as RawSourceMap) : input;
  if (raw.version !== 3) {
    throw new Error(`unsupported source map version: ${(raw as { version: unknown }).version}`);
  }
  if (isSectioned(raw)) return flattenSectioned(raw);
  return parseRegular(raw);
}

function parseRegular(raw: RawSourceMapV3): ParsedHermesMap {
  return {
    sources: raw.sources.slice(),
    sourceRoot: raw.sourceRoot ?? '',
    names: (raw.names ?? []).slice(),
    decoded: decodeMappings(raw.mappings),
  };
}

/**
 * Flatten a sectioned map into a single ParsedHermesMap. Each section
 * has its own `(line, column)` offset into the generated output —
 * we shift each decoded segment by that offset so the resulting map
 * looks like a regular V3 map for lookup purposes.
 *
 * Sections are concatenated by section, then by line. Sources and
 * names get rebased so per-section indices remain valid after merge.
 */
function flattenSectioned(raw: RawSectionedSourceMapV3): ParsedHermesMap {
  const sources: string[] = [];
  const names: string[] = [];
  const lines: DecodedSegment[][] = [];

  for (const section of raw.sections) {
    const inner = parseHermesMap(section.map);
    const sourceOffset = sources.length;
    const nameOffset = names.length;
    sources.push(...inner.sources);
    names.push(...inner.names);

    const lineOffset = section.offset.line;
    const colOffset = section.offset.column;

    for (let l = 0; l < inner.decoded.length; l++) {
      const innerLine = inner.decoded[l] ?? [];
      const targetLine = lineOffset + l;
      while (lines.length <= targetLine) lines.push([]);
      const dest = lines[targetLine] as DecodedSegment[];
      const adjustGen = l === 0 ? colOffset : 0;
      for (const seg of innerLine) {
        dest.push({
          genCol: seg.genCol + adjustGen,
          srcIndex: seg.srcIndex >= 0 ? seg.srcIndex + sourceOffset : -1,
          srcLine: seg.srcLine,
          srcCol: seg.srcCol,
          nameIndex: seg.nameIndex >= 0 ? seg.nameIndex + nameOffset : -1,
        });
      }
    }
  }

  // Each line's segments must be sorted by genCol — section overlap is
  // legal but the producer is supposed to ensure ordering. Sort
  // defensively; the operation is O(n log n) once at parse time.
  for (const line of lines) line.sort((a, b) => a.genCol - b.genCol);

  return { sources, sourceRoot: '', names, decoded: lines };
}

/**
 * Resolve a generated `(line, column)` to its source position. Lines
 * are 0-indexed in the source map spec; if your stack reports
 * 1-indexed lines (Error.stack does), subtract 1 before calling.
 *
 * Returns null when the line has no mappings, or when the position
 * falls before the first segment on its line. Callers usually want
 * to fall back to the raw frame in that case.
 */
export function resolveBytecodeFrame(
  map: ParsedHermesMap,
  line: number,
  column: number,
): ResolvedHermesFrame | null {
  if (line < 0 || line >= map.decoded.length) return null;
  const segments = map.decoded[line] as DecodedSegment[];
  const seg = lookupSegment(segments, column);
  if (!seg || seg.srcIndex < 0) return null;
  const sourcePath = map.sources[seg.srcIndex] ?? null;
  const fullPath = sourcePath !== null ? joinSourceRoot(map.sourceRoot, sourcePath) : null;
  const name = seg.nameIndex >= 0 ? (map.names[seg.nameIndex] ?? null) : null;
  return {
    source: fullPath,
    sourceLine: seg.srcLine,
    sourceColumn: seg.srcCol,
    name,
  };
}

function joinSourceRoot(root: string, path: string): string {
  if (root === '') return path;
  if (root.endsWith('/')) return root + path;
  return `${root}/${path}`;
}

/**
 * 3-stage chain. `outer` resolves bytecode/jsbundle positions to an
 * intermediate generated position (e.g. JS bundle line/col). `inner`
 * resolves that generated position to the original TS source.
 *
 * Use this when the build pipeline emitted two maps:
 *   1. bytecode → JS bundle (Hermes)
 *   2. JS bundle → TS (Metro / Babel)
 *
 * Modern Expo SDK 54 builds emit a single combined map and don't
 * need composition; this function exists for split-map setups.
 */
export function composeMaps(
  outerMap: ParsedHermesMap,
  innerMap: ParsedHermesMap,
): {
  resolve(line: number, column: number): ResolvedHermesFrame | null;
} {
  return {
    resolve(line, column) {
      const intermediate = resolveBytecodeFrame(outerMap, line, column);
      if (!intermediate) return null;
      // The "intermediate" position is in some bundle file — to chain,
      // treat sourceLine/sourceColumn as a generated position into
      // innerMap. Inner maps that only know one source ignore the
      // file id; for richer maps callers should look up by source
      // index, but composeMaps here uses position only.
      const inner = resolveBytecodeFrame(
        innerMap,
        intermediate.sourceLine,
        intermediate.sourceColumn,
      );
      return inner ?? intermediate;
    },
  };
}

/**
 * Sniff a buffer's text to decide whether it looks like a Hermes /
 * Metro JSON map. Used by the upload path to route correctly.
 */
export function looksLikeHermesMap(text: string): boolean {
  const t = text.trimStart();
  if (!t.startsWith('{')) return false;
  // Look for the v3 marker and the mappings field — these are
  // extremely cheap substring probes vs. full JSON.parse.
  return t.includes('"version"') && t.includes('"mappings"');
}
