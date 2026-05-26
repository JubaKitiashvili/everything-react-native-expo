// Task 117.95 — privacy-provable adversarial test suite for the SDK's
// outbound redaction layer (Sanitizer). It feeds known PII through the
// SDK's public capture/redaction entry point (`Sanitizer.sanitize`) and
// asserts the SERIALIZED outbound payload contains NO raw PII.
//
// WHY THIS IS PROVABLE
// --------------------
// The transport (`BatchTransport.flush`) ships events with exactly:
//
//     JSON.stringify({ id, events: batch, sentAt })
//
// where `batch` is the list of sanitized + enriched events produced by the
// pipeline in `createMonitorRuntime` (… → Sanitizer.sanitize → Enricher →
// EventStore → transport). This suite reproduces that serialization step on
// the sanitized event and scans the resulting wire string for raw PII. If a
// raw secret survives anywhere in the JSON — at any nesting depth, in any
// field — `serializedOutbound()` will contain it and the assertion fails.
//
// STYLE mirrors the MCP prompt-injection red-team corpus
// (mcp/src/sanitize.redteam.test.ts): a declarative table of adversarial
// cases, each with `forbidden` substrings that must NOT survive and an
// expectation about the `[REDACTED]` marker, followed by a deterministic
// property sweep over random combinations.
//
// HONESTY NOTE (policy boundary): the SDK's documented PII scope (README) is
// "email / phone / auth headers / URLs". This suite additionally proves the
// hardened categories required by Task 117.95 (credit cards, SSNs, auth
// tokens / bearer / API keys, common credential key-names). IP addresses are
// intentionally NOT redacted by current policy — see the dedicated
// describe-block below, which asserts the ACTUAL (un-redacted) behaviour
// rather than faking a guarantee.

import { Sanitizer } from './Sanitizer';
import type { MonitorEvent } from '../types';

const PLACEHOLDER = '[REDACTED]';

function makeEvent(data: unknown): MonitorEvent {
  return {
    type: 'custom',
    timestamp: 123,
    wallTime: 1_716_800_000_000,
    sessionId: 'sess-abc',
    data,
  };
}

/**
 * Reproduce the exact wire serialization the transport performs on a batch
 * containing the sanitized event. This is the "would-be-sent payload".
 */
function serializedOutbound(sanitizer: Sanitizer, data: unknown): string {
  const sanitized = sanitizer.sanitize(makeEvent(data));
  return JSON.stringify({
    id: 'batch-1',
    events: [sanitized],
    sentAt: 1_716_800_000_001,
  });
}

interface AdversarialCase {
  name: string;
  /** PII category (for reporting / grouping). */
  category: string;
  /** Realistic structure carrying the PII through the pipeline. */
  build: () => unknown;
  /** Raw substrings that MUST NOT survive in the serialized payload. */
  forbidden: string[];
  /** When true, the serialized payload must contain the redaction marker. */
  expectMarker?: boolean;
}

// Valid Luhn card numbers (so the credit-card pass actually fires).
const VISA = '4111 1111 1111 1111'; // valid Luhn test Visa
const VISA_SOLID = '4111111111111111';
const MASTERCARD = '5500 0000 0000 0004'; // valid Luhn test MC
const AMEX = '3782 822463 10005'; // valid Luhn test Amex (15 digits)

