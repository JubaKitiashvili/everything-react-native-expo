import {
  backoffDelay,
  formatLiveEvent,
  LiveStreamController,
  parseLiveArgs,
  parseLiveFrame,
  renderLiveHelp,
  runLiveCommand,
  subscribeUrl,
  type LiveFrame,
  type LiveSocket,
} from './live';

// ---------------------------------------------------------------------------
// Fake socket — drives the controller synchronously, no real network.

class FakeSocket implements LiveSocket {
  onopen: ((this: unknown, ev: unknown) => void) | null = null;
  onmessage: ((this: unknown, ev: { data: unknown }) => void) | null = null;
  onerror: ((this: unknown, ev: unknown) => void) | null = null;
  onclose: ((this: unknown, ev: unknown) => void) | null = null;
  closed = false;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  open(): void {
    this.onopen?.call(this, {});
  }
  emit(data: string): void {
    this.onmessage?.call(this, { data });
  }
  drop(): void {
    this.onclose?.call(this, {});
  }
  close(): void {
    this.closed = true;
  }
}

describe('formatLiveEvent', () => {
  test('formats an event with severity tag, type, screen, and payload summary', () => {
    const frame: LiveFrame = {
      kind: 'event',
      event: {
        type: 'network',
        severity: 'warning',
        timestamp: Date.UTC(2026, 0, 1, 12, 30, 45),
        screen: 'Home',
        platform: 'ios',
        payload: { url: 'https://api.dev/users' },
      },
    };
    const line = formatLiveEvent(frame);
    expect(line).toContain('WARN');
    expect(line).toContain('network');
    expect(line).toContain('@Home');
    expect(line).toContain('(ios)');
    expect(line).toContain('https://api.dev/users');
    expect(line).toContain('12:30:45');
  });

  test('defaults unknown severity to info', () => {
    const line = formatLiveEvent({ kind: 'event', event: { type: 'custom', severity: 'weird' } });
    expect(line).toContain('INFO');
  });

  test('renders hello, error, and crash-group frames distinctly', () => {
    expect(formatLiveEvent({ kind: 'hello', serverTime: 0 })).toContain('[connected]');
    expect(formatLiveEvent({ kind: 'error', message: 'boom' })).toContain('[server-error] boom');
    expect(
      formatLiveEvent({
        kind: 'crash-group-update',
        group: { fingerprint: 'abcdef123456', message: 'TypeError: x' },
      }),
    ).toContain('[crash-group abcdef12]');
  });

  test('applies ANSI color only when enabled', () => {
    const plain = formatLiveEvent({ kind: 'error', message: 'x' }, { color: false });
    const colored = formatLiveEvent({ kind: 'error', message: 'x' }, { color: true });
    // ESC byte present only in the colored variant.
    expect(plain).not.toContain('[');
    expect(colored).toContain('[');
  });

  test('handles missing timestamp gracefully', () => {
    const line = formatLiveEvent({ kind: 'event', event: { type: 'render' } });
    expect(line).toContain('--:--:--');
  });
});

describe('parseLiveFrame', () => {
  test('parses each valid frame kind', () => {
    expect(parseLiveFrame('{"kind":"hello","serverTime":5}')).toEqual({
      kind: 'hello',
      serverTime: 5,
    });
    expect(parseLiveFrame('{"kind":"event","event":{"type":"network"}}')).toEqual({
      kind: 'event',
      event: { type: 'network' },
    });
    expect(parseLiveFrame('{"kind":"error","message":"bad"}')).toEqual({
      kind: 'error',
      message: 'bad',
    });
  });

  test('rejects malformed json and unknown / incomplete frames', () => {
    expect(parseLiveFrame('not json')).toBeNull();
    expect(parseLiveFrame('{"kind":"event"}')).toBeNull();
    expect(parseLiveFrame('{"kind":"event","event":{}}')).toBeNull();
    expect(parseLiveFrame('{"kind":"mystery"}')).toBeNull();
    expect(parseLiveFrame('42')).toBeNull();
  });
});

