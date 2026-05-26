// Task 117.55 / 117.17-SDK — applying a fetched RemoteConfig to the runtime.
//
// This module holds the PURE, injectable apply logic so every effect is unit
// testable without real timers, network, or RNG. Three concerns:
//
//   1. sampling      → RemoteSamplingGate.shouldKeep(type): probabilistic
//                      per-event-type gating with an injectable RNG.
//   2. featureFlags  → applyFeatureFlags(): diffs the flag map against the
//                      last-applied set and invokes injected toggle callbacks
//                      for the flags that map to existing runtime behaviours.
//   3. piiRules      → splitPiiRules(): partitions free-form rule strings into
//                      sensitive-key names vs regex patterns for the Sanitizer.
//
// The runtime (createMonitorRuntime) owns the *wiring* — it constructs a
// gate, a toggle map, and a sanitizer-extras sink, then feeds each fetched
// config through these functions. None of that requires real I/O.

import type { RemoteConfig } from './RemoteConfig';

// ────────────────────────────────────────────────────────────
// Sampling
// ────────────────────────────────────────────────────────────

/** Reserved key in `config.sampling` applied to any unlisted event type. */
export const DEFAULT_SAMPLING_KEY = 'default';

export interface RemoteSamplingGateDeps {
  /**
   * RNG returning a number in [0,1). Injected for deterministic tests;
   * defaults to `Math.random`. Each call gates one event.
   */
  readonly random?: () => number;
}

/**
 * Stateful gate that decides whether an event of a given type passes the
 * remote sampling config. Resolution order per type:
 *
 *   1. explicit `sampling[type]`            (e.g. `network: 0.5`)
 *   2. reserved `sampling['default']`       (applies to unlisted types)
 *   3. no rule                              → keep (rate 1)
 *
 * Then: rate ≥ 1 always keeps, rate ≤ 0 always drops, otherwise probabilistic
 * via `random() < rate`. The injected RNG makes 0.5 deterministically
 * splittable in tests.
 *
 * The gate holds the current config by reference; `setConfig` swaps it
 * atomically so a config update mid-stream is picked up immediately.
 */
export class RemoteSamplingGate {
  private sampling: Readonly<Record<string, number>> = {};
  private readonly random: () => number;

  constructor(deps: RemoteSamplingGateDeps = {}) {
    this.random = deps.random ?? Math.random;
  }

  /** Replace the active sampling map. */
  setConfig(config: RemoteConfig): void {
    this.sampling = config.sampling;
  }

  /** Resolve the effective rate for a type without consuming the RNG. */
  rateFor(type: string): number {
    const explicit = this.sampling[type];
    if (typeof explicit === 'number') return explicit;
    const fallback = this.sampling[DEFAULT_SAMPLING_KEY];
    if (typeof fallback === 'number') return fallback;
    return 1;
  }

  /**
   * True if an event of `type` should be kept. Consumes one RNG draw only
   * when the rate is strictly between 0 and 1 (so rate 0/1 decisions are
   * free and don't perturb deterministic test sequences).
   */
  shouldKeep(type: string): boolean {
    const rate = this.rateFor(type);
    if (rate >= 1) return true;
    if (rate <= 0) return false;
    return this.random() < rate;
  }
}

// ────────────────────────────────────────────────────────────
// Feature flags
// ────────────────────────────────────────────────────────────

/**
 * A toggle for a single named behaviour. `on()` / `off()` are invoked when the
 * corresponding flag transitions (or is first applied). Unknown flags (no
 * entry in the toggle map) are silently ignored — the SDK must never crash on
 * a flag the operator added for a newer SDK version.
 */
export interface FeatureToggle {
  on(): void;
  off(): void;
}

export interface ApplyFeatureFlagsResult {
  /** Flags whose value differed from the previous apply and were toggled. */
  readonly changed: readonly string[];
  /** Flags present in the config but with no registered toggle. */
  readonly ignored: readonly string[];
}

/**
 * Apply `config.featureFlags` against a registry of toggles, given the
 * previously-applied flag values. Only flags that (a) have a registered toggle
 * AND (b) changed value since `previous` fire their `on`/`off`. Returns the
 * diff for diagnostics. Pure aside from invoking the injected toggles.
 *
 * `previous` is the caller-held map of last-applied values; the caller updates
 * it from `config.featureFlags` after this returns.
 */
export function applyFeatureFlags(
  flags: Readonly<Record<string, boolean>>,
  toggles: Readonly<Record<string, FeatureToggle>>,
  previous: Readonly<Record<string, boolean>>,
): ApplyFeatureFlagsResult {
  const changed: string[] = [];
  const ignored: string[] = [];

  for (const [name, value] of Object.entries(flags)) {
    const toggle = toggles[name];
    if (!toggle) {
      ignored.push(name);
      continue;
    }
    // Fire when the flag is new (not in `previous`) or its value flipped.
    if (!(name in previous) || previous[name] !== value) {
      if (value) toggle.on();
      else toggle.off();
      changed.push(name);
    }
  }

  return { changed, ignored };
}

// ────────────────────────────────────────────────────────────
// PII rules
// ────────────────────────────────────────────────────────────

export interface PiiRuleSplit {
  /** Bare identifier rules → Sanitizer `extraSensitiveKeys`. */
  readonly sensitiveKeys: readonly string[];
  /** Regex-source rules → compiled Sanitizer `extraPatterns`. */
  readonly patterns: readonly RegExp[];
  /** Rules that looked like regex but failed to compile (skipped safely). */
  readonly invalid: readonly string[];
}

// A rule that is a single plain identifier (letters / digits / _ / - / .) is
// treated as a sensitive object-key name. Anything containing regex
// metacharacters is treated as a pattern source.
const PLAIN_KEY_RE = /^[A-Za-z0-9_.-]+$/;

/**
 * Partition free-form PII rule strings into the two inputs the Sanitizer
 * understands:
 *
 *   - a plain identifier (`email`, `ssn`, `card_number`) → a sensitive KEY
 *     name (the value under that key is fully redacted regardless of shape).
 *   - anything with regex metacharacters (`\d{3}-\d{2}-\d{4}`,
 *     `secret_[a-z]+`) → a redaction PATTERN compiled with the `g` flag.
 *
 * A pattern that fails to compile is collected into `invalid` and skipped — a
 * bad operator regex must never throw into the SDK. Total + pure.
 */
export function splitPiiRules(rules: readonly string[]): PiiRuleSplit {
  const sensitiveKeys: string[] = [];
  const patterns: RegExp[] = [];
  const invalid: string[] = [];

  for (const rule of rules) {
    if (rule.length === 0) continue;
    if (PLAIN_KEY_RE.test(rule)) {
      sensitiveKeys.push(rule);
      continue;
    }
    try {
      patterns.push(new RegExp(rule, 'g'));
    } catch {
      invalid.push(rule);
    }
  }

  return { sensitiveKeys, patterns, invalid };
}