const CORPUS: AdversarialCase[] = [
  // ── Emails ──────────────────────────────────────────────────────────
  {
    name: 'email in message string',
    category: 'email',
    build: () => ({ message: 'Login failed for jane.doe@example.com' }),
    forbidden: ['jane.doe@example.com'],
    expectMarker: true,
  },
  {
    name: 'email in nested array of breadcrumbs',
    category: 'email',
    build: () => ({
      breadcrumbs: [
        { text: 'tapped login' },
        { text: 'sent invite to bob+test@sub.example.co.uk' },
      ],
    }),
    forbidden: ['bob+test@sub.example.co.uk'],
    expectMarker: true,
  },
  {
    name: 'email as object value',
    category: 'email',
    build: () => ({ user: { contactEmail: 'alice@corp.internal' } }),
    forbidden: ['alice@corp.internal'],
    expectMarker: true,
  },

  // ── Phone numbers ───────────────────────────────────────────────────
  {
    name: 'US phone with parens',
    category: 'phone',
    build: () => ({ message: 'callback to (415) 555-1212 requested' }),
    forbidden: ['415) 555-1212', '4155551212'],
    expectMarker: true,
  },
  {
    name: 'international phone with +',
    category: 'phone',
    build: () => ({ note: 'whatsapp +44 20 7946 0958 number' }),
    forbidden: ['20 7946 0958', '442079460958'],
    expectMarker: true,
  },

  // ── Credit cards (Luhn-valid) ───────────────────────────────────────
  {
    name: 'Visa spaced in message',
    category: 'credit-card',
    build: () => ({ message: `charged card ${VISA} ok` }),
    forbidden: [VISA, '4111111111111111'],
    expectMarker: true,
  },
  {
    name: 'Visa solid (no separators)',
    category: 'credit-card',
    build: () => ({ payment: { pan: `${VISA_SOLID}` } }),
    // The whole 16-digit run must be gone; assert no 13+ digit prefix slice.
    forbidden: [VISA_SOLID, '411111111111111', '41111111111111'],
    expectMarker: true,
  },
  {
    name: 'Mastercard dashed in nested object',
    category: 'credit-card',
    build: () => ({ order: { billing: { card: MASTERCARD.replace(/ /g, '-') } } }),
    forbidden: [MASTERCARD.replace(/ /g, '-'), '5500000000000004'],
    expectMarker: true,
  },
  {
    name: 'Amex 15-digit',
    category: 'credit-card',
    build: () => ({ message: `paid with amex ${AMEX}` }),
    forbidden: [AMEX, '378282246310005'],
    expectMarker: true,
  },

  // ── SSNs ────────────────────────────────────────────────────────────
  {
    name: 'SSN in message',
    category: 'ssn',
    build: () => ({ message: 'verify identity ssn 123-45-6789 today' }),
    forbidden: ['123-45-6789'],
    expectMarker: true,
  },
  {
    name: 'SSN as object value under ssn key',
    category: 'ssn',
    build: () => ({ kyc: { ssn: '078-05-1120' } }),
    forbidden: ['078-05-1120'],
    expectMarker: true,
  },

  // ── Auth tokens / bearer / API keys ─────────────────────────────────
  {
    name: 'Bearer token inline in string',
    category: 'auth-token',
    build: () => ({
      message: 'request failed Authorization: Bearer aB3.cD5_eF7-gH9iJ0kL1mN2',
    }),
    forbidden: ['aB3.cD5_eF7-gH9iJ0kL1mN2', 'Bearer aB3'],
    expectMarker: true,
  },
  {
    name: 'Stripe secret key in string',
    category: 'auth-token',
    build: () => ({ note: 'using sk_live_51AbCdEfGhIjKlMnOpQrStUv to bill' }),
    forbidden: ['sk_live_51AbCdEfGhIjKlMnOpQrStUv'],
    expectMarker: true,
  },
  {
    name: 'GitHub PAT in string',
    category: 'auth-token',
    build: () => ({ message: 'clone with ghp_ABCdef1234567890ghIJKLmnopQRST failed' }),
    forbidden: ['ghp_ABCdef1234567890ghIJKLmnopQRST'],
    expectMarker: true,
  },
  {
    name: 'Slack bot token in string',
    category: 'auth-token',
    build: () => ({ note: 'webhook xoxb-123456789012-ABCDEFghijklMNOPqrst rejected' }),
    forbidden: ['xoxb-123456789012-ABCDEFghijklMNOPqrst'],
    expectMarker: true,
  },
  {
    name: 'Google API key in string',
    category: 'auth-token',
    build: () => ({ message: 'maps key AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q rejected' }),
    forbidden: ['AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q'],
    expectMarker: true,
  },
  {
    name: 'AWS access key id in string',
    category: 'auth-token',
    build: () => ({ note: 'creds AKIAIOSFODNN7EXAMPLE leaked' }),
    forbidden: ['AKIAIOSFODNN7EXAMPLE'],
    expectMarker: true,
  },
  {
    name: 'JWT in string',
    category: 'auth-token',
    build: () => ({
      message:
        'session jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c expired',
    }),
    forbidden: [
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    ],
    expectMarker: true,
  },

  // ── Credential key-names (opaque values redacted by key) ────────────
  {
    name: 'password key with opaque value',
    category: 'key-name',
    build: () => ({ form: { username: 'jdoe', password: 'hunter2' } }),
    forbidden: ['hunter2'],
    expectMarker: true,
  },
  {
    name: 'secret + api_key + client_secret keys',
    category: 'key-name',
    build: () => ({
      config: {
        secret: 'superSecretValue',
        api_key: 'plainkey12345',
        client_secret: 'csk_plain_value',
      },
    }),
    forbidden: ['superSecretValue', 'plainkey12345', 'csk_plain_value'],
    expectMarker: true,
  },
  {
    name: 'authorization key with token',
    category: 'key-name',
    build: () => ({ request: { authorization: 'Token rawvalue999' } }),
    forbidden: ['rawvalue999'],
    expectMarker: true,
  },
  {
    name: 'cvv numeric value under cvv key',
    category: 'key-name',
    build: () => ({ payment: { cvv: 321 } }),
    forbidden: ['"cvv":321'],
    expectMarker: true,
  },
  {
    name: 'nested credential under arbitrary path',
    category: 'key-name',
    build: () => ({
      a: { b: { c: { privateKey: '-----BEGIN KEY-----abc-----END KEY-----' } } },
    }),
    forbidden: ['-----BEGIN KEY-----abc-----END KEY-----', 'BEGIN KEY'],
    expectMarker: true,
  },

  // ── HTTP auth headers ───────────────────────────────────────────────
  {
    name: 'Authorization header in request envelope',
    category: 'header',
    build: () => ({
      request: {
        headers: {
          Authorization: 'Bearer headerToken123',
          'X-API-Key': 'apikeyHeaderValue',
          'Content-Type': 'application/json',
        },
      },
    }),
    forbidden: ['headerToken123', 'apikeyHeaderValue', 'Bearer headerToken123'],
    expectMarker: true,
  },
  {
    name: 'Cookie + Set-Cookie headers',
    category: 'header',
    build: () => ({
      response: {
        headers: {
          Cookie: 'session=abc123def456; csrf=zzz',
          'Set-Cookie': 'auth=topsecretcookie; HttpOnly',
        },
      },
    }),
    forbidden: ['abc123def456', 'topsecretcookie'],
    expectMarker: true,
  },

  // ── URLs with sensitive query params ────────────────────────────────
  {
    name: 'url field with token + password query params',
    category: 'url',
    build: () => ({
      url: 'https://api.example.com/v1/login?token=qsToken789&password=qsPass000&page=2',
      method: 'GET',
    }),
    forbidden: ['qsToken789', 'qsPass000'],
    expectMarker: true,
  },
  {
    name: 'nested .url field with access_token',
    category: 'url',
    build: () => ({
      network: { url: 'https://x.example/cb?access_token=at_raw_value&ok=1' },
    }),
    forbidden: ['at_raw_value'],
    expectMarker: true,
  },
  {
    name: 'email embedded in url query value',
    category: 'url',
    build: () => ({
      url: 'https://api.example.com/track?email=leak@example.com&utm=ad',
    }),
    forbidden: ['leak@example.com'],
    expectMarker: true,
  },

  // ── Mixed / realistic crash-like payload ────────────────────────────
  {
    name: 'realistic crash payload with many PII types',
    category: 'mixed',
    build: () => ({
      kind: 'exception',
      message: `Failed POST for user@host.com with ${VISA}`,
      stack: 'at login (Bearer aB3.cD5_eF7-gH9iJ0kL1mN2)\nat run',
      context: {
        password: 'p@ssw0rd',
        url: 'https://api.example.com/login?token=tok_raw&keep=1',
        headers: { Authorization: 'Bearer crashHdrTok' },
        phone: 'call +1 415 555 1212',
      },
    }),
    forbidden: [
      'user@host.com',
      VISA,
      'aB3.cD5_eF7-gH9iJ0kL1mN2',
      'p@ssw0rd',
      'tok_raw',
      'crashHdrTok',
      '415 555 1212',
    ],
    expectMarker: true,
  },
];

