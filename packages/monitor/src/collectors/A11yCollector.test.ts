import {
  A11yCollector,
  type A11yEventData,
  type A11yElementInfo,
} from './A11yCollector';
import { SignalBus } from '../core/SignalBus';
import type { MonitorEvent } from '../types';

function setup() {
  const bus = new SignalBus();
  const c = new A11yCollector({ signalBus: bus, now: () => 0 });
  c.start();
  const received: MonitorEvent[] = [];
  bus.on('custom', (e) => received.push(e));
  return { bus, c, received };
}

function audits(received: MonitorEvent[]): A11yEventData[] {
  return received
    .filter((e) => (e.data as { name?: string }).name === 'a11y')
    .map((e) => (e.data as { attributes: A11yEventData }).attributes);
}

describe('A11yCollector', () => {
  it('flags missing label on interactive element', () => {
    const w = setup();
    const el: A11yElementInfo = {
      componentPath: 'App.Btn',
      isInteractive: true,
      role: 'button',
      width: 100,
      height: 100,
    };
    w.c.audit([el]);
    const list = audits(w.received);
    expect(list.some((v) => v.violation === 'missing-label')).toBe(true);
  });

  it('flags small touch target', () => {
    const w = setup();
    w.c.audit([
      {
        componentPath: 'App.SmallBtn',
        isInteractive: true,
        role: 'button',
        label: 'ok',
        width: 30,
        height: 30,
      },
    ]);
    const list = audits(w.received);
    expect(list[0]?.violation).toBe('small-touch-target');
    expect(list[0]?.measured).toEqual({ width: 30, height: 30 });
  });

  it('flags missing role on interactive element', () => {
    const w = setup();
    w.c.audit([
      {
        componentPath: 'App.X',
        isInteractive: true,
        label: 'ok',
        width: 60,
        height: 60,
      },
    ]);
    const list = audits(w.received);
    expect(list.some((v) => v.violation === 'missing-role')).toBe(true);
  });

  it('flags images without label', () => {
    const w = setup();
    w.c.audit([
      {
        componentPath: 'App.Img',
        isInteractive: false,
        isImage: true,
        width: 200,
        height: 200,
      },
    ]);
    const list = audits(w.received);
    expect(list[0]?.violation).toBe('image-missing-alt');
  });

  it('skips decorative elements', () => {
    const w = setup();
    w.c.audit([
      {
        componentPath: 'App.Decor',
        isInteractive: false,
        isImage: true,
        isDecorative: true,
      },
    ]);
    expect(audits(w.received)).toHaveLength(0);
  });

  it('does not flag well-formed elements', () => {
    const w = setup();
    w.c.audit([
      {
        componentPath: 'App.Good',
        isInteractive: true,
        role: 'button',
        label: 'Buy',
        width: 88,
        height: 44,
      },
    ]);
    expect(audits(w.received)).toHaveLength(0);
  });
});
