import {
  FrustrationCollector,
  type FrustrationEventData,
} from './FrustrationCollector';
import { SignalBus } from '../core/SignalBus';
import type { MonitorEvent } from '../types';

function touchEvent(path: string, t: number): MonitorEvent {
  return {
    type: 'custom',
    timestamp: t,
    wallTime: t,
    sessionId: '',
    data: {
      name: 'touch',
      attributes: { componentName: 'X', componentPath: path, x: 0, y: 0 },
    },
  };
}

function crashEvent(t: number): MonitorEvent {
  return {
    type: 'crash',
    timestamp: t,
    wallTime: t,
    sessionId: '',
    data: { kind: 'exception', message: 'boom', stack: null, componentStack: null, isFatal: false },
  };
}

function frustrationFrom(received: MonitorEvent[]): FrustrationEventData[] {
  return received
    .filter((e) => (e.data as { name?: string }).name === 'frustration')
    .map((e) => (e.data as { attributes: FrustrationEventData }).attributes);
}

describe('FrustrationCollector', () => {
  it('emits rage-tap after N quick taps on the same target', () => {
    const bus = new SignalBus();
    let t = 0;
    const c = new FrustrationCollector({
      signalBus: bus,
      rageTapCount: 3,
      rageWindowMs: 2000,
      now: () => t,
      wallNow: () => t,
    });
    c.start();
    const received: MonitorEvent[] = [];
    bus.on('custom', (e) => received.push(e));
    t = 0;
    bus.emit(touchEvent('App.Btn', t));
    t = 500;
    bus.emit(touchEvent('App.Btn', t));
    t = 1000;
    bus.emit(touchEvent('App.Btn', t));
    const results = frustrationFrom(received);
    expect(results).toHaveLength(1);
    expect(results[0]?.signals).toContain('rage-tap');
    expect(results[0]?.level).toBe('low');
  });

  it('does not fire rage-tap across different targets', () => {
    const bus = new SignalBus();
    let t = 0;
    const c = new FrustrationCollector({
      signalBus: bus,
      rageTapCount: 3,
      now: () => t,
    });
    c.start();
    const received: MonitorEvent[] = [];
    bus.on('custom', (e) => received.push(e));
    bus.emit(touchEvent('App.A', 0));
    bus.emit(touchEvent('App.B', 100));
    bus.emit(touchEvent('App.C', 200));
    expect(frustrationFrom(received)).toHaveLength(0);
  });

  it('does not fire rage-tap outside the rageWindow', () => {
    const bus = new SignalBus();
    let t = 0;
    const c = new FrustrationCollector({
      signalBus: bus,
      rageTapCount: 3,
      rageWindowMs: 500,
      correlationWindowMs: 10_000,
      now: () => t,
    });
    c.start();
    const received: MonitorEvent[] = [];
    bus.on('custom', (e) => received.push(e));
    t = 0;
    bus.emit(touchEvent('App.Btn', t));
    t = 300;
    bus.emit(touchEvent('App.Btn', t));
    t = 900; // first tap is outside 500ms window from t=900
    bus.emit(touchEvent('App.Btn', t));
    expect(frustrationFrom(received)).toHaveLength(0);
  });

  it('fires dead-tap when isDeadTap returns true', () => {
    const bus = new SignalBus();
    const c = new FrustrationCollector({
      signalBus: bus,
      isDeadTap: (p) => p === 'App.Decor',
      now: () => 0,
    });
    c.start();
    const received: MonitorEvent[] = [];
    bus.on('custom', (e) => received.push(e));
    bus.emit(touchEvent('App.Decor', 0));
    const results = frustrationFrom(received);
    expect(results).toHaveLength(1);
    expect(results[0]?.signals).toContain('dead-tap');
  });

  it('fires error-tap when a crash follows a tap within errorWindow', () => {
    const bus = new SignalBus();
    let t = 0;
    const c = new FrustrationCollector({
      signalBus: bus,
      errorWindowMs: 1000,
      now: () => t,
    });
    c.start();
    const received: MonitorEvent[] = [];
    bus.on('custom', (e) => received.push(e));
    t = 0;
    bus.emit(touchEvent('App.Buy', t));
    t = 500;
    bus.emit(crashEvent(t));
    const results = frustrationFrom(received);
    expect(results[0]?.signals).toContain('error-tap');
    expect(results[0]?.componentPath).toBe('App.Buy');
  });

  it('does not fire error-tap when crash is outside the window', () => {
    const bus = new SignalBus();
    let t = 0;
    const c = new FrustrationCollector({
      signalBus: bus,
      errorWindowMs: 1000,
      correlationWindowMs: 10_000,
      now: () => t,
    });
    c.start();
    const received: MonitorEvent[] = [];
    bus.on('custom', (e) => received.push(e));
    t = 0;
    bus.emit(touchEvent('App.Buy', t));
    t = 3000;
    bus.emit(crashEvent(t));
    expect(frustrationFrom(received)).toHaveLength(0);
  });

  it('stop() unsubscribes and drops history', () => {
    const bus = new SignalBus();
    const c = new FrustrationCollector({
      signalBus: bus,
      rageTapCount: 2,
      now: () => 0,
    });
    c.start();
    const received: MonitorEvent[] = [];
    bus.on('custom', (e) => received.push(e));
    bus.emit(touchEvent('A', 0));
    c.stop();
    bus.emit(touchEvent('A', 0));
    expect(frustrationFrom(received)).toHaveLength(0);
  });
});