describe('Sanitizer red-team — serialized outbound payload contains no PII', () => {
  const sanitizer = new Sanitizer();

  for (const c of CORPUS) {
    test(`[${c.category}] ${c.name}`, () => {
      const wire = serializedOutbound(sanitizer, c.build());

      for (const forbidden of c.forbidden) {
        // Hard fail with rich context if any raw PII survives serialization.
        if (wire.includes(forbidden) || wire.toLowerCase().includes(forbidden.toLowerCase())) {
          throw new Error(
            `case "${c.name}" leaked raw "${forbidden}" into the outbound payload:\n${wire}`,
          );
        }
        expect(wire).not.toContain(forbidden);
        // Also defend against case-only smuggling.
        expect(wire.toLowerCase()).not.toContain(forbidden.toLowerCase());
      }

      if (c.expectMarker) {
        // The marker appears verbatim ("[REDACTED]") in JSON string values,
        // and percent-encoded ("%5BREDACTED%5D") inside redacted URL query
        // params. Either form proves redaction fired.
        const hasMarker =
          wire.includes(PLACEHOLDER) || wire.includes('%5BREDACTED%5D');
        expect(hasMarker).toBe(true);
      }
    });
  }

  test('corpus covers every required PII category (acceptance bar)', () => {
    const categories = new Set(CORPUS.map((c) => c.category));
    for (const required of [
      'email',
      'phone',
      'credit-card',
      'ssn',
      'auth-token',
      'key-name',
      'header',
      'url',
    ]) {
      if (!categories.has(required)) {
        throw new Error(`missing red-team coverage for required category: ${required}`);
      }
      expect(categories).toContain(required);
    }
    // Names are unique so a typo can't silently disable a case.
    const names = new Set(CORPUS.map((c) => c.name));
    expect(names.size).toBe(CORPUS.length);
  });
});

