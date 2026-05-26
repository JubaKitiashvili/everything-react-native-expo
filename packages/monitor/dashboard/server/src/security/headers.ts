// Task 117.66 — CSP + security response headers.
//
// The dashboard ships a single-page app over HTTP and talks to the
// server over a WebSocket. We harden every response with a small,
// well-understood set of headers:
//
//   Content-Security-Policy   — restricts where the SPA may load code,
//     styles, images, fonts, and open connections from. Tightest header
//     here; only applied to the HTML shell (CSP on a JSON API response
//     is meaningless — JSON is never a browsing context — and risks
//     breaking nothing useful while adding header weight).
//   Strict-Transport-Security — forces HTTPS for a year incl. subdomains.
//     Harmless on plain HTTP (browsers ignore it on non-HTTPS origins)
//     but correct the moment the dashboard sits behind TLS.
//   X-Frame-Options: DENY     — the dashboard must never be framed
//     (clickjacking defence). CSP `frame-ancestors 'none'` covers modern
//     browsers; this header covers the long tail.
//   X-Content-Type-Options: nosniff — stop MIME sniffing.
//   Referrer-Policy           — never leak full dashboard URLs (which can
//     carry an `?apiKey=` query) to third-party origins.
//
// The default CSP is deliberately conservative but SPA-friendly:
//   - default-src 'self'                     same-origin by default
//   - script-src 'self'                      no inline scripts (the app
//                                            bundle is an external file)
//   - style-src 'self' 'unsafe-inline'       inline styles are common in
//                                            React/Vite builds; relaxing
//                                            this avoids breaking the app
//   - img-src 'self' data: blob:             charts/avatars as data URIs
//   - font-src 'self' data:                  bundled webfonts
//   - connect-src 'self' ws: wss:            the live WebSocket feed
//   - object-src 'none' / base-uri 'self' /
//     frame-ancestors 'none'                 lockdowns
//
// Callers can override the CSP wholesale via the `csp` option on
// `createDashboardServer`. Passing `csp: null` disables the CSP header
// entirely (the other headers still apply) — useful behind a reverse
// proxy that injects its own policy.

import type { ServerResponse } from 'node:http';

/**
 * The default Content-Security-Policy for the dashboard HTML shell.
 * Allows the SPA bundle + same-origin styles/fonts/images and the live
 * WebSocket connection, and locks down framing, plugins, and base URIs.
 */
export const DEFAULT_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

/** Static headers applied to every response regardless of content type. */
export const BASE_SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
});

export interface SecurityHeaderConfig {
  /**
   * The Content-Security-Policy value. `undefined` → use {@link DEFAULT_CSP}.
   * `null` → omit the CSP header entirely. A string overrides it wholesale.
   */
  csp?: string | null;
}

/**
 * Resolve the effective CSP string from a caller option. `undefined`
 * yields the default; `null` yields `null` (header suppressed); a string
 * passes through verbatim.
 */
export function resolveCsp(csp: string | null | undefined): string | null {
  if (csp === undefined) return DEFAULT_CSP;
  return csp;
}

/**
 * Apply the base security headers to a response. Safe to call before
 * `writeHead` — these go onto the outgoing header map. CSP is NOT applied
 * here; use {@link applyHtmlSecurityHeaders} for the HTML shell.
 */
export function applyBaseSecurityHeaders(res: ServerResponse): void {
  for (const [name, value] of Object.entries(BASE_SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
}

/**
 * Apply base security headers PLUS the Content-Security-Policy. Use for
 * the HTML shell. When `csp` resolves to `null` the CSP header is omitted
 * but the base headers still apply.
 */
export function applyHtmlSecurityHeaders(
  res: ServerResponse,
  csp: string | null,
): void {
  applyBaseSecurityHeaders(res);
  if (csp !== null) {
    res.setHeader('content-security-policy', csp);
  }
}