describe('subscribeUrl', () => {
  test('converts http(s) bases to ws(s) and appends the subscribe path', () => {
    expect(subscribeUrl('http://127.0.0.1:3333')).toBe('ws://127.0.0.1:3333/ws/subscribe');
    expect(subscribeUrl('https://erne.dev')).toBe('wss://erne.dev/ws/subscribe');
    expect(subscribeUrl('http://localhost:3333/')).toBe('ws://localhost:3333/ws/subscribe');
  });

  test('passes through ws(s) bases and appends an api key when given', () => {
    expect(subscribeUrl('ws://h:1', 'secret key')).toBe('ws://h:1/ws/subscribe?apiKey=secret%20key');
    expect(subscribeUrl('host:9')).toBe('ws://host:9/ws/subscribe');
  });
});

describe('backoffDelay', () => {
  test('grows exponentially and caps at 10s', () => {
    expect(backoffDelay(1)).toBe(500);
    expect(backoffDelay(2)).toBe(1000);
    expect(backoffDelay(3)).toBe(2000);
    expect(backoffDelay(10)).toBe(10_000);
  });
});

describe('LiveStreamController lifecycle', () => {
  function setup(maxReconnects = 3) {
    const lines: string[] = [];
    const sockets: FakeSocket[] = [];
    const scheduled: Array<() => void> = [];
    const controller = new LiveStreamController({
      socketFactory: (url) => {
        const s = new FakeSocket(url);
        sockets.push(s);
        return s;
      },
      onLine: (l) => lines.push(l),
      maxReconnects,
      schedule: (fn) => {
        scheduled.push(fn);
      },
    });
    return { lines, sockets, scheduled, controller };
  }

  test('idle → connecting → streaming, then renders incoming events', () => {
    const { lines, sockets, controller } = setup();
    expect(controller.state).toBe('idle');

    controller.connect('ws://x/ws/subscribe');
    expect(controller.state).toBe('connecting');
    expect(sockets[0]?.url).toBe('ws://x/ws/subscribe');

    sockets[0]!.open();
    expect(controller.state).toBe('streaming');

    sockets[0]!.emit('{"kind":"event","event":{"type":"navigation","severity":"info"}}');
    expect(lines.some((l) => l.includes('navigation'))).toBe(true);
  });

  test('drops trigger a scheduled reconnect with backoff', () => {
    const { sockets, scheduled, controller, lines } = setup();
    controller.connect('ws://x/ws/subscribe');
    sockets[0]!.open();

    sockets[0]!.drop();
    expect(controller.state).toBe('reconnecting');
    expect(controller.reconnectAttempts).toBe(1);
    expect(lines.some((l) => l.includes('reconnecting (attempt 1/3)'))).toBe(true);

    // Fire the scheduled reconnect → a new socket is created.
    expect(scheduled).toHaveLength(1);
    scheduled[0]!();
    expect(sockets).toHaveLength(2);

    // New socket opens → streaming again, reconnect counter resets.
    sockets[1]!.open();
    expect(controller.state).toBe('streaming');
    expect(controller.reconnectAttempts).toBe(0);
  });

  test('gives up after exhausting reconnect attempts', () => {
    const { sockets, scheduled, controller, lines } = setup(2);
    controller.connect('ws://x/ws/subscribe');
    sockets[0]!.open();

    // Drop #1 → schedule reconnect (attempt 1).
    sockets[0]!.drop();
    scheduled[0]!();
    // Reconnect socket drops before opening → attempt 2.
    sockets[1]!.drop();
    scheduled[1]!();
    // Reconnect socket drops again → exhausted (max 2).
    sockets[2]!.drop();

    expect(controller.state).toBe('closed');
    expect(lines.some((l) => l.includes('gave up after 2 reconnect attempts'))).toBe(true);
  });

  test('stop() closes the socket and prevents further reconnects', () => {
    const { sockets, scheduled, controller } = setup();
    controller.connect('ws://x/ws/subscribe');
    sockets[0]!.open();

    controller.stop();
    expect(controller.state).toBe('closed');
    expect(sockets[0]!.closed).toBe(true);

    // A late close event after stop must not schedule a reconnect.
    sockets[0]!.drop();
    expect(scheduled).toHaveLength(0);
  });

  test('ignores malformed frames without crashing', () => {
    const { sockets, controller, lines } = setup();
    controller.connect('ws://x/ws/subscribe');
    sockets[0]!.open();
    const before = lines.length;
    sockets[0]!.emit('garbage');
    expect(lines.length).toBe(before);
  });
});