describe('Sanitizer red-team — benign data is preserved (no over-redaction)', () => {
  const sanitizer = new Sanitizer();

  test('non-PII fields survive untouched', () => {
    const wire = serializedOutbound(sanitizer, {
      screen: 'CheckoutScreen',
      componentName: 'UserCard',
      renderCount: 5,
      durationMs: 123.4,
      orderRef: 'ORD-XY',
      status: 'success',
      tags: ['fast', 'cached'],
    });
    expect(wire).toContain('CheckoutScreen');
    expect(wire).toContain('UserCard');
    expect(wire).toContain('"renderCount":5');
    expect(wire).toContain('success');
    expect(wire).toContain('cached');
    // No spurious redaction marker on clean data.
    expect(wire).not.toContain(PLACEHOLDER);
  });

  test('null and undefined under sensitive keys are preserved, not stringified', () => {
    const sanitized = sanitizer.sanitize(
      makeEvent({ password: null, token: undefined as unknown as string, keep: 1 }),
    );
    const data = sanitized.data as {
      password: unknown;
      token: unknown;
      keep: number;
    };
    expect(data.password).toBeNull();
    expect(data.token).toBeUndefined();
    expect(data.keep).toBe(1);
  });
});

describe('Sanitizer red-team — policy decision: IP addresses', () => {
  // TODO(117.95): policy decision — IP addresses are NOT redacted by current
  // SDK policy. The documented PII scope (README) is "email / phone / auth
  // headers / URLs"; IPs are commonly retained for geo/diagnostics. This test
  // asserts the ACTUAL behaviour so the guarantee stays honest. If product
  // later decides IPs are PII for this app, add an IP pass to Sanitizer and
  // flip these assertions.
  const sanitizer = new Sanitizer();

  test('IPv4 currently survives (documented, intentional)', () => {
    const wire = serializedOutbound(sanitizer, {
      message: 'connection from 192.168.1.42 reset',
    });
    expect(wire).toContain('192.168.1.42');
  });

  test('IPv6 currently survives (documented, intentional)', () => {
    const wire = serializedOutbound(sanitizer, {
      message: 'peer 2001:db8::ff00:42:8329 dropped',
    });
    expect(wire).toContain('2001:db8::ff00:42:8329');
  });

  test('opt-in: callers can redact IPs via extraPatterns', () => {
    // Proves the escape hatch works for privacy-strict deployments.
    const strict = new Sanitizer({
      extraPatterns: [/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g],
    });
    const wire = serializedOutbound(strict, {
      message: 'connection from 192.168.1.42 reset',
    });
    expect(wire).not.toContain('192.168.1.42');
    expect(wire).toContain(PLACEHOLDER);
  });
});

