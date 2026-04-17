import type { EventRecord } from '../../shared/api/types';

/**
 * A single visual snapshot the SDK captured for session replay. The dashboard
 * receives these as regular events with `type === 'replay_frame'`; the payload
 * contains the rendered image (data URL or remote URL), the screen name, and
 * any regions the ReplayMasker flagged as PII.
 */
export interface ReplayFrame {
  id: string;
  timestamp: number;
  image?: string;
  screen?: string;
  masks?: ReplayMask[];
}

export interface ReplayMask {
  x: number;
  y: number;
  width: number;
  height: number;
  reason?: string;
}

/**
 * Pull replay frames out of a raw event list. Any event with
 * `type === 'replay_frame'` and a string `image` payload becomes a frame;
 * everything else is ignored. The result is sorted ascending by timestamp so
 * the scrubber logic doesn't have to re-sort downstream.
 */
export function extractReplayFrames(events: EventRecord[]): ReplayFrame[] {
  const out: ReplayFrame[] = [];
  for (const event of events) {
    if (event.type !== 'replay_frame') continue;
    const payload = event.payload as {
      image?: unknown;
      screen?: unknown;
      masks?: unknown;
    };
    const frame: ReplayFrame = { id: event.id, timestamp: event.timestamp };
    if (typeof payload.image === 'string') frame.image = payload.image;
    if (typeof payload.screen === 'string') frame.screen = payload.screen;
    if (Array.isArray(payload.masks)) {
      frame.masks = payload.masks.filter(isMask);
    } else if (event.screen !== undefined) {
      frame.screen = event.screen;
    }
    out.push(frame);
  }
  return out.sort((a, b) => a.timestamp - b.timestamp);
}

function isMask(value: unknown): value is ReplayMask {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.x === 'number' &&
    typeof m.y === 'number' &&
    typeof m.width === 'number' &&
    typeof m.height === 'number'
  );
}

/**
 * Pick the frame visible at scrubber time `atTs`: the newest frame whose
 * timestamp is ≤ atTs. If the scrubber sits before any frame, returns null
 * so the viewer can render a "waiting for first frame" placeholder.
 *
 * Exported for unit tests because the binary search matters when there are
 * hundreds of frames per session.
 */
export function selectFrame(frames: ReplayFrame[], atTs: number): ReplayFrame | null {
  if (frames.length === 0) return null;
  if (atTs < frames[0]!.timestamp) return null;
  let lo = 0;
  let hi = frames.length - 1;
  let result = frames[0]!;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const frame = frames[mid]!;
    if (frame.timestamp <= atTs) {
      result = frame;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

export interface AdvanceResult {
  ts: number;
  /** True once the scrubber reached `maxTs` at this playback rate. */
  done: boolean;
}

/**
 * Advance the scrubber clock forward by `elapsedMs` of real time, multiplied
 * by `playbackRate`. Clamps to `[minTs, maxTs]` and flags `done: true` the
 * moment the clamp engages on the upper bound, so the caller can stop the
 * playback timer without re-inspecting state.
 */
export function advanceScrubber(
  prevTs: number,
  elapsedMs: number,
  playbackRate: number,
  minTs: number,
  maxTs: number,
): AdvanceResult {
  const floor = Math.min(minTs, maxTs);
  const ceil = Math.max(minTs, maxTs);
  if (elapsedMs <= 0 || playbackRate <= 0) {
    return { ts: clamp(prevTs, floor, ceil), done: prevTs >= ceil };
  }
  const next = prevTs + elapsedMs * playbackRate;
  if (next >= ceil) return { ts: ceil, done: true };
  if (next <= floor) return { ts: floor, done: false };
  return { ts: next, done: false };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export const PLAYBACK_RATES: readonly number[] = [1, 2, 4] as const;