describe('parseLiveArgs', () => {
  test('defaults to the local dashboard, color on, no key', () => {
    expect(parseLiveArgs([])).toEqual({
      url: 'http://127.0.0.1:3333',
      apiKey: null,
      color: true,
      help: false,
    });
  });

  test('accepts --url, --api-key, --no-color in both forms', () => {
    expect(parseLiveArgs(['--url', 'http://h:9', '--api-key', 'k', '--no-color'])).toEqual({
      url: 'http://h:9',
      apiKey: 'k',
      color: false,
      help: false,
    });
    expect(parseLiveArgs(['--url=http://h:9', '--api-key=k'])).toEqual({
      url: 'http://h:9',
      apiKey: 'k',
      color: true,
      help: false,
    });
  });

  test('rejects unknown flags and missing values', () => {
    expect(() => parseLiveArgs(['--bogus'])).toThrow(/Unknown argument/);
    expect(() => parseLiveArgs(['--url'])).toThrow(/--url expects/);
    expect(() => parseLiveArgs(['--api-key'])).toThrow(/--api-key expects/);
  });

  test('-h sets help', () => {
    expect(parseLiveArgs(['-h']).help).toBe(true);
  });
});

describe('runLiveCommand', () => {
  function makeLogger() {
    const info: string[] = [];
    const error: string[] = [];
    return { info, error, logger: { info: (m: string) => info.push(m), error: (m: string) => error.push(m) } };
  }

  test('--help prints usage and exits 0 without connecting', async () => {
    const { info, logger } = makeLogger();
    const socketFactory = jest.fn();
    const code = await runLiveCommand(['--help'], { logger, socketFactory });
    expect(code).toBe(0);
    expect(socketFactory).not.toHaveBeenCalled();
    expect(info.join('\n')).toContain('Usage: npx @erne/monitor monitor live');
  });

  test('connects, streams, and tears down on exit', async () => {
    const { info, logger } = makeLogger();
    let made: FakeSocket | null = null;
    const socketFactory = (url: string) => {
      made = new FakeSocket(url);
      // Emit an event before exit resolves.
      queueMicrotask(() => {
        made!.open();
        made!.emit('{"kind":"event","event":{"type":"crash","severity":"critical"}}');
      });
      return made;
    };
    const waitForExit = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

    const code = await runLiveCommand(['--url', 'http://h:1', '--no-color'], {
      logger,
      socketFactory,
      waitForExit,
    });

    expect(code).toBe(0);
    expect(info.some((l) => l.includes('connecting to ws://h:1/ws/subscribe'))).toBe(true);
    expect(info.some((l) => l.includes('crash'))).toBe(true);
    expect(made).not.toBeNull();
    expect((made as unknown as FakeSocket).closed).toBe(true);
  });

  test('exits 1 on bad args', async () => {
    const { error, logger } = makeLogger();
    const code = await runLiveCommand(['--nope'], { logger });
    expect(code).toBe(1);
    expect(error.some((l) => l.includes('Unknown argument'))).toBe(true);
  });
});

describe('renderLiveHelp', () => {
  test('documents every flag', () => {
    const help = renderLiveHelp();
    for (const flag of ['--url', '--api-key', '--no-color', '--help']) {
      expect(help).toContain(flag);
    }
  });
});
