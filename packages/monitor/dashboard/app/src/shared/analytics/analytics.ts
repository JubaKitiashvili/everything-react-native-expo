/**
 * Privacy-first, Plausible-compatible self-analytics for the @erne/monitor
 * dashboard. Lets ERNE measure its own product KPIs on its hosted deployment.
 *
 * Design constraints (all enforced here):
 *  - OFF BY DEFAULT: nothing is sent unless `VITE_ANALYTICS_DOMAIN` is set.
 *  - DNT-RESPECTING: a no-op when Do Not Track is enabled.
 *  - ZERO PII: only event/page names + a sanitized path are transmitted.
 *    Dynamic id segments are collapsed (e.g. `/crashes/<fp>` -> `/crashes/:id`)
 *    and query strings are stripped entirely.
 *  - NEVER THROWS: analytics must not crash the app, so network errors are
 *    swallowed.
 *
 * The pure `sanitizePath` and the `createAnalytics` factory are exported so the
 * logic can be unit-tested without touching globals. `initAnalytics`,
 * `trackPageview` and `trackEvent` are the env-wired singletons used by the app.
 */

/** Plausible's default ingest host. Override with `VITE_ANALYTICS_HOST`. */
const DEFAULT_HOST = 'https://plausible.io';

/** Route prefixes whose trailing segment is a dynamic id we must not leak. */
const ID_SEGMENT_PREFIXES = ['crashes', 'sessions', 'users'] as const;

/**
 * Collapse dynamic id segments and strip query/hash so no PII (fingerprints,
 * session ids, user ids) leaks into analytics. Plain routes pass through
 * unchanged.
 *
 * Examples:
 *   /crashes/abc123        -> /crashes/:id
 *   /sessions/42?tab=logs  -> /sessions/:id
 *   /users/u_99#frames     -> /users/:id
 *   /performance           -> /performance
 */
export function sanitizePath(path: string): string {
  if (!path) return '/';

  // Drop query string and hash fragment outright.
  const noQuery = path.split('?')[0]!.split('#')[0]!;

  const segments = noQuery.split('/');
  // segments[0] is '' for a leading slash; the first real segment is [1].
  const head = segments[1];
  if (
    head &&
    (ID_SEGMENT_PREFIXES as readonly string[]).includes(head) &&
    segments.length > 2 &&
    segments[2]
  ) {
    return `/${head}/:id`;
  }

  return noQuery;
}

/** JSON-serializable property values accepted by Plausible custom props. */
export type AnalyticsPropValue = string | number | boolean;
export type AnalyticsProps = Record<string, AnalyticsPropValue>;

/** Minimal `fetch` shape so tests can inject a stub without DOM globals. */
export type FetchImpl = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; keepalive?: boolean },
) => Promise<unknown>;

export interface AnalyticsConfig {
  /** Plausible site domain. When empty/undefined, the instance is disabled. */
  domain?: string;
  /** Ingest host. Defaults to `https://plausible.io`. */
  host?: string;
  /** Injectable fetch (defaults to the global `fetch`). */
  fetchImpl?: FetchImpl;
  /** When true, the instance is a no-op (Do Not Track honored). */
  dnt?: boolean;
}

export interface Analytics {
  /** Whether this instance will actually send anything. */
  readonly enabled: boolean;
  /** Record a page view for the given (raw) path; the path is sanitized. */
  trackPageview(path: string): void;
  /** Record a named custom event with optional sanitized-name-only props. */
  trackEvent(name: string, props?: AnalyticsProps): void;
}

/**
 * Build an analytics instance from an explicit config. Pure and global-free —
 * everything (domain, host, fetch, dnt) is injected, which is what the tests
 * exercise. Returns a disabled (no-op) instance when there's no domain or DNT
 * is set.
 */
export function createAnalytics(config: AnalyticsConfig): Analytics {
  const domain = config.domain?.trim();
  const enabled = Boolean(domain) && config.dnt !== true;
  const host = (config.host?.trim() || DEFAULT_HOST).replace(/\/+$/, '');
  const fetchImpl = config.fetchImpl;

  function send(name: string, rawPath: string, props?: AnalyticsProps): void {
    if (!enabled || !domain || !fetchImpl) return;

    const path = sanitizePath(rawPath);
    // Plausible expects an absolute URL; use a stable synthetic origin built
    // from the domain so we never transmit the user's real (PII-bearing) URL.
    const url = `https://${domain}${path}`;

    const body: Record<string, unknown> = {
      name,
      url,
      domain,
      referrer: null,
    };
    if (props && Object.keys(props).length > 0) {
      body.props = props;
    }

    try {
      // Analytics must never throw into the app. Swallow sync + async errors.
      void Promise.resolve(
        fetchImpl(`${host}/api/event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          keepalive: true,
        }),
      ).catch(() => undefined);
    } catch {
      /* ignore — analytics is best-effort */
    }
  }

  return {
    enabled,
    trackPageview(path: string): void {
      send('pageview', path);
    },
    trackEvent(name: string, props?: AnalyticsProps): void {
      // For custom events the page path is the current location at call time.
      const currentPath =
        typeof window !== 'undefined' && window.location
          ? window.location.pathname
          : '/';
      send(name, currentPath, props);
    },
  };
}

/** True when any of the platform Do Not Track signals are enabled. */
function detectDnt(): boolean {
  const g = globalThis as unknown as {
    doNotTrack?: unknown;
    navigator?: { doNotTrack?: unknown };
    window?: { doNotTrack?: unknown };
  };
  const signals = [
    typeof navigator !== 'undefined' ? navigator.doNotTrack : undefined,
    g.doNotTrack,
    typeof window !== 'undefined' ? (window as { doNotTrack?: unknown }).doNotTrack : undefined,
  ];
  return signals.some((s) => s === '1' || s === 1 || s === 'yes');
}

// ---------------------------------------------------------------------------
// Env-wired singleton. `initAnalytics` reads import.meta.env once and binds the
// real fetch / DNT detection; the exported track* fns delegate to it.
// ---------------------------------------------------------------------------

let instance: Analytics | null = null;

/**
 * Read the build-time env once and construct the live analytics instance.
 * Safe to call multiple times (idempotent — first call wins). Returns the
 * resulting instance (which may be a no-op).
 */
export function initAnalytics(): Analytics {
  if (instance) return instance;

  const env = import.meta.env as ImportMetaEnv;
  instance = createAnalytics({
    domain: env.VITE_ANALYTICS_DOMAIN,
    host: env.VITE_ANALYTICS_HOST,
    fetchImpl: typeof fetch !== 'undefined' ? (fetch.bind(globalThis) as FetchImpl) : undefined,
    dnt: detectDnt(),
  });
  return instance;
}

/** Record a page view via the singleton (no-op until/unless configured). */
export function trackPageview(path: string): void {
  (instance ?? initAnalytics()).trackPageview(path);
}

/** Record a custom event via the singleton (no-op until/unless configured). */
export function trackEvent(name: string, props?: AnalyticsProps): void {
  (instance ?? initAnalytics()).trackEvent(name, props);
}

/** Test-only: drop the cached singleton so a fresh env can be read. */
export function __resetAnalyticsForTests(): void {
  instance = null;
}
