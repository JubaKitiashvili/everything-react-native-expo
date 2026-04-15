/**
 * Task 64 — Anonymizer
 *
 * Strips app name, user data, proprietary paths. Keeps pattern type,
 * metrics, and confidence for cross-project learning.
 */

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface RawPatternData {
  readonly appId: string;
  readonly appName?: string;
  readonly patternType: string;
  readonly patternData: Record<string, unknown>;
  readonly confidence: number;
  readonly sampleCount: number;
}

export interface AnonymizedPatternData {
  readonly patternType: string;
  readonly patternData: Record<string, unknown>;
  readonly confidence: number;
  readonly sampleCount: number;
}

// ────────────────────────────────────────────────────────────
// Sensitive key patterns
// ────────────────────────────────────────────────────────────

const SENSITIVE_KEYS = new Set([
  'userId',
  'user_id',
  'userName',
  'user_name',
  'email',
  'token',
  'apiKey',
  'api_key',
  'secret',
  'password',
  'sessionId',
  'session_id',
  'ip',
  'ipAddress',
  'ip_address',
  'deviceId',
  'device_id',
  'appName',
  'app_name',
  'appId',
  'app_id',
  'bundleId',
  'bundle_id',
]);

const PATH_PATTERN = /\/(?:Users|home|var|tmp|data|private)\/[^\s/]+/gi;
const APP_BUNDLE_PATTERN = /com\.[a-z]+\.[a-z.]+/gi;

// ────────────────────────────────────────────────────────────
// Anonymizer
// ────────────────────────────────────────────────────────────

function scrubValue(value: unknown): unknown {
  if (typeof value === 'string') {
    let scrubbed = value.replace(PATH_PATTERN, '<redacted-path>');
    scrubbed = scrubbed.replace(APP_BUNDLE_PATTERN, '<redacted-bundle>');
    return scrubbed;
  }
  if (Array.isArray(value)) {
    return value.map(scrubValue);
  }
  if (value !== null && typeof value === 'object') {
    return scrubObject(value as Record<string, unknown>);
  }
  return value;
}

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key)) continue;
    result[key] = scrubValue(value);
  }
  return result;
}

export function anonymize(raw: RawPatternData): AnonymizedPatternData {
  return {
    patternType: raw.patternType,
    patternData: scrubObject(raw.patternData),
    confidence: raw.confidence,
    sampleCount: raw.sampleCount,
  };
}

export function anonymizeBatch(
  patterns: readonly RawPatternData[],
): readonly AnonymizedPatternData[] {
  return patterns.map(anonymize);
}
