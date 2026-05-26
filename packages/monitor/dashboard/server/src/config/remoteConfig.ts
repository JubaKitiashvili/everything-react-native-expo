// Task 117.17 — server-side remote adaptive config.
//
// The dashboard server owns one operator-editable "remote config" blob
// that SDKs poll and apply at runtime: how aggressively to sample each
// event type, which payload keys / patterns to redact (PII rules), and a
// set of named feature flags. This module is the PURE core behind that
// surface — no I/O, no http, no store. The REST layer (server.ts) and
// the key/value store (server_settings) wrap it:
//
//   DEFAULT_REMOTE_CONFIG    — the effective config when none is stored.
//   validateRemoteConfig(in) — total, never-throwing validator that
//                              clamps sampling rates into [0,1], rejects
//                              unknown / malformed shapes, and returns a
//                              discriminated `{ ok, config? , errors? }`.
//   serializeRemoteConfig    — config → JSON string for storage.
//   parseRemoteConfig(raw)   — stored string → config, with a SAFE
//                              fallback to defaults on missing / malformed
//                              input (a corrupt row must never brick the
//                              SDK poll path).
//   mergeRemoteConfig(a, b)  — shallow-section merge for PUT?merge=1.
//
// Validation is intentionally strict on the *shape* (so an operator typo
// can't silently disable sampling) but tolerant on values it can repair
// (a sampling rate of 1.5 clamps to 1 rather than 400-ing the whole PUT).

/** Cap collection sizes so a buggy / hostile PUT can't pin unbounded JSON. */
const MAX_SAMPLING_KEYS = 256;
const MAX_PII_RULES = 256;
const MAX_FEATURE_FLAGS = 256;
const MAX_KEY_LENGTH = 256;
const MAX_RULE_LENGTH = 512;

export interface RemoteConfig {
  /**
   * Per-event-type sampling probabilities in [0,1]. A reserved
   * `default` key applies to any event type without an explicit rate.
   * Empty `{}` means "sample everything" (the SDK treats a missing rate
   * as 1).
   */
  sampling: Record<string, number>;
  /**
   * Redaction patterns / payload keys the SDK strips before sending.
   * Free-form strings (a key name like `email`, or a regex source) —
   * the server only stores them; the SDK decides how to apply them.
   */
  piiRules: string[];
  /** Named boolean feature toggles the SDK reads at runtime. */
  featureFlags: Record<string, boolean>;
  /** ms timestamp of the last write. Stamped by the persistence layer. */
  updatedAt: number;
}

/**
 * The effective config when nothing has been stored yet. Sampling is
 * empty (SDKs sample everything by default), no PII rules, no flags.
 * `updatedAt` is 0 so a never-configured server is distinguishable from
 * one written at the epoch.
 */
export const DEFAULT_REMOTE_CONFIG: RemoteConfig = Object.freeze({
  sampling: {},
  piiRules: [],
  featureFlags: {},
  updatedAt: 0,
});

/** Return a fresh, mutable copy of the defaults (never the frozen const). */
export function cloneDefaultRemoteConfig(): RemoteConfig {
  return { sampling: {}, piiRules: [], featureFlags: {}, updatedAt: 0 };
}

export interface ValidateRemoteConfigOk {
  ok: true;
  config: RemoteConfig;
  /**
   * Which top-level sections were explicitly present in the input. The
   * merge path uses this to distinguish "operator sent an empty
   * `featureFlags: {}`" (clear all flags) from "operator omitted
   * `featureFlags`" (keep existing flags).
   */
  present: { sampling: boolean; piiRules: boolean; featureFlags: boolean };
}

export interface ValidateRemoteConfigError {
  ok: false;
  errors: string[];
}

export type ValidateRemoteConfigResult = ValidateRemoteConfigOk | ValidateRemoteConfigError;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate an arbitrary input into a clean `RemoteConfig`. Total + never
 * throws. Unknown top-level keys, wrong-typed sections, and non-numeric /
 * non-boolean leaf values are rejected with a descriptive error string.
 * Sampling rates outside [0,1] are CLAMPED rather than rejected — an
 * operator nudging a slider past the edge shouldn't 400 the whole save.
 *
 * `updatedAt` is never trusted from the caller; the persistence layer
 * stamps it. We default it to 0 here so the pure function stays
 * deterministic.
 */
