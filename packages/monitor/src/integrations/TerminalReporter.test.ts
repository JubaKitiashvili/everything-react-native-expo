import { TerminalReporter, type ConsoleLike } from './TerminalReporter';
import { SignalBus } from '../core/SignalBus';
import type { MonitorEvent, MonitorEventType } from '../types';

function fakeConsole(): ConsoleLike & {
  logs: string[];
  warns: string[];
  errors: string[];
} {
  const logs: string[] = [];
  const warns: string[] = [];
  const errors: string[] = [];
  return {
    log: (msg: unknown) => logs.push(String(msg)),
    warn: (msg: unknown) => warns.push(String(msg)),
    error: (msg: unknown) => errors.push(String(msg)),
    logs,
    warns,
    errors,
  };
}

function evt(type: MonitorEventType, data: unknown): MonitorEvent {
  return { type, timestamp: 0, wallTime: 0, sessionId: 'test', data };
}

describe('TerminalReporter', () => {
  it('is a no-op when isDev is false', () => {
    const bus = new SignalBus();
    const console_ = fakeConsole();
    const r = new TerminalReporter({ signalBus: bus, isDev: false, console: console_ });
    r.start();
    bus.emit(evt('crash', { kind: 'exception', message: 'b', stack: null, componentStack: null, isFatal: true }));
    expect(console_.errors).toHaveLength(0);
    expect(r.isRunning()).toBe(false);
  });

  it('renders crashes with error severity', () => {
    const bus = new SignalBus();
    const console_ = fakeConsole();
    const r = new TerminalReporter({ signalBus: bus, isDev: true, console: console_ });
    r.start();
    bus.emit(
      evt('crash', {
        kind: 'exception',
        message: 'boom',
        stack: null,
        componentStack: null,
        isFatal: true,
      }),
    );
    expect(console_.errors).toHaveLength(1);
    expect(console_.errors[0]).toContain('CRASH');
    expect(console_.errors[0]).toContain('boom');
  });

  it('renders unhandled rejections with the rejection label', () => {
    const bus = new SignalBus();
    const console_ = fakeConsole();
    const r = new TerminalReporter({ signalBus: bus, isDev: true, console: console_ });
    r.start();
    bus.emit(
      evt('crash', {
        kind: 'unhandled-rejection',
        message: 'bad promise',
        stack: null,
        componentStack: null,
        isFatal: false,
      }),
    );
    expect(console_.errors[0]).toContain('(rejection)');
  });

  it('warns only on network errors or 5xx responses', () => {
    const bus = new SignalBus();
    const console_ = fakeConsole();
    const r = new TerminalReporter({ signalBus: bus, isDev: true, console: console_ });
    r.start();
    bus.emit(
      evt('network', {
        url: 'https://api/x',
        method: 'GET',
        statusCode: 200,
        durationMs: 10,
        requestSize: 0,
        responseSize: 0,
        transport: 'fetch',
      }),
    );
    expect(console_.warns).toHaveLength(0);
    bus.emit(
      evt('network', {
        url: 'https://api/y',
        method: 'GET',
        statusCode: 503,
        durationMs: 10,
        requestSize: 0,
        responseSize: 0,
        transport: 'fetch',
      }),
    );
    expect(console_.warns).toHaveLength(1);
    expect(console_.warns[0]).toContain('503');
  });

  it('rate-limits repeated events of the same type', () => {
    const bus = new SignalBus();
    const console_ = fakeConsole();
    let t = 0;
    const r = new TerminalReporter({
      signalBus: bus,
      isDev: true,
      console: console_,
      rateLimitMs: 5000,
      now: () => t,
    });
    r.start();
    for (let i = 0; i < 3; i++) {
      bus.emit(
        evt('crash', {
          kind: 'exception',
          message: `boom ${i}`,
          stack: null,
          componentStack: null,
          isFatal: false,
        }),
      );
      t += 1000; // less than rate limit window
    }
    expect(console_.errors).toHaveLength(1);
    // Advance past the window
    t += 5001;
    bus.emit(
      evt('crash', {
        kind: 'exception',
        message: 'boom later',
        stack: null,
        componentStack: null,
        isFatal: false,
      }),
    );
    expect(console_.errors).toHaveLength(2);
  });

  it('different event types are rate-limited independently', () => {
    const bus = new SignalBus();
    const console_ = fakeConsole();
    const r = new TerminalReporter({
      signalBus: bus,
      isDev: true,
      console: console_,
      rateLimitMs: 5000,
      now: () => 0,
    });
    r.start();
    bus.emit(
      evt('crash', {
        kind: 'exception',
        message: 'a',
        stack: null,
        componentStack: null,
        isFatal: false,
      }),
    );
    bus.emit(
      evt('navigation', {
        screen: '/a',
        previousScreen: null,
        source: 'manual',
        durationMs: 0,
      }),
    );
    expect(console_.errors).toHaveLength(1);
    expect(console_.logs).toHaveLength(1);
  });

  it('stop() detaches from the bus', () => {
    const bus = new SignalBus();
    const console_ = fakeConsole();
    const r = new TerminalReporter({
      signalBus: bus,
      isDev: true,
      console: console_,
      rateLimitMs: 0,
    });
    r.start();
    r.stop();
    bus.emit(
      evt('crash', {
        kind: 'exception',
        message: 'ignored',
        stack: null,
        componentStack: null,
        isFatal: false,
      }),
    );
    expect(console_.errors).toHaveLength(0);
  });

  it('swallows console errors gracefully', () => {
    const bus = new SignalBus();
    const broken: ConsoleLike = {
      log: () => {
        throw new Error('no log');
      },
      warn: () => {
        throw new Error('no warn');
      },
      error: () => {
        throw new Error('no error');
      },
    };
    const r = new TerminalReporter({
      signalBus: bus,
      isDev: true,
      console: broken,
      rateLimitMs: 0,
    });
    r.start();
    expect(() =>
      bus.emit(
        evt('crash', {
          kind: 'exception',
          message: 'x',
          stack: null,
          componentStack: null,
          isFatal: true,
        }),
      ),
    ).not.toThrow();
  });
});
