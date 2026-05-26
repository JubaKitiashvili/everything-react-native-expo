import type { Collector, MonitorConfig, MonitorEvent } from '../types';
import type { SignalBus } from '../core/SignalBus';
import type { EventStore } from '../storage/EventStore';
import type { SessionManager } from '../core/SessionManager';

export interface DeepLinkEventData {
  url: string;
  parsedHost: string | null;
  parsedPath: string | null;
  /**
   * Query parameter KEYS only. Values are intentionally redacted — a deep
   * link can carry tokens, emails, or other PII, so the SDK never records
   * them. App-level whitelisting/validation is the host's concern.
   */
  queryParamKeys: string[];
  /** True when the link launched the app from a cold start. */
  coldStart: boolean;
}

/**
 * Minimal slice of the React Native `Linking` API this collector relies on.
 * Modeled as an interface so tests can inject a fake without the RN runtime.
 *
 * Verify against current docs (react-native `Linking`): `getInitialURL()`
 * resolves to the URL that opened the app (or null), and the `'url'` event
 * fires with `{ url }` for links received while the app is running.
 */
export interface LinkingLike {
  getInitialURL(): Promise<string | null>;
  addEventListener(
    type: 'url',
    handler: (event: { url: string }) => void,
  ): { remove(): void };
}

export interface DeepLinkCollectorDeps {
  signalBus: SignalBus;
  eventStore: EventStore;
  sessionManager: SessionManager;
  /**
   * Optional `Linking` module. When absent the collector still works in
   * manual mode (host app calls `trackDeepLink(url)`), it just won't
   * auto-subscribe to incoming links.
   */
  linking?: LinkingLike | null;
  now?: () => number;
  wallNow?: () => number;
}

/**
 * Parses a deep-link URL into host / path / query-param keys without using
 * the WHATWG `URL` API (not reliably present in all RN engines) and without
 * ever retaining query VALUES.
 *
 * Handles both standard `scheme://host/path?query` links and custom-scheme
 * links like `myapp://profile/42?ref=abc` where the authority may be empty.
 */
function parseDeepLink(url: string): {
  parsedHost: string | null;
  parsedPath: string | null;
  queryParamKeys: string[];
} {
  let host: string | null = null;
  let path: string | null = null;
  const keys: string[] = [];

  // Split off the query/fragment portion first.
  const hashIndex = url.indexOf('#');
  const withoutFragment = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const queryIndex = withoutFragment.indexOf('?');
  const beforeQuery =
    queryIndex >= 0 ? withoutFragment.slice(0, queryIndex) : withoutFragment;
  const queryString = queryIndex >= 0 ? withoutFragment.slice(queryIndex + 1) : '';

  // Strip the scheme (everything up to and including `://` or the first `:`).
  let remainder = beforeQuery;
  const schemeSep = remainder.indexOf('://');
  if (schemeSep >= 0) {
    remainder = remainder.slice(schemeSep + 3);
    // After `://` the first segment up to the next `/` is the host/authority.
    const slashIndex = remainder.indexOf('/');
    if (slashIndex >= 0) {
      host = remainder.slice(0, slashIndex) || null;
      path = remainder.slice(slashIndex) || null;
    } else {
      host = remainder || null;
      path = null;
    }
  } else {
    const colonIndex = remainder.indexOf(':');
    if (colonIndex >= 0) {
      remainder = remainder.slice(colonIndex + 1);
    }
    // No authority component (e.g. `mailto:` or `myapp:profile/42`).
    path = remainder.length > 0 ? remainder : null;
  }

  if (queryString.length > 0) {
    for (const pair of queryString.split('&')) {
      if (pair.length === 0) continue;
      const eq = pair.indexOf('=');
      const rawKey = eq >= 0 ? pair.slice(0, eq) : pair;
      if (rawKey.length === 0) continue;
      let key = rawKey;
      try {
        key = decodeURIComponent(rawKey);
      } catch {
        // keep raw key when it isn't valid percent-encoding
      }
      keys.push(key);
    }
  }

  return { parsedHost: host, parsedPath: path, queryParamKeys: keys };
}

/**
 * DeepLinkCollector captures incoming deep links via the RN `Linking` API.
 * It emits a `deep_link` custom event carrying the host, path, and query
 * parameter KEYS (never values — privacy). It distinguishes cold-start links
 * (the URL that launched the app) from warm links received at runtime.
 */
export class DeepLinkCollector implements Collector {
  readonly name = 'deep_link';
  readonly priority = 25;

  private readonly deps: DeepLinkCollectorDeps;
  private readonly now: () => number;
  private readonly wallNow: () => number;
  private subscription: { remove(): void } | null = null;
  private running = false;
  private initialHandled = false;

  constructor(deps: DeepLinkCollectorDeps) {
    this.deps = deps;
    this.now =
      deps.now ??
      (() =>
        typeof performance !== 'undefined' &&
        typeof performance.now === 'function'
          ? performance.now()
          : Date.now());
    this.wallNow = deps.wallNow ?? Date.now;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  init(_config: MonitorConfig): void {}

  start(): void {
    if (this.running) return;
    this.running = true;

    const linking = this.deps.linking;
    if (!linking) return;

    // Cold-start link: the URL that launched the app.
    void linking
      .getInitialURL()
      .then((url) => {
        if (!this.running || this.initialHandled) return;
        this.initialHandled = true;
        if (url) this.record(url, true);
      })
      .catch(() => {
        // swallow — best effort
      });

    // Warm links received while the app is running.
    this.subscription = linking.addEventListener('url', ({ url }) => {
      if (!this.running) return;
      this.record(url, false);
    });
  }

  stop(): void {
    if (!this.running) return;
    this.subscription?.remove();
    this.subscription = null;
    this.running = false;
  }

  dispose(): void {
    this.stop();
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Manual deep-link tracking for host apps whose link routing the
   * collector doesn't auto-capture, or for links resolved outside the
   * `Linking` API.
   */
  trackDeepLink(url: string, coldStart = false): void {
    if (!this.running) return;
    this.record(url, coldStart);
  }

  private record(url: string, coldStart: boolean): void {
    const { parsedHost, parsedPath, queryParamKeys } = parseDeepLink(url);
    const data: DeepLinkEventData = {
      url,
      parsedHost,
      parsedPath,
      queryParamKeys,
      coldStart,
    };
    const event: MonitorEvent = {
      type: 'custom',
      timestamp: this.now(),
      wallTime: this.wallNow(),
      sessionId: this.deps.sessionManager.getCurrentSessionId(),
      data: {
        name: 'deep_link',
        attributes: data as unknown as Record<string, never>,
      },
    };
    this.deps.signalBus.emit(event);
    void this.deps.eventStore.insert(event, 'normal').catch(() => {
      // swallow — bus has it
    });
  }
}
