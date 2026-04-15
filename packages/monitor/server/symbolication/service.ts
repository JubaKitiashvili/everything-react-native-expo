/**
 * Symbolication service — accepts a crash event + bundleId + appVersion,
 * looks up the source map, and resolves stack frames to original locations.
 */

import type { SourceMapResolver, OriginalPosition, GeneratedPosition } from './sourceMapResolver';
import type { DatabaseClient } from '../db/schema';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface StackFrame {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly methodName?: string;
}

export interface SymbolicatedFrame {
  readonly original: StackFrame;
  readonly resolved: OriginalPosition | null;
}

export interface SymbolicationRequest {
  readonly appId: string;
  readonly bundleId: string;
  readonly appVersion: string;
  readonly buildNumber: string;
  readonly platform: string;
  readonly stackFrames: readonly StackFrame[];
}

export interface SymbolicationResult {
  readonly frames: readonly SymbolicatedFrame[];
  readonly sourceMapUrl: string | null;
  readonly fullySymbolicated: boolean;
}

// ────────────────────────────────────────────────────────────
// Source map URL lookup
// ────────────────────────────────────────────────────────────

interface SourceMapRecord {
  readonly map_url: string;
}

const lookupSourceMapUrl = async (
  db: DatabaseClient,
  bundleId: string,
  appVersion: string,
  buildNumber: string,
  platform: string,
): Promise<string | null> => {
  const rows = await db.query<SourceMapRecord>(
    `SELECT sm.map_url
     FROM source_maps sm
     JOIN app_versions av ON av.id = sm.app_version_id
     WHERE sm.bundle_id = $1
       AND av.version = $2
       AND av.build_number = $3
       AND sm.platform = $4
     LIMIT 1`,
    [bundleId, appVersion, buildNumber, platform],
  );

  return rows.length > 0 ? rows[0]!.map_url : null;
};

// ────────────────────────────────────────────────────────────
// Stack trace parser
// ────────────────────────────────────────────────────────────

/**
 * Parse a raw stack trace string into structured frames.
 * Handles common JS stack formats:
 *   - "at FunctionName (file.js:10:20)"
 *   - "at file.js:10:20"
 *   - "file.js:10:20"
 */
export const parseStackTrace = (stack: string): readonly StackFrame[] => {
  const frames: StackFrame[] = [];
  const lines = stack.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Pattern: "at Name (file:line:col)" or "at file:line:col"
    const atMatch = trimmed.match(
      /^at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/,
    );
    if (atMatch) {
      frames.push({
        methodName: atMatch[1] ?? undefined,
        file: atMatch[2]!,
        line: parseInt(atMatch[3]!, 10),
        column: parseInt(atMatch[4]!, 10),
      });
      continue;
    }

    // Pattern: "file:line:col"
    const simpleMatch = trimmed.match(/^(.+?):(\d+):(\d+)$/);
    if (simpleMatch) {
      frames.push({
        file: simpleMatch[1]!,
        line: parseInt(simpleMatch[2]!, 10),
        column: parseInt(simpleMatch[3]!, 10),
      });
    }
  }

  return frames;
};

// ────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────

export interface SymbolicationService {
  symbolicate(request: SymbolicationRequest): Promise<SymbolicationResult>;
}

export const createSymbolicationService = (deps: {
  readonly db: DatabaseClient;
  readonly resolver: SourceMapResolver;
}): SymbolicationService => {
  const symbolicate = async (
    request: SymbolicationRequest,
  ): Promise<SymbolicationResult> => {
    // Look up the source map URL from PostgreSQL
    const mapUrl = await lookupSourceMapUrl(
      deps.db,
      request.bundleId,
      request.appVersion,
      request.buildNumber,
      request.platform,
    );

    if (!mapUrl) {
      // No source map available — return frames unresolved
      return {
        frames: request.stackFrames.map((frame) => ({
          original: frame,
          resolved: null,
        })),
        sourceMapUrl: null,
        fullySymbolicated: false,
      };
    }

    // Resolve each frame
    const frames: SymbolicatedFrame[] = [];
    let allResolved = true;

    for (const frame of request.stackFrames) {
      const position: GeneratedPosition = {
        file: frame.file,
        line: frame.line,
        column: frame.column,
      };

      const resolved = await deps.resolver.resolve(mapUrl, position);
      if (!resolved) {
        allResolved = false;
      }

      frames.push({ original: frame, resolved });
    }

    return {
      frames,
      sourceMapUrl: mapUrl,
      fullySymbolicated: allResolved,
    };
  };

  return { symbolicate };
};
