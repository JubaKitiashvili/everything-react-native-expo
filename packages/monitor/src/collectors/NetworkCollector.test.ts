import {
  NetworkCollector,
  type NetworkEventData,
} from './NetworkCollector';
import { SignalBus } from '../core/SignalBus';
import { EventStore, MemoryEventStoreBackend } from '../storage/EventStore';
import { SessionManager } from '../core/SessionManager';
import { defineMonitorConfig } from '../core/Config';
import type { MonitorEvent } from '../types';

type FetchFn = typeof fetch;

function fakeResponse(
  status: number,
  headers: Record<string, string> = {},
): Response {
  return {
    status,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  } as unknown as Response;
}

async function wiring(
  fetchImpl: FetchFn,
  extra: Partial<ConstructorParameters<typeof NetworkCollector>[0]> = {},
) {
  const bus = new SignalBus();
  const store = new EventStore({ backend: new MemoryEventStoreBackend() });
  await store.init();
  const session = new SessionManager({ random: () => 0.1 });
  const target: { fetch?: FetchFn; XMLHttpRequest?: typeof XMLHttpRequest } = {
    fetch: fetchImpl,
  };
  const collector = new NetworkCollector({
    signalBus: bus,
    eventStore: store,
    sessionManager: session,
    target,
    now: (() => {
      let t = 1000;
      return () => {
        t += 10;
        return t;
      };
    })(),
    wallNow: () => 5000,
    ...extra,
  });
  collector.init(defineMonitorConfig());
  return { bus, store, collector, target };
}

describe('NetworkCollector', () => {
  describe('fetch patching', () => {
    it('records url, method, status, and duration on success', async () => {
      const fetchImpl: FetchFn = jest.fn(async () =>
        fakeResponse(200, { 'content-length': '1234' }),
      ) as unknown as FetchFn;
      const w = await wiring(fetchImpl);
      const received: MonitorEvent[] = [];
      w.bus.on('network', (e) => received.push(e));
      w.collector.start();

      await w.target.fetch?.('https://api.example.com/users', {
        method: 'POST',
        body: 'hello',
      });

      expect(received).toHaveLength(1);
      const data = received[0]?.data as NetworkEventData;
      expect(data.url).toBe('https://api.example.com/users');
      expect(data.method).toBe('POST');
      expect(data.statusCode).toBe(200);
      expect(data.requestSize).toBe(5);
      expect(data.responseSize).toBe(1234);
      expect(data.transport).toBe('fetch');
      expect(data.durationMs).toBeGreaterThan(0);
    });

    it('captures fetch errors', async () => {
      const fetchImpl: FetchFn = jest.fn(async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as FetchFn;
      const w = await wiring(fetchImpl);
      const received: MonitorEvent[] = [];
      w.bus.on('network', (e) => received.push(e));
      w.collector.start();

      await expect(
        w.target.fetch?.('https://api.example.com/down'),
      ).rejects.toThrow('ECONNREFUSED');

      // The `.then(..., onRejected)` on the original promise runs on a
      // microtask, so flush it before asserting.
      await Promise.resolve();
      await Promise.resolve();

      expect(received).toHaveLength(1);
      const data = received[0]?.data as NetworkEventData;
      expect(data.statusCode).toBeNull();
      expect(data.errorMessage).toBe('ECONNREFUSED');
    });

    it('filters out dev-server and SDK traffic', async () => {
      const fetchImpl: FetchFn = jest.fn(async () =>
        fakeResponse(200),
      ) as unknown as FetchFn;
      const w = await wiring(fetchImpl);
      const received: MonitorEvent[] = [];
      w.bus.on('network', (e) => received.push(e));
      w.collector.start();

      await w.target.fetch?.('http://localhost:8081/index.bundle');
      await w.target.fetch?.('http://127.0.0.1:8081/symbolicate');

      expect(received).toHaveLength(0);
    });

    it('passes an explicit ignoreHosts list', async () => {
      const fetchImpl: FetchFn = jest.fn(async () =>
        fakeResponse(200),
      ) as unknown as FetchFn;
      const w = await wiring(fetchImpl, {
        ignoreHosts: ['my-sdk.example.com'],
      });
      const received: MonitorEvent[] = [];
      w.bus.on('network', (e) => received.push(e));
      w.collector.start();

      await w.target.fetch?.('https://my-sdk.example.com/ingest');
      await w.target.fetch?.('https://api.example.com/ok');

      expect(received).toHaveLength(1);
      const data = received[0]?.data as NetworkEventData;
      expect(data.url).toBe('https://api.example.com/ok');
    });

    it('writes events to the store at normal priority', async () => {
      const fetchImpl: FetchFn = jest.fn(async () =>
        fakeResponse(200),
      ) as unknown as FetchFn;
      const w = await wiring(fetchImpl);
      w.collector.start();
      await w.target.fetch?.('https://api.example.com/a');
      await Promise.resolve();
      await Promise.resolve();
      expect(await w.store.count()).toBe(1);
    });
  });

  describe('lifecycle', () => {
    it('restores the original fetch on stop', async () => {
      const original: FetchFn = jest.fn(async () =>
        fakeResponse(200),
      ) as unknown as FetchFn;
      const w = await wiring(original);
      w.collector.start();
      expect(w.target.fetch).not.toBe(original);
      w.collector.stop();
      expect(w.target.fetch).toBe(original);
    });

    it('is idempotent', async () => {
      const original: FetchFn = jest.fn(async () =>
        fakeResponse(200),
      ) as unknown as FetchFn;
      const w = await wiring(original);
      w.collector.start();
      const patched = w.target.fetch;
      w.collector.start();
      expect(w.target.fetch).toBe(patched);
      w.collector.stop();
      w.collector.stop();
      expect(w.target.fetch).toBe(original);
    });

    it('no-ops gracefully if target has no fetch', async () => {
      const bus = new SignalBus();
      const store = new EventStore({ backend: new MemoryEventStoreBackend() });
      await store.init();
      const session = new SessionManager({ random: () => 0.2 });
      const target = {} as {
        fetch?: FetchFn;
        XMLHttpRequest?: typeof XMLHttpRequest;
      };
      const collector = new NetworkCollector({
        signalBus: bus,
        eventStore: store,
        sessionManager: session,
        target,
      });
      expect(() => {
        collector.start();
        collector.stop();
      }).not.toThrow();
    });
  });
});
