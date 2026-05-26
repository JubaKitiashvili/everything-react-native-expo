import type { MonitorEvent } from '../types';

export interface SanitizerOptions {
  /** Extra regex patterns applied to every string field. */
  extraPatterns?: readonly RegExp[];
  /** Extra header names to redact (case-insensitive). */
  extraHeaders?: readonly string[];
  /** Extra query parameter names to redact (case-insensitive). */
  extraQueryParams?: readonly string[];
  /**
   * Extra object-key names whose value is always treated as a secret and
   * fully redacted, regardless of value shape (case-insensitive).
   */
  extraSensitiveKeys?: readonly string[];
  /** Replacement token — defaults to '[REDACTED]'. */
  placeholder?: string;
}

const DEFAULT_PLACEHOLDER = '[REDACTED]';

// Email — RFC 5322 simplified pattern, good enough for PII scrubbing.
// Quantifiers are BOUNDED per RFC limits (local-part ≤64, domain ≤255, TLD
// 2–24) so the regex cannot backtrack into O(n²) on a long near-miss string
// (e.g. 64k of 'aaaa…a@' with no valid tail). Unbounded `+`/`*` here is a
// classic ReDoS amplifier; the caps keep each attempt's work linear.
const EMAIL_RE =
  /[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,255}\.[a-zA-Z]{2,24}/g;

// Hard cap on the length of a single string we run the (multiple) regex
// sweeps over. Above this, a hostile / runaway field could pin the JS thread
// even with bounded quantifiers — and operator-supplied `extraPatterns`
// regexes have NO such bound, so a single huge field is the real risk.
//
// We do NOT drop data: a string over the cap is sanitized in two pieces —
// the leading MAX_SANITIZE_LEN chars get the full sweep (that's where PII a
// user actually typed lives), and the untouched tail is appended verbatim.
// A short, explicit marker documents the boundary so the truncation is never
// silent or confusing. The tail is preserved so we never lose telemetry; it
// just isn't scrubbed (acceptable: a 16k+ single field is pathological and
// the head — the human-entered prefix — is the PII-bearing region).
const MAX_SANITIZE_LEN = 16_384;
const OVERSIZE_MARKER = '[…unsanitized-tail:';

// Phone numbers — international formats. Matches e.g. +1 555 123 4567,
// (415) 555-1212, +44 20 7946 0958. Deliberately loose to catch PII.
const PHONE_RE =
  /(?:\+?\d{1,3}[ .-]?)?\(?\d{2,4}\)?[ .-]?\d{2,4}[ .-]?\d{2,4}(?:[ .-]?\d{2,4})?/g;

// US Social Security Numbers — `123-45-6789`. Anchored on word boundaries
// so it doesn't swallow longer digit runs. Runs BEFORE the phone sweep.
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;

// Credit-card candidates — 13–19 digits, optionally grouped by single
// spaces or hyphens (e.g. `4111 1111 1111 1111`, `4111-1111-1111-1111`,
// `4111111111111111`). The match is only redacted when the digits pass a
// Luhn check (validateLuhn below), which keeps us from clobbering unrelated
// long numbers (order ids, timestamps). Runs BEFORE the phone sweep so the
// FULL number is replaced rather than a partial slice.
const CREDIT_CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;

// Bearer / OAuth tokens carried inline in free text, e.g.
// `Authorization: Bearer abc.def.ghi`. The phone sweep can't see these
// (they're alphanumeric), so we catch the whole `Bearer <token>` span.
const BEARER_TOKEN_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;

// High-entropy secret tokens with recognisable provider prefixes:
//   - Stripe: sk_live_…, sk_test_…, pk_live_…, rk_…
//   - GitHub: ghp_…, gho_…, ghs_…, ghr_…, github_pat_…
//   - Slack:  xoxb-…, xoxp-…, xoxa-…
//   - Google: AIza…
//   - AWS:    AKIA…  (access key id)
//   - JWTs:   three base64url segments separated by dots
// These shapes never appear in benign telemetry, so redacting the whole
// token is safe and high-value.
const SECRET_TOKEN_RES: readonly RegExp[] = [
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}\b/g,
  /\b(?:ghp|gho|ghs|ghr|github_pat)_[A-Za-z0-9_]{8,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bAIza[A-Za-z0-9_-]{20,}\b/g,
  /\bAKIA[A-Z0-9]{16}\b/g,
  // JWT — header.payload.signature, base64url segments.
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g,
];

