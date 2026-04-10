import {
  NavigationCollector,
  type NavigationAdapter,
  type NavigationEventData,
} from './NavigationCollector';
import { SignalBus } from '../core/SignalBus';
import { EventStore, MemoryEventStoreBackend } from '../storage/EventStore';
import { SessionManager } from '../core/SessionManager';
import { defineMonitorConfig } from '../core/Config';
import type { MonitorEvent } from '../types';

function makeAdapter(
  source: 'expo-router' | 'react-navigation',
  initial: { screen: string; params?: Record<string, unknown> } | null = null,
): {
  adapter: NavigationAdapter;
  fire: (screen: string, params?: Record<string, unknown>) => void;
  unsubscribed: boolean;
} {
  let listener: ((s: string, p?: Record<string, unknown>) => void) | null =
    null;
  const state = { unsubscribed: false };
  const adapter: NavigationAdapter = {
    source,
    subscribe: (cb) => {
      listener = cb;
      return () => {
        state.unsubscribed = true;
        listener = null;
      };
    },
    getCurrent: () => initial,
  };
  return {
    adapter,
    fire: (s, p) => listener?.(s, p),
    get unsubscribed() {
      return state.unsubscribed;
    },
  };
}

async function wiring(
  adapter: NavigationAdapter | null = null,
  nowSeed = 0,
): Promise<{
  bus: SignalBus;
  store: EventStore;
  collector: NavigationCollector;
  clock: { advance: (ms: number) => void };
}> {
  const bus = new SignalBus();
  const store = new EventStore({ backend: new MemoryEventStoreBackend() });
  await store.init();
  const session = new SessionManager({ random: () => 0.2 });
  let t = nowSeed;
  const collector = new NavigationCollector({
    signalBus: bus,
    eventStore: store,
    sessionManager: session,
    adapter,
    now: () => t,
    wallNow: () => 5000 + t,
  });
  collector.init(defineMonitorConfig());
  return {
    bus,
    store,
    collector,
    clock: {
      advance: (ms) => {
        t += ms;
      },
    },
  };
}

describe('NavigationCollector', () => {
  describe('with adapter', () => {
    it('records the initial screen and subsequent transitions', async () => {
      const adapter = makeAdapter('expo-router', { screen: '/home' });
      const w = await wiring(adapter.adapter);
      const received: MonitorEvent[] = [];
      w.bus.on('navigation', (e) => received.push(e));
      w.collector.start();

      w.clock.advance(200);
      adapter.fire('/profile', { id: '42' });

      expect(received).toHaveLength(2);
      const first = received[0]?.data as NavigationEventData;
      expect(first.screen).toBe('/home');
      expect(first.previousScreen).toBeNull();
      expect(first.source).toBe('expo-router');

      const second = received[1]?.data as NavigationEventData;
      expect(second.screen).toBe('/profile');
      expect(second.previousScreen).toBe('/home');
      expect(second.durationMs).toBe(200);
      expect(second.params).toEqual({ id: '42' });
    });

    it('reports react-navigation source when adapter says so', async () => {
      const adapter = makeAdapter('react-navigation');
      const w = await wiring(adapter.adapter);
      const received: MonitorEvent[] = [];
      w.bus.on('navigation', (e) => received.push(e));
      w.collector.start();
      adapter.fire('Home');
      const data = received[0]?.data as NavigationEventData;
      expect(data.source).toBe('react-navigation');
    });

    it('stop() unsubscribes from the adapter', async () => {
      const adapter = makeAdapter('expo-router');
      const w = await wiring(adapter.adapter);
      w.collector.start();
      w.collector.stop();
      expect(adapter.unsubscribed).toBe(true);
    });

    it('stops delivering after stop()', async () => {
      const adapter = makeAdapter('expo-router');
      const w = await wiring(adapter.adapter);
      const received: MonitorEvent[] = [];
      w.bus.on('navigation', (e) => received.push(e));
      w.collector.start();
      adapter.fire('/a');
      w.collector.stop();
      adapter.fire('/b');
      expect(received).toHaveLength(1);
    });

    it('persists navigation events to the store', async () => {
      const adapter = makeAdapter('expo-router');
      const w = await wiring(adapter.adapter);
      w.collector.start();
      adapter.fire('/a');
      adapter.fire('/b');
      await Promise.resolve();
      await Promise.resolve();
      expect(await w.store.count()).toBe(2);
    });
  });

  describe('manual tracking', () => {
    it('trackScreenView works without an adapter', async () => {
      const w = await wiring(null);
      const received: MonitorEvent[] = [];
      w.bus.on('navigation', (e) => received.push(e));
      w.collector.start();
      w.clock.advance(50);
      w.collector.trackScreenView('custom-modal', { kind: 'overlay' });
      const data = received[0]?.data as NavigationEventData;
      expect(data.screen).toBe('custom-modal');
      expect(data.source).toBe('manual');
      expect(data.params).toEqual({ kind: 'overlay' });
      expect(data.durationMs).toBe(50);
    });

    it('previousScreen chains across manual + adapter events', async () => {
      const adapter = makeAdapter('expo-router');
      const w = await wiring(adapter.adapter);
      const received: MonitorEvent[] = [];
      w.bus.on('navigation', (e) => received.push(e));
      w.collector.start();
      adapter.fire('/a');
      w.collector.trackScreenView('/b');
      const second = received[1]?.data as NavigationEventData;
      expect(second.previousScreen).toBe('/a');
    });
  });

  describe('lifecycle', () => {
    it('is idempotent across start/stop', async () => {
      const adapter = makeAdapter('expo-router');
      const w = await wiring(adapter.adapter);
      w.collector.start();
      w.collector.start();
      w.collector.stop();
      w.collector.stop();
      expect(w.collector.isRunning()).toBe(false);
    });
  });
});