export function validateRemoteConfig(input: unknown): ValidateRemoteConfigResult {
  const errors: string[] = [];

  if (!isPlainObject(input)) {
    return { ok: false, errors: ['config must be an object'] };
  }

  const ALLOWED_TOP_KEYS = new Set(['sampling', 'piiRules', 'featureFlags', 'updatedAt']);
  for (const key of Object.keys(input)) {
    if (!ALLOWED_TOP_KEYS.has(key)) {
      errors.push(`unknown key: ${key}`);
    }
  }

  const config: RemoteConfig = cloneDefaultRemoteConfig();

  // ── sampling ──────────────────────────────────────────────────────
  if (input.sampling !== undefined) {
    if (!isPlainObject(input.sampling)) {
      errors.push('sampling must be an object');
    } else {
      const entries = Object.entries(input.sampling);
      if (entries.length > MAX_SAMPLING_KEYS) {
        errors.push(`sampling has too many keys (max ${MAX_SAMPLING_KEYS})`);
      } else {
        for (const [eventType, rate] of entries) {
          if (eventType.length === 0 || eventType.length > MAX_KEY_LENGTH) {
            errors.push(`sampling key has invalid length: ${eventType.slice(0, 32)}`);
            continue;
          }
          if (typeof rate !== 'number' || !Number.isFinite(rate)) {
            errors.push(`sampling rate for "${eventType}" must be a finite number`);
            continue;
          }
          // Clamp into [0,1] rather than reject — see header note.
          config.sampling[eventType] = Math.min(1, Math.max(0, rate));
        }
      }
    }
  }

  // ── piiRules ──────────────────────────────────────────────────────
  if (input.piiRules !== undefined) {
    if (!Array.isArray(input.piiRules)) {
      errors.push('piiRules must be an array of strings');
    } else if (input.piiRules.length > MAX_PII_RULES) {
      errors.push(`piiRules has too many entries (max ${MAX_PII_RULES})`);
    } else {
      const seen = new Set<string>();
      for (const rule of input.piiRules) {
        if (typeof rule !== 'string') {
          errors.push('piiRules entries must be strings');
          continue;
        }
        if (rule.length === 0 || rule.length > MAX_RULE_LENGTH) {
          errors.push(`piiRules entry has invalid length: ${rule.slice(0, 32)}`);
          continue;
        }
        if (seen.has(rule)) continue; // de-dupe silently
        seen.add(rule);
        config.piiRules.push(rule);
      }
    }
  }

  // ── featureFlags ──────────────────────────────────────────────────
  if (input.featureFlags !== undefined) {
    if (!isPlainObject(input.featureFlags)) {
      errors.push('featureFlags must be an object of booleans');
    } else {
      const entries = Object.entries(input.featureFlags);
      if (entries.length > MAX_FEATURE_FLAGS) {
        errors.push(`featureFlags has too many keys (max ${MAX_FEATURE_FLAGS})`);
      } else {
        for (const [flag, value] of entries) {
          if (flag.length === 0 || flag.length > MAX_KEY_LENGTH) {
            errors.push(`featureFlags key has invalid length: ${flag.slice(0, 32)}`);
            continue;
          }
          if (typeof value !== 'boolean') {
            errors.push(`featureFlags value for "${flag}" must be a boolean`);
            continue;
          }
          config.featureFlags[flag] = value;
        }
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    config,
    present: {
      sampling: input.sampling !== undefined,
      piiRules: input.piiRules !== undefined,
      featureFlags: input.featureFlags !== undefined,
    },
  };
}

/**
 * Serialise a config to a storage string. Pure; assumes a config that
 * already passed `validateRemoteConfig` (only plain JSON values).
 */
export function serializeRemoteConfig(config: RemoteConfig): string {
  return JSON.stringify({
    sampling: config.sampling,
    piiRules: config.piiRules,
    featureFlags: config.featureFlags,
    updatedAt: config.updatedAt,
  });
}

/**
 * Parse a stored config string back into a `RemoteConfig`. SAFE: any
 * missing / malformed / partially-corrupt input falls back to the
 * defaults rather than throwing — a corrupt `server_settings` row must
 * never break the SDK poll path. Recognised-but-out-of-range values
 * (e.g. a sampling rate of 2) are repaired via `validateRemoteConfig`.
 */
export function parseRemoteConfig(raw: string | null | undefined): RemoteConfig {
  if (raw === null || raw === undefined || raw.length === 0) {
    return cloneDefaultRemoteConfig();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return cloneDefaultRemoteConfig();
  }
  const result = validateRemoteConfig(parsed);
  const config = result.ok ? result.config : cloneDefaultRemoteConfig();
  // Preserve a stored `updatedAt` when it's a sane number (validate drops
  // it to 0 because it never trusts caller-supplied timestamps).
  if (isPlainObject(parsed) && typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt)) {
    config.updatedAt = parsed.updatedAt;
  }
  return config;
}

/**
 * Shallow per-section merge: each top-level section of `patch` replaces
 * the corresponding section of `base` wholesale ONLY when it was
 * explicitly present in the operator's input (`present`), otherwise
 * `base`'s section is kept. Used by the PUT?merge=1 path so an operator
 * can update just `featureFlags` without resending sampling + PII rules.
 * `updatedAt` is never merged from input — the caller stamps it.
 */
export function mergeRemoteConfig(
  base: RemoteConfig,
  patch: RemoteConfig,
  present: ValidateRemoteConfigOk['present'],
): RemoteConfig {
  return {
    sampling: present.sampling ? patch.sampling : base.sampling,
    piiRules: present.piiRules ? patch.piiRules : base.piiRules,
    featureFlags: present.featureFlags ? patch.featureFlags : base.featureFlags,
    updatedAt: base.updatedAt,
  };
}

/** Storage key under which the JSON config blob lives in server_settings. */
export const REMOTE_CONFIG_SETTING_KEY = 'remote_config';
