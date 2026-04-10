import {
  BreadcrumbCollector,
  type Breadcrumb,
} from './BreadcrumbCollector';
import { SignalBus } from '../core/SignalBus';
import type { MonitorEvent, MonitorEventType } from '../types';

function evt(type: MonitorEventType, data: unknown, t = 0): MonitorEvent {
  return { type, timestamp: t, wallTime: 0, sessionId: 'test', data };
}

describe('BreadcrumbCollector', () => {
  it('records navigation, network, and custom events as breadcrumbs', () => {
    const bus = new SignalBus();
    const c = new BreadcrumbCollector({ signalBus: bus, capacity: 10 });
    c.start();
    bus.emit(
      evt(
        'navigation',
        {
          screen: '/home',
          previousScreen: null,
          source: 'manual',
          durationMs: 0,
        },
        1,
      ),
    );
    bus.emit(
      evt(
        'network',
        {
          url: 'https://x/y',
          method: 'GET',
          statusCode: 200,
          durationMs: 10,
          requestSize: 0,
          responseSize: 0,
          transport: 'fetch',
        },
        2,
      ),
    );
    bus.emit(evt('custom', { name: 'checkout', attributes: {} }, 3));
    const trail = c.getTrail();
    expect(trail.map((b) => b.category)).toEqual(['navigation', 'network', 'custom']);
  });

  it('does not record crash events as breadcrumbs', () => {
    const bus = new SignalBus();
    const c = new BreadcrumbCollector({ signalBus: bus });
    c.start();
    bus.emit(
      evt('crash', {
        kind: 'exception',
        message: 'boom',
        stack: null,
        componentStack: null,
        isFatal: false,
      }),
    );
    expect(c.getTrail()).toHaveLength(0);
  });

  it('ring buffer drops oldest entries at capacity', () => {
    const bus = new SignalBus();
    const c = new BreadcrumbCollector({ signalBus: bus, capacity: 3 });
    c.start();
    for (let i = 0; i < 5; i++) {
      bus.emit(
        evt('custom', { name: `e${i}`, attributes: {} }, i),
      );
    }
    const messages = c.getTrail().map((b) => b.message);
    expect(messages).toEqual(['e2', 'e3', 'e4']);
  });

  it('attaches trail to crash event data', () => {
    const bus = new SignalBus();
    const c = new BreadcrumbCollector({ signalBus: bus, capacity: 10 });
    c.start();
    bus.emit(
      evt(
        'navigation',
        {
          screen: '/a',
          previousScreen: null,
          source: 'manual',
          durationMs: 0,
        },
        1,
      ),
    );
    const crash = evt(
      'crash',
      {
        kind: 'exception',
        message: 'boom',
        stack: null,
        componentStack: null,
        isFatal: false,
      },
      2,
    );
    bus.emit(crash);
    const data = crash.data as { breadcrumbs?: Breadcrumb[] };
    expect(data.breadcrumbs).toBeDefined();
    expect(data.breadcrumbs).toHaveLength(1);
    expect(data.breadcrumbs![0]?.category).toBe('navigation');
  });

  it('leave() manually pushes a breadcrumb', () => {
    const bus = new SignalBus();
    const c = new BreadcrumbCollector({
      signalBus: bus,
      capacity: 10,
      now: () => 42,
    });
    c.start();
    c.leave({
      type: 'tap',
      category: 'ui.tap',
      message: 'Button: Submit',
    });
    const trail = c.getTrail();
    expect(trail[0]?.message).toBe('Button: Submit');
    expect(trail[0]?.timestamp).toBe(42);
  });

  it('stop + dispose clear state', () => {
    const bus = new SignalBus();
    const c = new BreadcrumbCollector({ signalBus: bus });
    c.start();
    bus.emit(evt('custom', { name: 'a', attributes: {} }));
    c.stop();
    bus.emit(evt('custom', { name: 'b', attributes: {} }));
    expect(c.getTrail().map((x) => x.message)).toEqual(['a']);
    c.dispose();
    expect(c.getTrail()).toHaveLength(0);
  });
});
