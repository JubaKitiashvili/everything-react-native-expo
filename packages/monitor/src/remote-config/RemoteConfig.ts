// Task 117.55 / 117.17-SDK — SDK-side Remote Config.
//
// The dashboard server serves one operator-editable "remote config" blob at
// `GET /v1/config` that SDKs poll and APPLY at runtime: how aggressively to
// sample each event type, which payload keys / patterns to redact (PII
// rules), and a set of named feature flags.
//
// This module is the PURE core on the SDK side. It deliberately MIRRORS the
// server's shape + clamping (packages/monitor/dashboard/server/src/config/
// remoteConfig.ts) WITHOUT importing across packages — the SDK must stay a
// self-contained dependency. Validation is:
//   - total: it never throws on any input;
//   - repairing: sampling rates outside [0,1] are CLAMPED rather than
//     rejected (an operator nudging a slider past the edge shouldn't brick
//     the SDK's poll path);
//   - defaulting: any malformed top-level section is dropped back to its
//     default so a partially-corrupt payload still yields a usable config.
//
// Because the poll path must never throw into the host app, there is no
// "reject" outcome here — unlike the server (which 400s a bad PUT to give the
// operator feedback), the SDK always returns a clean, usable RemoteConfig.

/** Cap collection sizes so a hostile / buggy payload can't pin unbounded JSON. */
const MAX_SAMPLING_KEYS = 256;
const MAX_PII_RULES = 256;
const MAX_FEATURE_FLAGS = 256;
const MAX_KEY_LENGTH = 256;
const MAX_RULE_LENGTH = 512;

export interface RemoteConfig {
  /**
   * Per-event-type sampling probabilities in [0,1]. A reserved `default`
   * key applies to any event type without an explicit rate. An empty `{}`
   * (or a missing rate for a type) means "sample everything" — the SDK
   * treats a missing rate as 1.
   */
  readonly sampling: Readonly<Record<string, number>>;
  /**
   * Redaction patterns / payload key names the SDK strips before storing or
   * sending. Free-form strings: a bare identifier (e.g. `email`) is treated
   * as a sensitive object-key name; a value that looks like a regex source is
   * compiled into an extra redaction pattern. See `RemoteConfigApplier`.
   */
  readonly piiRules: readonly string[];
  /** Named boolean feature toggles the SDK reads at runtime. */
  readonly featureFlags: Readonly<Record<string, boolean>>;
  /** ms timestamp of the last server write. 0 when never configured. */
  readonly updatedAt: number;
}

/**
 * The effective config when nothing has been fetched / stored yet. Sampling
 * is empty (sample everything), no PII rules, no flags. `updatedAt` is 0 so a
 * never-configured server is distinguishable from one written at the epoch.
 */
export const DEFAULT_REMOTE_CONFIG: RemoteConfig = Object.freeze({
  sampling: Object.freeze({}),
  piiRules: Object.freeze([]),
  featureFlags: Object.freeze({}),
  updatedAt: 0,
});

/** A fresh, mutable defaults object (never the frozen const). */
function freshDefault(): {
  sampling: Record<string, number>;
  piiRules: string[];
  featureFlags: Record<string, boolean>;
  updatedAt: number;
} {
  return { sampling: {}, piiRules: [], featureFlags: {}, updatedAt: 0 };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Coerce an arbitrary input into a clean `RemoteConfig`. TOTAL — never throws.
 *
 * Unlike the server validator (which returns `{ ok, errors }` to give an
 * operator feedback on a bad PUT), the SDK side has no caller to report to:
 * the host app must keep running. So every section that is malformed is
 * dropped to its default, and recognised-but-out-of-range sampling rates are
 * clamped into [0,1].
 *
 *   validateRemoteConfig(null)                         → DEFAULT
 *   validateRemoteConfig({ sampling: 'x' })            → DEFAULT (sampling dropped)
 *   validateRemoteConfig({ sampling: { custom: 1.7 }}) → { custom: 1 } (clamped)
 *
 * `updatedAt` is read through when it's a finite number ≥ 0 (the server
 * stamps it), otherwise 0.
 */