const DEFAULT_SENSITIVE_HEADERS: readonly string[] = [
  'authorization',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'x-api-key',
  'x-auth-token',
];

const DEFAULT_SENSITIVE_QUERY_KEYS: readonly string[] = [
  'token',
  'key',
  'secret',
  'password',
  'api_key',
  'access_token',
  'refresh_token',
];

// Object-key names whose VALUE is always a secret/credential, regardless of
// the value's shape. The Sanitizer's pattern sweep only catches secrets it
// can recognise by content; these key names let us redact opaque values
// (e.g. `password: 'hunter2'`) that no content pattern would flag.
const DEFAULT_SENSITIVE_KEYS: readonly string[] = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'authorization',
  'auth',
  'token',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'api_key',
  'apikey',
  'apisecret',
  'api_secret',
  'client_secret',
  'clientsecret',
  'private_key',
  'privatekey',
  'session_token',
  'sessiontoken',
  'credit_card',
  'creditcard',
  'card_number',
  'cardnumber',
  'cvv',
  'ssn',
];

/**
 * Luhn checksum — used to confirm a digit run is a plausible payment-card
 * number before redacting it as one. Keeps the credit-card sweep from
 * clobbering unrelated 13–19 digit identifiers.
 */
function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48; // '0' = 48
    if (d < 0 || d > 9) return false;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Sanitizer strips PII from events before they land on the EventStore or
 * are shipped to any transport. Runs as a pure function — callers pipe
 * every event through sanitize() in the processor stage of the pipeline.
 */
export class Sanitizer {
  private readonly placeholder: string;
  private extraPatterns: RegExp[];
  private readonly sensitiveHeaders: Set<string>;
  private readonly sensitiveQueryKeys: Set<string>;
  private readonly sensitiveKeys: Set<string>;

  constructor(options: SanitizerOptions = {}) {
    this.placeholder = options.placeholder ?? DEFAULT_PLACEHOLDER;
    this.extraPatterns = [...(options.extraPatterns ?? [])];
    this.sensitiveHeaders = new Set(
      [...DEFAULT_SENSITIVE_HEADERS, ...(options.extraHeaders ?? [])].map((h) =>
        h.toLowerCase(),
      ),
    );
    this.sensitiveQueryKeys = new Set(
      [
        ...DEFAULT_SENSITIVE_QUERY_KEYS,
        ...(options.extraQueryParams ?? []),
      ].map((k) => k.toLowerCase()),
    );
    this.sensitiveKeys = new Set(
      [
        ...DEFAULT_SENSITIVE_KEYS,
        ...(options.extraSensitiveKeys ?? []),
      ].map((k) => k.toLowerCase()),
    );
  }

  /**
   * Task 117.55 — register extra sensitive object-key names at runtime
   * (case-insensitive). Used by the remote-config applier to push the
   * operator's PII key rules into an already-constructed Sanitizer. Idempotent
   * — duplicates collapse via the backing Set.
   */
  addSensitiveKeys(keys: readonly string[]): void {
    for (const key of keys) {
      this.sensitiveKeys.add(key.toLowerCase());
    }
  }

  /**
   * Task 117.55 — register extra redaction patterns at runtime. Every pattern
   * is normalised to a global regex (so `.replace` sweeps all matches) before
   * being appended to the sweep list.
   */
  addPatterns(patterns: readonly RegExp[]): void {
    for (const pattern of patterns) {
      this.extraPatterns.push(pattern.global ? pattern : new RegExp(pattern, 'g'));
    }
  }

  sanitize(event: MonitorEvent): MonitorEvent {
    return {
      ...event,
      data: this.sanitizeValue(event.data),
    };
  }

