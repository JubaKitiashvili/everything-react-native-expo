import {
  SuspenseCollector,
  type SuspenseEventData,
} from './SuspenseCollector';
import { SignalBus } from '../core/SignalBus';
import type { MonitorEvent } from '../types';

function setup() {
  const bus = new SignalBus();
  let t = 0;
  const c = new SuspenseCollector({
    signalBus: bus,
    now: () => t,
    wallNow: () => t,
  });
  c.start();
  const received: MonitorEvent[] = [];
  bus.on('custom', (e) => received.push(e));
  return {
    bus,
    c,
    received,
    setTime: (v: number) => {
      t = v;
    },
  };
}

function extract(events: MonitorEvent[]): SuspenseEventData[] {
  return events
    .filter((e) => (e.data as { name?: string }).name === 'suspense')
    .map((e) => (e.data as { attributes: SuspenseEventData }).attributes);
}

describe('SuspenseCollector', () => {
  it('measures fallback duration between start and end', () => {
    const w = setup();
    w.setTime(100);
    w.c.fallbackStart('ProfileScreen');
    w.setTime(450);
    w.c.fallbackEnd('ProfileScreen');
    const [ev] = extract(w.received);
    expect(ev?.boundaryName).toBe('ProfileScreen');
    expect(ev?.fallbackDurationMs).toBe(350);
    expect(ev?.outcome).toBe('resolved');
  });

  it('tracks nested depth', () => {
    const w = setup();
    w.c.fallbackStart('Outer');
    w.c.fallbackStart('Inner');
    expect(w.c.isPending('Inner')).toBe(true);
    w.c.fallbackEnd('Inner');
    w.c.fallbackEnd('Outer');
    const events = extract(w.received);
    expect(events).toHaveLength(2);
    const inner = events.find((e) => e.boundaryName === 'Inner');
    const outer = events.find((e) => e.boundaryName === 'Outer');
    expect(inner?.depth).toBe(2);
    expect(outer?.depth).toBe(1);
  });

  it('captures error outcome', () => {
    const w = setup();
    w.c.fallbackStart('Broken');
    w.c.fallbackEnd('Broken', 'error', 'load failed');
    const [ev] = extract(w.received);
    expect(ev?.outcome).toBe('error');
    expect(ev?.errorMessage).toBe('load failed');
  });

  it('ignores fallbackEnd for unknown ids', () => {
    const w = setup();
    w.c.fallbackEnd('never-started');
    expect(extract(w.received)).toHaveLength(0);
  });

  it('stop() clears active state', () => {
    const w = setup();
    w.c.fallbackStart('X');
    w.c.stop();
    expect(w.c.isPending('X')).toBe(false);
  });
});