export function validateRemoteConfig(input: unknown): RemoteConfig {
  if (!isPlainObject(input)) {
    return cloneRemoteConfig(freshDefault());
  }

  const config = freshDefault();

  // ── sampling ──────────────────────────────────────────────────────
  if (isPlainObject(input.sampling)) {
    const entries = Object.entries(input.sampling);
    if (entries.length <= MAX_SAMPLING_KEYS) {
      for (const [eventType, rate] of entries) {
        if (eventType.length === 0 || eventType.length > MAX_KEY_LENGTH) {
          continue;
        }
        if (typeof rate !== 'number' || !Number.isFinite(rate)) {
          continue;
        }
        // Clamp into [0,1] rather than drop — see header note.
        config.sampling[eventType] = Math.min(1, Math.max(0, rate));
      }
    }
  }

  // ── piiRules ──────────────────────────────────────────────────────
  if (Array.isArray(input.piiRules) && input.piiRules.length <= MAX_PII_RULES) {
    const seen = new Set<string>();
    for (const rule of input.piiRules) {
      if (typeof rule !== 'string') continue;
      if (rule.length === 0 || rule.length > MAX_RULE_LENGTH) continue;
      if (seen.has(rule)) continue; // de-dupe
      seen.add(rule);
      config.piiRules.push(rule);
    }
  }

  // ── featureFlags ──────────────────────────────────────────────────
  if (isPlainObject(input.featureFlags)) {
    const entries = Object.entries(input.featureFlags);
    if (entries.length <= MAX_FEATURE_FLAGS) {
      for (const [flag, value] of entries) {
        if (flag.length === 0 || flag.length > MAX_KEY_LENGTH) continue;
        if (typeof value !== 'boolean') continue;
        config.featureFlags[flag] = value;
      }
    }
  }

  // ── updatedAt ─────────────────────────────────────────────────────
  if (
    typeof input.updatedAt === 'number' &&
    Number.isFinite(input.updatedAt) &&
    input.updatedAt >= 0
  ) {
    config.updatedAt = input.updatedAt;
  }

  return cloneRemoteConfig(config);
}

/** Deep-freeze a mutable config into the readonly `RemoteConfig` shape. */
function cloneRemoteConfig(c: {
  sampling: Record<string, number>;
  piiRules: string[];
  featureFlags: Record<string, boolean>;
  updatedAt: number;
}): RemoteConfig {
  return Object.freeze({
    sampling: Object.freeze({ ...c.sampling }),
    piiRules: Object.freeze([...c.piiRules]),
    featureFlags: Object.freeze({ ...c.featureFlags }),
    updatedAt: c.updatedAt,
  });
}

/**
 * Structural equality for two configs — used by the client to decide whether
 * a fetched config actually changed before firing `onChange`. `updatedAt` is
 * IGNORED: only the effective behaviour (sampling / piiRules / flags) matters,
 * so a re-save that only bumps the timestamp doesn't churn subscribers.
 */
export function remoteConfigEquals(a: RemoteConfig, b: RemoteConfig): boolean {
  if (a === b) return true;
  // sampling
  const aSamp = Object.keys(a.sampling);
  const bSamp = Object.keys(b.sampling);
  if (aSamp.length !== bSamp.length) return false;
  for (const k of aSamp) {
    if (a.sampling[k] !== b.sampling[k]) return false;
  }
  // piiRules (order-sensitive — server preserves insertion order)
  if (a.piiRules.length !== b.piiRules.length) return false;
  for (let i = 0; i < a.piiRules.length; i++) {
    if (a.piiRules[i] !== b.piiRules[i]) return false;
  }
  // featureFlags
  const aFlags = Object.keys(a.featureFlags);
  const bFlags = Object.keys(b.featureFlags);
  if (aFlags.length !== bFlags.length) return false;
  for (const k of aFlags) {
    if (a.featureFlags[k] !== b.featureFlags[k]) return false;
  }
  return true;
}
