import {
  StartupCollector,
  type StartupEventData,
} from './StartupCollector';
import { SignalBus } from '../core/SignalBus';
import type { MonitorEvent } from '../types';

describe('StartupCollector', () => {
  it('emits a single startup event with milestone timings', () => {
    const bus = new SignalBus();
    let t = 0;
    const c = new StartupCollector({
      signalBus: bus,
      kind: 'cold',
      now: () => t,
      jsStartAt: 0,
    });
    c.start();
    const received: MonitorEvent[] = [];
    bus.on('custom', (e) => received.push(e));
    t = 500;
    c.markFirstRender();
    t = 800;
    c.markFirstNavigation();
    t = 1500;
    c.markInteractive();
    expect(received).toHaveLength(1);
    const data = (received[0]!.data as {
      attributes: StartupEventData;
    }).attributes;
    expect(data.kind).toBe('cold');
    expect(data.firstRenderMs).toBe(500);
    expect(data.firstNavigationMs).toBe(800);
    expect(data.interactiveMs).toBe(1500);
    expect(data.exceededBudget).toBe(false);
  });

  it('flags cold start over budget', () => {
    const bus = new SignalBus();
    let t = 0;
    const c = new StartupCollector({
      signalBus: bus,
      kind: 'cold',
      coldStartBudgetMs: 1000,
      now: () => t,
      jsStartAt: 0,
    });
    c.start();
    const received: MonitorEvent[] = [];
    bus.on('custom', (e) => received.push(e));
    t = 2500;
    c.markInteractive();
    const data = (received[0]!.data as {
      attributes: StartupEventData;
    }).attributes;
    expect(data.exceededBudget).toBe(true);
  });

  it('emits only once per instance', () => {
    const bus = new SignalBus();
    const c = new StartupCollector({ signalBus: bus, kind: 'warm', jsStartAt: 0, now: () => 10 });
    c.start();
    const received: MonitorEvent[] = [];
    bus.on('custom', (e) => received.push(e));
    c.markInteractive();
    c.markInteractive();
    expect(received).toHaveLength(1);
  });

  it('is a no-op when stopped', () => {
    const bus = new SignalBus();
    const c = new StartupCollector({ signalBus: bus, jsStartAt: 0, now: () => 10 });
    c.start();
    c.stop();
    const received: MonitorEvent[] = [];
    bus.on('custom', (e) => received.push(e));
    c.markInteractive();
    expect(received).toHaveLength(0);
  });
});
