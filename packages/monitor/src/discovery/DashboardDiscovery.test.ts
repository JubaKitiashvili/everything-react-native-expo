import {
  DashboardDiscovery,
  ERNE_SERVICE_TYPE,
  type DiscoveredService,
  type MdnsBrowser,
  type MdnsBrowserHandlers,
} from './DashboardDiscovery';

/** A controllable mock browser that lets tests fire found/lost events. */
function makeBrowser() {
  let handlers: MdnsBrowserHandlers | null = null;
  let startedType: string | null = null;
  let stopped = false;
  const browser: MdnsBrowser = {
    start(type, h) {
      startedType = type;
      handlers = h;
    },
    stop() {
      stopped = true;
    },
  };
  return {
    browser,
    get startedType() {
      return startedType;
    },
    get stopped() {
      return stopped;
    },
    found: (s: DiscoveredService) => handlers?.onFound(s),
    lost: (name: string) => handlers?.onLost?.(name),
  };
}

const svc = (over: Partial<DiscoveredService> = {}): DiscoveredService => ({
  name: 'ERNE Dashboard',
  host: 'erne.local.',
  port: 4174,
  ...over,
});

describe('DashboardDiscovery', () => {
  test('browses the ERNE service type on start', () => {
    const m = makeBrowser();
    const d = new DashboardDiscovery({ browser: m.browser });
    d.start();
    expect(m.startedType).toBe(ERNE_SERVICE_TYPE);
    expect(d.isRunning()).toBe(true);
  });

  test('resolves a found service to a URL (trailing dot stripped, default http)', () => {
    const m = makeBrowser();
    const changes: string[][] = [];
    const d = new DashboardDiscovery({ browser: m.browser, onChange: (u) => changes.push(u) });
    d.start();
    m.found(svc());
    expect(d.getDashboardUrls()).toEqual(['http://erne.local:4174']);
    expect(changes[changes.length - 1]).toEqual(['http://erne.local:4174']);
  });

  test('honours TXT secure + path hints', () => {
    const m = makeBrowser();
    const d = new DashboardDiscovery({ browser: m.browser });
    d.start();
    m.found(svc({ txt: { secure: 'true', path: '/dash' } }));
    expect(d.getDashboardUrls()).toEqual(['https://erne.local:4174/dash']);
  });

  test('explicit secure option overrides the TXT hint', () => {
    const m = makeBrowser();
    const d = new DashboardDiscovery({ browser: m.browser, secure: true });
    d.start();
    m.found(svc({ txt: { secure: 'false' } }));
    expect(d.getDashboardUrls()[0]?.startsWith('https://')).toBe(true);
  });

  test('a root path "/" is omitted from the URL', () => {
    const m = makeBrowser();
    const d = new DashboardDiscovery({ browser: m.browser });
    d.start();
    m.found(svc({ txt: { path: '/' } }));
    expect(d.getDashboardUrls()).toEqual(['http://erne.local:4174']);
  });

  test('ignores unresolvable services (no host / bad port)', () => {
    const m = makeBrowser();
    const d = new DashboardDiscovery({ browser: m.browser });
    d.start();
    m.found(svc({ host: '   ' }));
    m.found(svc({ name: 'Bad', port: 0 }));
    m.found(svc({ name: 'Bad2', port: 70000 }));
    expect(d.getDashboardUrls()).toEqual([]);
  });

  test('re-finding the same service+url does not emit a duplicate change', () => {
    const m = makeBrowser();
    const changes: string[][] = [];
    const d = new DashboardDiscovery({ browser: m.browser, onChange: (u) => changes.push(u) });
    d.start();
    m.found(svc());
    m.found(svc()); // identical → no change
    expect(changes).toHaveLength(1);
  });

  test('onLost removes the dashboard + emits', () => {
    const m = makeBrowser();
    const d = new DashboardDiscovery({ browser: m.browser });
    d.start();
    m.found(svc());
    expect(d.getDashboardUrls()).toHaveLength(1);
    m.lost('ERNE Dashboard');
    expect(d.getDashboardUrls()).toEqual([]);
  });

  test('tracks multiple distinct dashboards in discovery order', () => {
    const m = makeBrowser();
    const d = new DashboardDiscovery({ browser: m.browser });
    d.start();
    m.found(svc({ name: 'A', host: 'a.local', port: 4174 }));
    m.found(svc({ name: 'B', host: 'b.local', port: 5000 }));
    expect(d.getDashboardUrls()).toEqual(['http://a.local:4174', 'http://b.local:5000']);
  });

  test('stop() stops the browser + clears known dashboards', () => {
    const m = makeBrowser();
    const d = new DashboardDiscovery({ browser: m.browser });
    d.start();
    m.found(svc());
    d.stop();
    expect(m.stopped).toBe(true);
    expect(d.isRunning()).toBe(false);
    expect(d.getDashboardUrls()).toEqual([]);
  });

  test('start is idempotent', () => {
    const m = makeBrowser();
    let starts = 0;
    const browser: MdnsBrowser = {
      start: () => {
        starts += 1;
      },
      stop: () => undefined,
    };
    const d = new DashboardDiscovery({ browser });
    d.start();
    d.start();
    expect(starts).toBe(1);
    void m;
  });
});
