import { ConsentGate, type ConsentState } from './ConsentGate';
import type { MonitorEvent, MonitorEventType } from '../types';

function evt(type: MonitorEventType): MonitorEvent {
  return { type, timestamp: 0, wallTime: 0, sessionId: 's', data: {} };
}

describe('ConsentGate', () => {
  const initial: ConsentState = {
    crashes: false,
    analytics: false,
    replay: false,
  };

  it('blocks and buffers events without consent', () => {
    const g = new ConsentGate({ initial });
    expect(g.process(evt('crash'))).toBe(false);
    expect(g.process(evt('network'))).toBe(false);
    expect(g.bufferedCount('crashes')).toBe(1);
    expect(g.bufferedCount('analytics')).toBe(1);
  });

  it('flushes buffered events on grant', async () => {
    const g = new ConsentGate({ initial });
    g.process(evt('crash'));
    g.process(evt('network'));
    const drained: MonitorEvent[] = [];
    await g.setConsent({ crashes: true }, async (events) => {
      drained.push(...events);
    });
    expect(drained.map((e) => e.type)).toEqual(['crash']);
    expect(g.bufferedCount('crashes')).toBe(0);
    expect(g.bufferedCount('analytics')).toBe(1);
  });

  it('purges buffers on revoke', async () => {
    const g = new ConsentGate({
      initial: { crashes: true, analytics: true, replay: false },
    });
    g.process(evt('network'));
    expect(g.process(evt('network'))).toBe(true);
    await g.setConsent({ analytics: false });
    g.process(evt('network'));
    expect(g.bufferedCount('analytics')).toBe(1);
    await g.setConsent({ analytics: true });
    // flushed
    expect(g.bufferedCount('analytics')).toBe(0);
  });

  it('allows events immediately once consented', async () => {
    const g = new ConsentGate({ initial });
    await g.setConsent({ crashes: true });
    expect(g.process(evt('crash'))).toBe(true);
  });

  it('persists state via the store', async () => {
    let saved: ConsentState | null = null;
    const g = new ConsentGate({
      initial,
      store: {
        load: () => saved,
        save: (s) => {
          saved = s;
        },
      },
    });
    await g.setConsent({ crashes: true });
    expect(saved).toEqual({ crashes: true, analytics: false, replay: false });
  });

  it('hydrate() loads persisted state', async () => {
    const persisted: ConsentState = {
      crashes: true,
      analytics: true,
      replay: false,
    };
    const g = new ConsentGate({
      initial,
      store: {
        load: () => persisted,
        save: () => {},
      },
    });
    await g.hydrate();
    expect(g.getState()).toEqual(persisted);
  });

  it('onChange fires on setConsent', async () => {
    const g = new ConsentGate({ initial });
    const events: ConsentState[] = [];
    g.onChange((s) => events.push(s));
    await g.setConsent({ crashes: true });
    expect(events).toHaveLength(1);
    expect(events[0]?.crashes).toBe(true);
  });
});
