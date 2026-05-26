import {
  DeepLinkCollector,
  type LinkingLike,
  type DeepLinkEventData,
} from './DeepLinkCollector';
import { SignalBus } from '../core/SignalBus';
import { EventStore, MemoryEventStoreBackend } from '../storage/EventStore';
import { SessionManager } from '../core/SessionManager';
import type { MonitorEvent } from '../types';

function makeLinking(initialUrl: string | null = null): {
  linking: LinkingLike;
  fire: (url: string) => void;
  removed: boolean;
} {
  let handler: ((event: { url: string }) => void) | null = null;
  const state = { removed: false };
  const linking: LinkingLike = {
    getInitialURL: async () => initialUrl,
    addEventListener: (_type, cb) => {
      handler = cb;
      return {
        remove: () => {
          state.removed = true;
          handler = null;
        },
      };
    },
  };
  return {
    linking,
    fire: (url) => handler?.({ url }),
    get removed() {
      return state.removed;
    },
  };
}

async function wiring(linking: LinkingLike | null = null): Promise<{
  bus: SignalBus;
  store: EventStore;
  collector: DeepLinkCollector;
}> {
  const bus = new SignalBus();
  const store = new EventStore({ backend: new MemoryEventStoreBackend() });
  await store.init();
  const session = new SessionManager({ random: () => 0.3 });
  const collector = new DeepLinkCollector({
    signalBus: bus,
    eventStore: store,
    sessionManager: session,
    linking,
    now: () => 42,
    wallNow: () => 1000,
  });
  return { bus, store, collector };
}

function deepLinkData(received: MonitorEvent[]): DeepLinkEventData[] {
  return received.map(
    (e) => (e.data as { attributes: DeepLinkEventData }).attributes,
  );
}

describe('DeepLinkCollector', () => {
  describe('parsing', () => {
    it('parses host, path, and query param keys from a standard URL', async () => {
      const link = makeLinking();
      const w = await wiring(link.linking);
      const received: MonitorEvent[] = [];
      w.bus.on('custom', (e) => received.push(e));
      w.collector.start();
      link.fire('https://example.com/products/42?ref=email&token=secret');

      const [data] = deepLinkData(received);
      expect(data?.parsedHost).toBe('example.com');
      expect(data?.parsedPath).toBe('/products/42');
      expect(data?.queryParamKeys).toEqual(['ref', 'token']);
    });

    it('redacts query param values — only keys are retained', async () => {
      const link = makeLinking();
      const w = await wiring(link.linking);
      const received: MonitorEvent[] = [];
      w.bus.on('custom', (e) => received.push(e));
      w.collector.start();
      link.fire('myapp://auth?email=alice@example.com&password=hunter2');

      const [data] = deepLinkData(received);
      expect(data?.queryParamKeys).toEqual(['email', 'password']);
      const serialized = JSON.stringify(data?.queryParamKeys);
      expect(serialized).not.toContain('hunter2');
      expect(serialized).not.toContain('alice@example.com');
    });

    it('handles custom-scheme links with no authority', async () => {
      const link = makeLinking();
      const w = await wiring(link.linking);
      const received: MonitorEvent[] = [];
      w.bus.on('custom', (e) => received.push(e));
      w.collector.start();
      link.fire('myapp://profile/99');

      const [data] = deepLinkData(received);
      expect(data?.parsedHost).toBe('profile');
      expect(data?.parsedPath).toBe('/99');
      expect(data?.queryParamKeys).toEqual([]);
    });

    it('handles links without query strings', async () => {
      const link = makeLinking();
      const w = await wiring(link.linking);
      const received: MonitorEvent[] = [];
      w.bus.on('custom', (e) => received.push(e));
      w.collector.start();
      link.fire('https://example.com/home');

      const [data] = deepLinkData(received);
      expect(data?.queryParamKeys).toEqual([]);
      expect(data?.parsedPath).toBe('/home');
    });
  });

  describe('cold start', () => {
    it('marks the launch URL as coldStart=true', async () => {
      const link = makeLinking('https://example.com/welcome?utm=launch');
      const w = await wiring(link.linking);
      const received: MonitorEvent[] = [];
      w.bus.on('custom', (e) => received.push(e));
      w.collector.start();
      await Promise.resolve();
      await Promise.resolve();

      const [data] = deepLinkData(received);
      expect(data?.coldStart).toBe(true);
      expect(data?.parsedPath).toBe('/welcome');
      expect(data?.queryParamKeys).toEqual(['utm']);
    });

    it('marks runtime links as coldStart=false', async () => {
      const link = makeLinking();
      const w = await wiring(link.linking);
      const received: MonitorEvent[] = [];
      w.bus.on('custom', (e) => received.push(e));
      w.collector.start();
      link.fire('myapp://settings');

      const [data] = deepLinkData(received);
      expect(data?.coldStart).toBe(false);
    });

    it('does not emit when there is no initial URL', async () => {
      const link = makeLinking(null);
      const w = await wiring(link.linking);
      const received: MonitorEvent[] = [];
      w.bus.on('custom', (e) => received.push(e));
      w.collector.start();
      await Promise.resolve();
      await Promise.resolve();
      expect(received).toHaveLength(0);
    });
  });

  describe('lifecycle', () => {
    it('persists deep link events to the store', async () => {
      const link = makeLinking();
      const w = await wiring(link.linking);
      w.collector.start();
      link.fire('myapp://a');
      link.fire('myapp://b');
      await Promise.resolve();
      await Promise.resolve();
      expect(await w.store.count()).toBe(2);
    });

    it('removes the url listener on stop()', async () => {
      const link = makeLinking();
      const w = await wiring(link.linking);
      w.collector.start();
      w.collector.stop();
      expect(link.removed).toBe(true);
    });

    it('stops delivering after stop()', async () => {
      const link = makeLinking();
      const w = await wiring(link.linking);
      const received: MonitorEvent[] = [];
      w.bus.on('custom', (e) => received.push(e));
      w.collector.start();
      link.fire('myapp://a');
      w.collector.stop();
      link.fire('myapp://b');
      expect(received).toHaveLength(1);
    });

    it('is idempotent across start/stop', async () => {
      const link = makeLinking();
      const w = await wiring(link.linking);
      w.collector.start();
      w.collector.start();
      w.collector.stop();
      w.collector.stop();
      expect(w.collector.isRunning()).toBe(false);
    });
  });

  describe('manual mode', () => {
    it('trackDeepLink works without a Linking module', async () => {
      const w = await wiring(null);
      const received: MonitorEvent[] = [];
      w.bus.on('custom', (e) => received.push(e));
      w.collector.start();
      w.collector.trackDeepLink('myapp://share/5?from=widget', true);

      const [data] = deepLinkData(received);
      expect(data?.parsedHost).toBe('share');
      expect(data?.queryParamKeys).toEqual(['from']);
      expect(data?.coldStart).toBe(true);
    });

    it('ignores manual tracking before start', async () => {
      const w = await wiring(null);
      const received: MonitorEvent[] = [];
      w.bus.on('custom', (e) => received.push(e));
      w.collector.trackDeepLink('myapp://x');
      expect(received).toHaveLength(0);
    });
  });
});
