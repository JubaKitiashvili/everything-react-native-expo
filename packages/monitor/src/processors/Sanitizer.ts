import type { MonitorEvent } from '../types';

export interface SanitizerOptions {
  /** Extra regex patterns applied to every string field. */
  extraPatterns?: readonly RegExp[];
  /** Extra header names to redact (case-insensitive). */
  extraHeaders?: readonly string[];
  /** Extra query parameter names to redact (case-insensitive). */
  extraQueryParams?: readonly string[];
  /** Replacement token — defaults to '[REDACTED]'. */
  placeholder?: string;
}

const DEFAULT_PLACEHOLDER = '[REDACTED]';

// Email — RFC 5322 simplified pattern, good enough for PII scrubbing.
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Phone numbers — international formats. Matches e.g. +1 555 123 4567,
// (415) 555-1212, +44 20 7946 0958. Deliberately loose to catch PII.
const PHONE_RE =
  /(?:\+?\d{1,3}[ .-]?)?\(?\d{2,4}\)?[ .-]?\d{2,4}[ .-]?\d{2,4}(?:[ .-]?\d{2,4})?/g;

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

/**
 * Sanitizer strips PII from events before they land on the EventStore or
 * are shipped to any transport. Runs as a pure function — callers pipe
 * every event through sanitize() in the processor stage of the pipeline.
 */
export class Sanitizer {
  private readonly placeholder: string;
  private readonly extraPatterns: readonly RegExp[];
  private readonly sensitiveHeaders: Set<string>;
  private readonly sensitiveQueryKeys: Set<string>;

  constructor(options: SanitizerOptions = {}) {
    this.placeholder = options.placeholder ?? DEFAULT_PLACEHOLDER;
    this.extraPatterns = options.extraPatterns ?? [];
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
    let out = value.replace(EMAIL_RE, this.placeholder);
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
      if (k.toLowerCase() === 'headers' && v && typeof v === 'object') {
        out[k] = this.sanitizeHeaders(v as Record<string, unknown>);
        continue;
      }
      out[k] = this.sanitizeValue(v, keyPath ? `${keyPath}.${k}` : k);
    }
    return out;
  }
}
