// Task 117.18 — JWT persistence for the dashboard SPA.
//
// The access token lives in localStorage (per the 117.18 spec). TRADEOFF:
// localStorage is readable by any script on the page, so a successful XSS
// could exfiltrate it — unlike an httpOnly cookie. We accept this because
// (a) the dashboard is a self-hostable operator tool, usually on a trusted /
// LAN origin; (b) tokens self-expire (12h default); (c) it keeps the server
// stateless and avoids CSRF/CORS cookie complexity. To harden for a hostile
// multi-tenant origin, swap this one module for an httpOnly-cookie flow —
// nothing else in the app reads the token directly.

const STORAGE_KEY = 'erne-monitor-auth-token';

type Listener = () => void;
const listeners = new Set<Listener>();

// `undefined` = not yet read from storage; `null` = read, absent.
let memo: string | null | undefined;

function read(): string | null {
  if (memo !== undefined) return memo;
  try {
    memo = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    memo = null; // storage disabled (private mode / SSR) → in-memory only
  }
  return memo;
}

/** The current Bearer token, or null when unauthenticated. */
export function getToken(): string | null {
  return read();
}

/** Persist a freshly-issued token + notify subscribers. */
export function setToken(token: string): void {
  memo = token;
  try {
    window.localStorage.setItem(STORAGE_KEY, token);
  } catch {
    /* in-memory only */
  }
  notify();
}

/** Drop the token + notify subscribers. */
export function clearToken(): void {
  if (read() === null) return; // already clear — avoid a redundant notify
  memo = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  notify();
}

/** Called by the API client on any 401 — clears a stale/expired token. */
export function handleUnauthorized(): void {
  clearToken();
}

/** Subscribe to token changes (login/logout/expiry). Returns an unsubscribe. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Test-only: reset the in-memory cache so each test starts clean. */
export function __resetForTests(): void {
  memo = undefined;
  listeners.clear();
}