  /**
   * Redacts a single string: emails, phone numbers, configured patterns.
   * Exposed for targeted use by other processors (e.g. stack trace
   * sanitization).
   */
  sanitizeString(value: string): string {
    // Length guard: above MAX_SANITIZE_LEN, only sweep the head (where
    // user-typed PII lives) and re-attach the unscrubbed tail behind an
    // explicit marker. This bounds the work of EVERY sweep below — including
    // operator-supplied `extraPatterns` regexes, which carry no quantifier
    // bound of their own — so no single oversized field can hang the JS
    // thread. No data is dropped: the tail is preserved verbatim.
    if (value.length > MAX_SANITIZE_LEN) {
      const head = value.slice(0, MAX_SANITIZE_LEN);
      const tail = value.slice(MAX_SANITIZE_LEN);
      return `${this.sanitizeString(head)}${OVERSIZE_MARKER}${tail.length}chars]${tail}`;
    }

    let out = value.replace(EMAIL_RE, this.placeholder);

    // Structured-PII passes run BEFORE the loose phone sweep so the whole
    // token/number is replaced rather than a partial digit slice.
    out = out.replace(SSN_RE, this.placeholder);
    out = out.replace(CREDIT_CARD_RE, (match) => {
      const digits = match.replace(/\D/g, '');
      // 13–19 digits AND a valid Luhn checksum → treat as a card number.
      if (digits.length >= 13 && digits.length <= 19 && passesLuhn(digits)) {
        return this.placeholder;
      }
      return match;
    });
    out = out.replace(BEARER_TOKEN_RE, this.placeholder);
    for (const re of SECRET_TOKEN_RES) {
      out = out.replace(re, this.placeholder);
    }

    out = out.replace(PHONE_RE, (match) => {
      // Only redact matches that contain enough digits to look like a
      // phone number. This avoids redacting timestamps or ids that slip
      // through the loose regex.
      const digits = match.replace(/\D/g, '');
      return digits.length >= 7 ? this.placeholder : match;
    });
    for (const pattern of this.extraPatterns) {
      const re = pattern.global ? pattern : new RegExp(pattern, 'g');
      out = out.replace(re, this.placeholder);
    }
    return out;
  }

  sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      for (const key of Array.from(parsed.searchParams.keys())) {
        if (this.sensitiveQueryKeys.has(key.toLowerCase())) {
          parsed.searchParams.set(key, this.placeholder);
        }
      }
      return parsed.toString();
    } catch {
      // Relative URLs and malformed inputs: scrub via regex.
      return url.replace(
        /([?&])([^=&]+)=([^&]*)/g,
        (match, sep: string, key: string, value: string) =>
          this.sensitiveQueryKeys.has(key.toLowerCase())
            ? `${sep}${key}=${this.placeholder}`
            : match,
      );
    }
  }

  sanitizeHeaders(
    headers: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    if (!headers) return headers;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (this.sensitiveHeaders.has(key.toLowerCase())) {
        out[key] = this.placeholder;
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  private sanitizeValue(value: unknown, keyPath: string = ''): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
      // URL-like strings get URL-specific redaction, everything else the
      // generic sweep.
      if (keyPath === 'url' || keyPath.endsWith('.url')) {
        return this.sanitizeUrl(this.sanitizeString(value));
      }
      return this.sanitizeString(value);
    }
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) {
      return value.map((item, i) => this.sanitizeValue(item, `${keyPath}[${i}]`));
    }
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const lowerKey = k.toLowerCase();
      if (lowerKey === 'headers' && v && typeof v === 'object') {
        out[k] = this.sanitizeHeaders(v as Record<string, unknown>);
        continue;
      }
      // Key-name redaction: any value under a known credential key name is
      // fully redacted regardless of shape (string, number, nested object).
      // Skip null/undefined so the "preserve null/undefined" contract holds.
      if (this.sensitiveKeys.has(lowerKey) && v !== null && v !== undefined) {
        out[k] = this.placeholder;
        continue;
      }
      out[k] = this.sanitizeValue(v, keyPath ? `${keyPath}.${k}` : k);
    }
    return out;
  }
}
