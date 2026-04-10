import {
  CustomEventCollector,
  CUSTOM_EVENT_LIMITS,
  type CustomEventData,
} from './CustomEventCollector';
import { SignalBus } from '../core/SignalBus';
import { EventStore, MemoryEventStoreBackend } from '../storage/EventStore';
import { SessionManager } from '../core/SessionManager';
import type { MonitorEvent } from '../types';

async function wiring() {
  const bus = new SignalBus();
  const store = new EventStore({ backend: new MemoryEventStoreBackend() });
  await store.init();
  const session = new SessionManager({ random: () => 0.3 });
  const collector = new CustomEventCollector({
    signalBus: bus,
    eventStore: store,
    sessionManager: session,
    now: () => 42,
    wallNow: () => 1000,
  });
  return { bus, store, collector };
}

describe('CustomEventCollector', () => {
  describe('trackEvent', () => {
    it('emits a typed event with attributes', async () => {
      const w = await wiring();
      const received: MonitorEvent[] = [];
      w.bus.on('custom', (e) => received.push(e));
      w.collector.trackEvent('checkout_completed', {
        amount: 42.5,
        currency: 'USD',
        trial: false,
      });
      expect(received).toHaveLength(1);
      const data = received[0]?.data as CustomEventData;
      expect(data.name).toBe('checkout_completed');
      expect(data.attributes).toEqual({
        amount: 42.5,
        currency: 'USD',
        trial: false,
      });
    });

    it('works without attributes', async () => {
      const w = await wiring();
      const received: MonitorEvent[] = [];
      w.bus.on('custom', (e) => received.push(e));
      w.collector.trackEvent('app_opened');
      const data = received[0]?.data as CustomEventData;
      expect(data.attributes).toEqual({});
    });

    it('persists to the event store at low priority', async () => {
      const w = await wiring();
      w.collector.trackEvent('a');
      await Promise.resolve();
      await Promise.resolve();
      expect(await w.store.count()).toBe(1);
    });
  });

  describe('validation', () => {
    it('rejects empty name', async () => {
      const w = await wiring();
      expect(() => w.collector.trackEvent('')).toThrow(/non-empty/);
    });

    it('rejects name over max length', async () => {
      const w = await wiring();
      const name = 'x'.repeat(CUSTOM_EVENT_LIMITS.maxNameLength + 1);
      expect(() => w.collector.trackEvent(name)).toThrow(/exceeds/);
    });

    it('rejects too many attributes', async () => {
      const w = await wiring();
      const attrs: Record<string, string> = {};
      for (let i = 0; i <= CUSTOM_EVENT_LIMITS.maxAttributes; i++) {
        attrs[`k${i}`] = 'v';
      }
      expect(() => w.collector.trackEvent('evt', attrs)).toThrow(
        /exceed.+entries/,
      );
    });

    it('rejects non-primitive attribute values', async () => {
      const w = await wiring();
      expect(() =>
        w.collector.trackEvent('evt', {
          bad: { nested: 'obj' } as unknown as string,
        }),
      ).toThrow(/must be string \| number \| boolean/);
    });

    it('rejects long attribute strings', async () => {
      const w = await wiring();
      const big = 'x'.repeat(CUSTOM_EVENT_LIMITS.maxAttributeValueLength + 1);
      expect(() => w.collector.trackEvent('evt', { field: big })).toThrow(
        /exceeds/,
      );
    });

    it('rejects non-finite numbers', async () => {
      const w = await wiring();
      expect(() => w.collector.trackEvent('evt', { x: NaN })).toThrow(
        /finite number/,
      );
      expect(() => w.collector.trackEvent('evt', { x: Infinity })).toThrow(
        /finite number/,
      );
    });
  });
});
