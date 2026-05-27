// Task 117.79 — mDNS/Bonjour LAN auto-discovery (server side).
//
// The dashboard advertises itself as a `_erne-monitor._tcp` service so SDKs on
// the same LAN can find it without a hardcoded IP (see the SDK's
// DashboardDiscovery). The actual multicast belongs to a node mDNS library
// (`bonjour-service`), which is OPTIONAL: the advertiser takes an injected
// `MdnsPublisher`, and the default factory lazy-`require`s `bonjour-service`
// only if it's installed — absent, advertising is a logged no-op rather than a
// crash. This keeps the server dependency-light + the advertiser fully
// unit-testable with a mock publisher (no real multicast).

/** The service type ERNE dashboards advertise under (matches the SDK). */
export const ERNE_SERVICE_TYPE = 'erne-monitor';

/** A published service handle — stop() withdraws the advertisement. */
export interface PublishedService {
  stop(): void;
}

/** Descriptor handed to the publisher. */
export interface ServiceDescriptor {
  name: string;
  /** Bare service type (publisher adds `_<type>._tcp`). */
  type: string;
  port: number;
  txt?: Record<string, string>;
}

/** The injectable mDNS publisher. A real impl wraps `bonjour-service`. */
export interface MdnsPublisher {
  publish(descriptor: ServiceDescriptor): PublishedService;
}

export interface AdvertiserLogger {
  info?(message: string, fields?: Record<string, unknown>): void;
  warn?(message: string, fields?: Record<string, unknown>): void;
}

export interface DashboardAdvertiserOptions {
  /** Injected publisher. When omitted, the default lazy bonjour publisher is
   *  used (a no-op if `bonjour-service` isn't installed). */
  publisher?: MdnsPublisher | null;
  /** Advertised instance name. Default "ERNE Dashboard". */
  name?: string;
  /** TXT version string (e.g. the dashboard version). */
  version?: string;
  /** Whether the dashboard is served over https → advertised in TXT `secure`. */
  secure?: boolean;
  /** Path the SDK should hit (TXT `path`). Default "/". */
  path?: string;
  logger?: AdvertiserLogger;
}

/**
 * Advertises the dashboard on the LAN. `start(port)` publishes; `stop()`
 * withdraws. Safe + idempotent; never throws (advertising is best-effort
 * convenience, never a reason to fail the server).
 */
export class DashboardAdvertiser {
  private readonly publisher: MdnsPublisher | null;
  private readonly name: string;
  private readonly txt: Record<string, string>;
  private readonly logger: AdvertiserLogger | undefined;
  private handle: PublishedService | null = null;

  constructor(options: DashboardAdvertiserOptions = {}) {
    this.publisher = options.publisher === undefined ? createBonjourPublisher() : options.publisher;
    this.name = options.name && options.name.length > 0 ? options.name : 'ERNE Dashboard';
    this.logger = options.logger;
    this.txt = {
      path: options.path && options.path.startsWith('/') ? options.path : '/',
      secure: options.secure ? 'true' : 'false',
      ...(options.version ? { version: options.version } : {}),
    };
  }

  /** Whether a real publisher is available (advertising will actually happen). */
  get available(): boolean {
    return this.publisher !== null;
  }

  /** Publish the dashboard service for `port`. Idempotent; never throws. */
  start(port: number): void {
    if (this.handle) return;
    if (!this.publisher) {
      this.logger?.info?.('discovery.unavailable', {
        reason: 'bonjour-service not installed; LAN auto-discovery disabled',
      });
      return;
    }
    if (!Number.isInteger(port) || port <= 0) return;
    try {
      this.handle = this.publisher.publish({
        name: this.name,
        type: ERNE_SERVICE_TYPE,
        port,
        txt: this.txt,
      });
      this.logger?.info?.('discovery.advertising', { name: this.name, port });
    } catch (err) {
      this.handle = null;
      this.logger?.warn?.('discovery.publish_failed', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Withdraw the advertisement. Idempotent; never throws. */
  stop(): void {
    if (!this.handle) return;
    try {
      this.handle.stop();
    } catch {
      /* best-effort */
    }
    this.handle = null;
  }

  isAdvertising(): boolean {
    return this.handle !== null;
  }
}

/**
 * Default publisher backed by `bonjour-service`, loaded lazily so the package
 * carries no hard dependency. Returns null when the module isn't installed —
 * the advertiser then no-ops. Isolated here so tests inject a mock instead.
 */
export function createBonjourPublisher(): MdnsPublisher | null {
  let mod: unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('bonjour-service');
  } catch {
    return null;
  }
  const Bonjour = resolveBonjourCtor(mod);
  if (!Bonjour) return null;
  let instance: { publish: (opts: unknown) => { stop: (cb?: () => void) => void } } | null = null;
  return {
    publish(descriptor) {
      if (!instance) instance = new Bonjour();
      const service = instance.publish({
        name: descriptor.name,
        type: descriptor.type,
        port: descriptor.port,
        txt: descriptor.txt,
      });
      return { stop: () => service.stop() };
    },
  };
}

/** bonjour-service exports `{ Bonjour }` (ESM/CJS interop tolerant). */
function resolveBonjourCtor(mod: unknown): (new () => {
  publish: (opts: unknown) => { stop: (cb?: () => void) => void };
}) | null {
  if (typeof mod !== 'object' || mod === null) return null;
  const m = mod as Record<string, unknown>;
  const ctor = m.Bonjour ?? (m.default as Record<string, unknown> | undefined)?.Bonjour ?? m.default;
  return typeof ctor === 'function'
    ? (ctor as new () => { publish: (opts: unknown) => { stop: (cb?: () => void) => void } })
    : null;
}
