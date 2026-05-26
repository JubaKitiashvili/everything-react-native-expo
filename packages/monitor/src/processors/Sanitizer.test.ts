import { Sanitizer } from './Sanitizer';
import type { MonitorEvent } from '../types';

function evt(data: unknown): MonitorEvent {
  return {
    type: 'custom',
    timestamp: 0,
    wallTime: 0,
    sessionId: 'test',
    data,
  };
}

describe('Sanitizer', () => {
  describe('strings', () => {
    it('redacts email addresses', () => {
      const s = new Sanitizer();
      expect(s.sanitizeString('contact user@example.com now')).toBe(
        'contact [REDACTED] now',
      );
    });

    it('redacts phone numbers', () => {
      const s = new Sanitizer();
      expect(s.sanitizeString('Call +1 415 555 1212 please')).toContain(
        '[REDACTED]',
      );
      expect(s.sanitizeString('Call +1 415 555 1212 please')).not.toContain(
        '415 555',
      );
    });

    it('does not redact short number sequences', () => {
      const s = new Sanitizer();
      // '42' is not phone-like
      expect(s.sanitizeString('answer is 42')).toBe('answer is 42');
    });

    it('applies extra user patterns', () => {
      const s = new Sanitizer({ extraPatterns: [/\bAPI-\w+\b/g] });
      expect(s.sanitizeString('key API-ABC123 used')).toBe(
        'key [REDACTED] used',
      );
    });

    it('uses custom placeholder', () => {
      const s = new Sanitizer({ placeholder: '***' });
      expect(s.sanitizeString('user@example.com')).toBe('***');
    });
  });

  describe('URLs', () => {
    it('redacts sensitive query params', () => {
      const s = new Sanitizer();
      const out = s.sanitizeUrl(
        'https://api.example.com/endpoint?token=abc&name=jane',
      );
      expect(out).toContain('token=%5BREDACTED%5D');
      expect(out).toContain('name=jane');
    });

    it('redacts additional query keys via options', () => {
      const s = new Sanitizer({ extraQueryParams: ['session_id'] });
      const out = s.sanitizeUrl(
        'https://api.example.com/x?session_id=abc&ok=1',
      );
      expect(out).toContain('session_id=%5BREDACTED%5D');
      expect(out).toContain('ok=1');
    });

    it('handles relative URLs with regex fallback', () => {
      const s = new Sanitizer();
      expect(s.sanitizeUrl('/api/x?secret=abc&ok=1')).toBe(
        '/api/x?secret=[REDACTED]&ok=1',
      );
    });
  });

  describe('headers', () => {
    it('redacts sensitive headers case-insensitively', () => {
      const s = new Sanitizer();
      const out = s.sanitizeHeaders({
        Authorization: 'Bearer abc',
        'X-API-KEY': 'k',
        'Content-Type': 'application/json',
      });
      expect(out?.Authorization).toBe('[REDACTED]');
      expect(out?.['X-API-KEY']).toBe('[REDACTED]');
      expect(out?.['Content-Type']).toBe('application/json');
    });

    it('accepts extra headers via options', () => {
      const s = new Sanitizer({ extraHeaders: ['x-custom-secret'] });
      const out = s.sanitizeHeaders({ 'X-Custom-Secret': 'foo' });
      expect(out?.['X-Custom-Secret']).toBe('[REDACTED]');
    });

    it('passes undefined through', () => {
      const s = new Sanitizer();
      expect(s.sanitizeHeaders(undefined)).toBeUndefined();
    });
  });

  describe('sanitize(event)', () => {
    it('walks nested objects and arrays', () => {
      const s = new Sanitizer();
      const input = evt({
        user: { email: 'jane@example.com', name: 'Jane' },
        recent: ['alice@x.com', 'bob@y.com'],
        count: 3,
      });
      const out = s.sanitize(input);
      const data = out.data as {
        user: { email: string; name: string };
        recent: string[];
        count: number;
      };
      expect(data.user.email).toBe('[REDACTED]');
      expect(data.user.name).toBe('Jane');
      expect(data.recent).toEqual(['[REDACTED]', '[REDACTED]']);
      expect(data.count).toBe(3);
    });

    it('treats nested `headers` keys as HTTP header maps', () => {
      const s = new Sanitizer();
      const out = s.sanitize(
        evt({
          request: {
            headers: { Authorization: 'Bearer tok', 'X-Trace': 'ok' },
          },
        }),
      );
      const data = out.data as {
        request: { headers: Record<string, unknown> };
      };
      expect(data.request.headers.Authorization).toBe('[REDACTED]');
      expect(data.request.headers['X-Trace']).toBe('ok');
    });

    it('redacts a url field with query params', () => {
      const s = new Sanitizer();
      const out = s.sanitize(
        evt({
          url: 'https://api.example.com/a?token=xyz&keep=1',
          method: 'GET',
        }),
      );
      const data = out.data as { url: string; method: string };
      expect(data.url).toContain('token=%5BREDACTED%5D');
      expect(data.method).toBe('GET');
    });

    it('does not mutate the input event', () => {
      const s = new Sanitizer();
      const input = evt({ email: 'a@b.com' });
      s.sanitize(input);
      expect((input.data as { email: string }).email).toBe('a@b.com');
    });

    it('preserves null and undefined', () => {
      const s = new Sanitizer();
      const out = s.sanitize(
        evt({ a: null, b: undefined as unknown as string }),
      );
      const data = out.data as { a: unknown; b: unknown };
      expect(data.a).toBeNull();
      expect(data.b).toBeUndefined();
    });
  });

  // Regression: a long near-miss string (e.g. 64k of 'a' then a space) must
  // NOT cause the EMAIL_RE (or any extraPatterns) sweep to backtrack into a
  // multi-second hang. With bounded quantifiers + the length guard this stays
  // fast, and large legit strings are still handled (no data dropped).
  describe('ReDoS / oversized-field guard', () => {
    it('processes a 64k near-miss string well under a wall-clock bound', () => {
      const s = new Sanitizer();
      // No '@', no valid email tail — the worst case for an unbounded EMAIL_RE.
      const hostile = 'a'.repeat(64000) + ' ';
      const start = Date.now();
      const out = s.sanitizeString(hostile);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
      expect(typeof out).toBe('string');
    });

    it('does not hang even with a greedy operator-supplied extra pattern', () => {
      // An operator regex with no quantifier bound of its own — the length
      // guard is what keeps this from running unbounded on a huge field.
      const s = new Sanitizer({ extraPatterns: [/(a+)+$/g] });
      const hostile = 'a'.repeat(64000) + 'b';
      const start = Date.now();
      const out = s.sanitizeString(hostile);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
      expect(typeof out).toBe('string');
    });

    it('preserves the oversized tail verbatim (no silent data loss)', () => {
      const s = new Sanitizer();
      const tail = 'TAIL_MARKER_' + 'z'.repeat(100);
      // Head over the 16_384 cap, then a recognisable tail.
      const input = 'x'.repeat(20000) + tail;
      const out = s.sanitizeString(input);
      // The unscrubbed tail survives intact behind the documented marker.
      expect(out).toContain(tail);
      expect(out).toContain('[…unsanitized-tail:');
    });

    it('still redacts PII that sits in the swept head of an oversized field', () => {
      const s = new Sanitizer();
      const input = 'contact me at user@example.com ' + 'q'.repeat(30000);
      const out = s.sanitizeString(input);
      expect(out).not.toContain('user@example.com');
      expect(out).toContain('[REDACTED]');
    });

    it('handles a large legit email-bearing string correctly', () => {
      const s = new Sanitizer();
      const input = 'log line '.repeat(1000) + ' from alice@example.com';
      const out = s.sanitize(evt({ note: input }));
      const data = out.data as { note: string };
      expect(data.note).not.toContain('alice@example.com');
      expect(data.note).toContain('[REDACTED]');
    });
  });
});
