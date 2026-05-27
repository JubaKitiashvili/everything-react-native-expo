/**
 * Task 117.79 — mDNS/Bonjour LAN auto-discovery (SDK side).
 *
 * On a development LAN the dashboard advertises itself as a `_erne-monitor._tcp`
 * service; the SDK browses for it and resolves a base URL, so a device finds
 * the dashboard without anyone typing an IP. The actual multicast belongs to a
 * native zeroconf module (e.g. react-native-zeroconf) which the consumer wires
 * in as an `MdnsBrowser` — this class is the PURE resolution + bookkeeping
 * layer, fully unit-testable with a mock browser (no real network).
 */

/** The service type ERNE dashboards advertise under. */
export const ERNE_SERVICE_TYPE = '_erne-monitor._tcp';

/** A service surfaced by the native browser. */
export interface DiscoveredService {
  /** Instance name (e.g. "ERNE Dashboard"). */
  name: string;
  /** Hostname or IP. mDNS hostnames often carry a trailing dot ("host.local."). */
  host: string;
  port: number;
  /** TXT record key/values (e.g. `{ path: '/', version: '0.1.0', secure: 'false' }`). */
  txt?: Record<string, string>;
}

export interface MdnsBrowserHandlers {
  onFound: (service: DiscoveredService) => void;
  onLost?: (name: string) => void;
}

/** The injectable native browser. A real impl wraps react-native-zeroconf. */
export interface MdnsBrowser {
  start(serviceType: string, handlers: MdnsBrowserHandlers): void;
  stop(): void;
}

export interface DashboardDiscoveryOptions {
  browser: MdnsBrowser;
  /**
   * Force the scheme regardless of the service's TXT `secure` hint. When
   * omitted, a TXT `secure: 'true'` selects https, else http.
   */
  secure?: boolean;
  /** Notified whenever the set of known dashboard URLs changes. */
  onChange?: (urls: string[]) => void;
}

/** A discovered dashboard: its resolved base URL + the raw service. */
export interface DiscoveredDashboard {
  url: string;
  service: DiscoveredService;
}

export class DashboardDiscovery {
  private readonly browser: MdnsBrowser;
  private readonly secure: boolean | undefined;
  private readonly onChange: ((urls: string[]) => void) | undefined;
  private readonly byName = new Map<string, DiscoveredDashboard>();
  private running = false;

  constructor(options: DashboardDiscoveryOptions) {
    this.browser = options.browser;
    this.secure = options.secure;
    this.onChange = options.onChange;
  }

  /** Begin browsing. Idempotent. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.browser.start(ERNE_SERVICE_TYPE, {
      onFound: (service) => this.handleFound(service),
      onLost: (name) => this.handleLost(name),
    });
  }

  /** Stop browsing + clear known dashboards. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.browser.stop();
    if (this.byName.size > 0) {
      this.byName.clear();
      this.emit();
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Currently-known dashboard base URLs (stable order: discovery order). */
  getDashboardUrls(): string[] {
    return [...this.byName.values()].map((d) => d.url);
  }

  /** Full discovered records. */
  getDashboards(): DiscoveredDashboard[] {
    return [...this.byName.values()];
  }

  private handleFound(service: DiscoveredService): void {
    if (!isResolvable(service)) return;
    const url = this.buildUrl(service);
    const existing = this.byName.get(service.name);
    if (existing && existing.url === url) return; // no change
    this.byName.set(service.name, { url, service });
    this.emit();
  }

  private handleLost(name: string): void {
    if (this.byName.delete(name)) this.emit();
  }

  /** Resolve a service to an `http(s)://host:port[path]` base URL. */
  buildUrl(service: DiscoveredService): string {
    const host = normalizeHost(service.host);
    const txt = service.txt ?? {};
    const secure = this.secure ?? txt.secure === 'true';
    const scheme = secure ? 'https' : 'http';
    const path = typeof txt.path === 'string' && txt.path.startsWith('/') ? txt.path : '';
    const trimmedPath = path === '/' ? '' : path.replace(/\/$/, '');
    return `${scheme}://${host}:${service.port}${trimmedPath}`;
  }

  private emit(): void {
    this.onChange?.(this.getDashboardUrls());
  }
}

/** A service is resolvable iff it has a non-empty host + a valid port. */
function isResolvable(service: DiscoveredService): boolean {
  return (
    typeof service.name === 'string' &&
    service.name.length > 0 &&
    typeof service.host === 'string' &&
    service.host.trim().length > 0 &&
    Number.isInteger(service.port) &&
    service.port > 0 &&
    service.port <= 65535
  );
}

/** Strip the trailing dot mDNS hostnames carry ("erne.local." → "erne.local"). */
function normalizeHost(host: string): string {
  return host.trim().replace(/\.$/, '');
}
