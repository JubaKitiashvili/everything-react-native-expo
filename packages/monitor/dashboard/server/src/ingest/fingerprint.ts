import type { Severity } from '../storage/types.js';

/**
 * Minimum shape we need to compute a fallback fingerprint when the SDK
 * didn't send one. We don't import the full EventRecord because this
 * module runs before receivedAt/id are assigned.
 */
export interface FingerprintInput {
  type: string;
  severity: Severity;
  payload: Record<string, unknown>;
}

/**
 * Stable, short hash used when the SDK omits `fingerprint`. We read
 * `payload.message` + the first five stack frames (noise-normalised)
 * and fold them through djb2 so a crash that recurs with the same
 * root cause gets clustered together.
 *
 * This is a fallback, not the canonical fingerprinter. The SDK-side
 * Fingerprinter (Task 21) computes fingerprints before events leave
 * the device — the server trusts those when present and only runs
 * this path as a safety net for events that predate the SDK fix or
 * come from a third-party bridge.
 */
export function computeFallbackFingerprint(input: FingerprintInput): string {
  const message = stringField(input.payload, 'message');
  const stack = stringField(input.payload, 'stack');
  const normalised = normaliseStack(stack);
  return djb2(`${input.type}|${message}|${normalised}`);
}

/**
 * Normalise a raw stack into a canonical form suitable for fingerprinting:
 * keep the top five frames, strip line/column numbers, replace hex
 * addresses with a marker, and collapse whitespace. The order of frames
 * is preserved so the top of the stack dominates the hash.
 */
export function normaliseStack(stack: string): string {
  if (!stack) return '';
  return stack
    .split(/\r?\n/)
    .slice(0, 5)
    .map((line) =>
      line
        .trim()
        .replace(/:\d+(?::\d+)?/g, '')
        .replace(/0x[0-9a-f]+/gi, '0x')
        .replace(/\s+/g, ' '),
    )
    .join('|');
}

function stringField(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  return typeof value === 'string' ? value : '';
}

/**
 * djb2 hash → base36. Short (7–8 chars typically), deterministic, no
 * crypto dependency. Not collision-proof — good enough for a
 * human-readable bucket ID, which is all we need here.
 */
export function djb2(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}
