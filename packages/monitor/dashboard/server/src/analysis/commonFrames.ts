// Task 117.83 — common frame extraction.
//
// Given the stack frame arrays of multiple events in one crash group, find:
//   - commonPrefix: the shared leading frames, in order from the top of the
//     stack down, that every stack agrees on. Stops at the first frame that
//     differs (or runs out) in any stack — this is the common call site.
//   - commonFrames: the SET of frames present in EVERY stack, regardless of
//     position. Useful for spotting a recurring frame buried mid-stack.
//
// Pure + robust: differing lengths, a single stack, fully disjoint stacks,
// and empty input all return sensible results.

import type { IMonitorStore } from '../storage/IMonitorStore.js';

export interface CommonFramesResult {
  /** Shared leading frames, top-of-stack first. */
  commonPrefix: string[];
  /** Frames present in ALL stacks (intersection), order from the first stack. */
  commonFrames: string[];
}

/**
 * Extract the common leading prefix and the all-stacks intersection from a
 * collection of stack frame arrays.
 *
 * - Empty input (`[]`) → `{ commonPrefix: [], commonFrames: [] }`.
 * - A single stack → its frames are both the prefix and the intersection.
 * - Empty stacks among the input collapse the prefix and intersection to `[]`.
 */
export function extractCommonFrames(stacks: string[][]): CommonFramesResult {
  if (stacks.length === 0) {
    return { commonPrefix: [], commonFrames: [] };
  }

  // ---- Common leading prefix --------------------------------------------
  const shortest = stacks.reduce(
    (min, s) => Math.min(min, s.length),
    Number.POSITIVE_INFINITY,
  );
  const commonPrefix: string[] = [];
  for (let i = 0; i < shortest; i++) {
    const frame = stacks[0]![i];
    if (stacks.every((s) => s[i] === frame)) {
      commonPrefix.push(frame!);
    } else {
      break;
    }
  }

  // ---- Intersection across all stacks -----------------------------------
  // Walk the first stack and keep frames present in every other stack.
  // Dedupe so a frame that repeats inside one stack isn't emitted twice.
  const others = stacks.slice(1).map((s) => new Set(s));
  const seen = new Set<string>();
  const commonFrames: string[] = [];
  for (const frame of stacks[0]!) {
    if (seen.has(frame)) continue;
    if (others.every((set) => set.has(frame))) {
      commonFrames.push(frame);
      seen.add(frame);
    }
  }

  return { commonPrefix, commonFrames };
}

/**
 * Split a raw stack string (newline-separated frames) into a trimmed,
 * non-empty frame array. Mirrors the convention used elsewhere in the
 * server (payload.stack is a single newline-joined string).
 */
export function splitStackString(stack: string): string[] {
  return stack
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Pull a frame array out of an event payload. Supports both a structured
 * `stackFrames: string[]` field and the common newline-joined `stack`
 * string. Returns `[]` when neither is present.
 */
export function framesFromPayload(payload: Record<string, unknown>): string[] {
  const structured = payload.stackFrames;
  if (Array.isArray(structured)) {
    return structured.filter((f): f is string => typeof f === 'string').map((f) => f.trim());
  }
  const stack = payload.stack;
  if (typeof stack === 'string') {
    return splitStackString(stack);
  }
  return [];
}

export interface CrashGroupCommonFrames extends CommonFramesResult {
  fingerprint: string;
  /** Number of event stacks the analysis considered. */
  stackCount: number;
}

/**
 * Pull the recent event stacks for a crash group from the store and return
 * the common frames. Backs `GET /api/crash-groups/:fingerprint/common-frames`.
 * `limit` caps how many recent events are scanned (default 100).
 */
export function crashGroupCommonFrames(
  store: IMonitorStore,
  fingerprint: string,
  limit = 100,
): CrashGroupCommonFrames {
  const events = store.listEvents({ fingerprint, limit });
  const stacks = events
    .map((e) => framesFromPayload(e.payload))
    .filter((frames) => frames.length > 0);
  const result = extractCommonFrames(stacks);
  return { fingerprint, stackCount: stacks.length, ...result };
}