describe('Sanitizer red-team — property sweep over random PII combinations', () => {
  // Mulberry32 — small deterministic PRNG so failures reproduce from the seed.
  function mulberry32(a: number): () => number {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // The sweep combines REALISTIC corpus payloads (which carry their PII in
  // the detectable form an attacker/leak would actually produce — e.g.
  // "Bearer <tok>", "card 4111…", "ssn 123-45-6789") rather than bare,
  // context-stripped secrets. A context-free opaque blob (an unlabeled token
  // sitting alone with no key name, prefix, or shape) is deliberately out of
  // scope: catching it would require entropy heuristics that over-redact
  // benign ids/UUIDs/hashes. We only assert forbidden substrings that retain
  // their detectable context.
  const SWEEP_CASES = CORPUS.filter((c) => c.category !== 'mixed').map((c) => {
    // Render each case to a single free-text fragment plus its forbidden set,
    // re-using the structure the case ships in.
    return c;
  });

  test('1000 random PII combinations never leak a forbidden token', () => {
    const sanitizer = new Sanitizer();
    const rand = mulberry32(0x117_95);
    const benignNoise = [
      'TypeError: undefined is not an object',
      'app booted in 412ms',
      'navigated to Home',
      'order ORD-77 confirmed',
      'cache hit ratio 0.87',
      '',
      '   \n   ',
    ];

    for (let i = 0; i < 1000; i++) {
      const a = SWEEP_CASES[
        Math.floor(rand() * SWEEP_CASES.length)
      ] as AdversarialCase;
      const b = SWEEP_CASES[
        Math.floor(rand() * SWEEP_CASES.length)
      ] as AdversarialCase;
      const noise = benignNoise[
        Math.floor(rand() * benignNoise.length)
      ] as string;

      // Build a combined nested structure that interleaves two real PII
      // cases plus benign noise — exercises recursion + ordering of passes.
      const combined = {
        kind: 'exception',
        noise,
        first: a.build(),
        second: b.build(),
        breadcrumbs: [{ text: noise }, a.build(), b.build()],
      };
      const wire = serializedOutbound(sanitizer, combined);
      const lower = wire.toLowerCase();

      for (const raw of [...a.forbidden, ...b.forbidden]) {
        if (raw.length === 0) continue;
        // Structure-shaped assertions (e.g. '"cvv":321') only hold in their
        // own structure; skip when checking the combined free-form mix.
        if (raw.startsWith('"')) continue;
        // IPs are intentionally not redacted (asserted above) — but the
        // corpus has no IP forbidden entries, so this is belt-and-braces.
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(raw)) continue;
        if (lower.includes(raw.toLowerCase())) {
          throw new Error(
            `iteration ${i} (combo "${a.name}" + "${b.name}") leaked raw PII "${raw}"\n` +
              `  wire: ${wire}`,
          );
        }
      }
    }
  });
});
