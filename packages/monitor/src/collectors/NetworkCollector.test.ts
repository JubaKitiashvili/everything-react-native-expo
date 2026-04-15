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

  describe('safeResponseSize', () => {
    function makeCollector() {
      const bus = new SignalBus();
      const store = new EventStore({ backend: new MemoryEventStoreBackend() });
      const session = new SessionManager({ random: () => 0.1 });
      return new NetworkCollector({
        signalBus: bus,
        eventStore: store,
        sessionManager: session,
        target: {},
      });
    }

    it('prefers content-length header when present', () => {
      const c = makeCollector();
      const xhr = {
        responseType: '',
        getResponseHeader: (name: string) =>
          name.toLowerCase() === 'content-length' ? '2048' : null,
      } as unknown as XMLHttpRequest;
      expect(c.safeResponseSize(xhr)).toBe(2048);
    });

    it("returns responseText length for text responseType", () => {
      const c = makeCollector();
      const xhr = {
        responseType: 'text',
        responseText: 'hello',
        getResponseHeader: () => null,
      } as unknown as XMLHttpRequest;
      expect(c.safeResponseSize(xhr)).toBe(5);
    });

    it('uses response.byteLength for arraybuffer', () => {
      const c = makeCollector();
      const buf = new ArrayBuffer(123);
      const xhr = {
        responseType: 'arraybuffer',
        response: buf,
        getResponseHeader: () => null,
      } as unknown as XMLHttpRequest;
      expect(c.safeResponseSize(xhr)).toBe(123);
    });

    it('uses blob.size for blob without touching responseText', () => {
      const c = makeCollector();
      const blob = { size: 456 } as Blob;
      const xhr = {
        responseType: 'blob',
        response: blob,
        get responseText(): string {
          throw new Error(
            "The 'responseText' property is only available if 'responseType' is set to '' or 'text', but it is 'blob'.",
          );
        },
        getResponseHeader: () => null,
      } as unknown as XMLHttpRequest;
      expect(() => c.safeResponseSize(xhr)).not.toThrow();
      expect(c.safeResponseSize(xhr)).toBe(456);
    });

    it("returns null for 'json' responseType when no content-length", () => {
      const c = makeCollector();
      const xhr = {
        responseType: 'json',
        getResponseHeader: () => null,
      } as unknown as XMLHttpRequest;
      expect(c.safeResponseSize(xhr)).toBeNull();
    });
  });

  describe('fetch — extractUrl and extractMethod edge cases', () => {
    it('extracts method from Request object when no init.method', async () => {
      const fetchImpl: FetchFn = jest.fn(async () =>
        fakeResponse(200),
      ) as unknown as FetchFn;
      const w = await wiring(fetchImpl);
      const received: MonitorEvent[] = [];
      w.bus.on('network', (e) => received.push(e));
      w.collector.start();

      // Use a URL object
      await w.target.fetch?.(new URL('https://api.example.com/v2'));
      expect(received).toHaveLength(1);
      const data = received[0]?.data as NetworkEventData;
      expect(data.url).toBe('https://api.example.com/v2');
      expect(data.method).toBe('GET');
    });

    it('handles null body as 0 requestSize', async () => {
      const fetchImpl: FetchFn = jest.fn(async () =>
        fakeResponse(200),
      ) as unknown as FetchFn;
      const w = await wiring(fetchImpl);
      const received: MonitorEvent[] = [];
      w.bus.on('network', (e) => received.push(e));
      w.collector.start();

      await w.target.fetch?.('https://api.example.com/data', {
        method: 'DELETE',
      });
      expect(received).toHaveLength(1);
      const data = received[0]?.data as NetworkEventData;
      expect(data.requestSize).toBe(0);
    });

    it('measures ArrayBuffer body size', async () => {
      const fetchImpl: FetchFn = jest.fn(async () =>
        fakeResponse(200),
      ) as unknown as FetchFn;
      const w = await wiring(fetchImpl);
      const received: MonitorEvent[] = [];
      w.bus.on('network', (e) => received.push(e));
      w.collector.start();

      const buf = new ArrayBuffer(42);
      await w.target.fetch?.('https://api.example.com/upload', {
        method: 'PUT',
        body: buf as unknown as BodyInit,
      });
      expect(received).toHaveLength(1);
      const data = received[0]?.data as NetworkEventData;
      expect(data.requestSize).toBe(42);
    });

    it('measures Uint8Array body size', async () => {
      const fetchImpl: FetchFn = jest.fn(async () =>
        fakeResponse(200),
      ) as unknown as FetchFn;
      const w = await wiring(fetchImpl);
      const received: MonitorEvent[] = [];
      w.bus.on('network', (e) => received.push(e));
      w.collector.start();

      const buf = new Uint8Array(17);
      await w.target.fetch?.('https://api.example.com/upload', {
        method: 'PUT',
        body: buf as unknown as BodyInit,
      });
      expect(received).toHaveLength(1);
      const data = received[0]?.data as NetworkEventData;
      expect(data.requestSize).toBe(17);
    });
  });

  describe('XHR patching', () => {
    it('patches XHR and records requests on loadend', async () => {
      const bus = new SignalBus();
      const store = new EventStore({ backend: new MemoryEventStoreBackend() });
      await store.init();
      const session = new SessionManager({ random: () => 0.1 });

      // Create a minimal XHR mock that supports class extension
      const listeners: Map<string, Array<() => void>> = new Map();
      class FakeXHR {
        status = 200;
        responseType = 'text';
        responseText = 'response body';
        open(_method: string, _url: string, ..._rest: unknown[]) {}
        send(_body?: unknown) {
          // Trigger loadend after send
          const handlers = listeners.get('loadend') ?? [];
          for (const h of handlers) h();
        }
        addEventListener(name: string, handler: () => void) {
          const list = listeners.get(name) ?? [];
          list.push(handler);
          listeners.set(name, list);
        }
        getResponseHeader(_name: string) {
          return null;
        }
      }

      const target: {
        fetch?: FetchFn;
        XMLHttpRequest?: typeof XMLHttpRequest;
      } = {
        XMLHttpRequest: FakeXHR as unknown as typeof XMLHttpRequest,
      };

      const collector = new NetworkCollector({
        signalBus: bus,
        eventStore: store,
        sessionManager: session,
        target,
        now: () => 1000,
        wallNow: () => 5000,
      });

      const received: MonitorEvent[] = [];
      bus.on('network', (e) => received.push(e));
      collector.init(defineMonitorConfig());
      collector.start();

      // Use the patched XHR
      const XHR = target.XMLHttpRequest!;
      const xhr = new XHR();
      xhr.open('POST', 'https://api.example.com/data');
      xhr.send('payload');

      expect(received).toHaveLength(1);
      const data = received[0]?.data as NetworkEventData;
      expect(data.method).toBe('POST');
      expect(data.url).toBe('https://api.example.com/data');
      expect(data.transport).toBe('xhr');
      expect(data.statusCode).toBe(200);

      // Restore
      collector.stop();
    });

    it('reports network error for status 0', async () => {
      const bus = new SignalBus();
      const store = new EventStore({ backend: new MemoryEventStoreBackend() });
      await store.init();
      const session = new SessionManager({ random: () => 0.1 });

      const listeners: Map<string, Array<() => void>> = new Map();
      class FakeXHR {
        status = 0; // network error
        responseType = '';
        responseText = '';
        open(_method: string, _url: string, ..._rest: unknown[]) {}
        send(_body?: unknown) {
          const handlers = listeners.get('loadend') ?? [];
          for (const h of handlers) h();
        }
        addEventListener(name: string, handler: () => void) {
          const list = listeners.get(name) ?? [];
          list.push(handler);
          listeners.set(name, list);
        }
        getResponseHeader() { return null; }
      }

      const target = {
        XMLHttpRequest: FakeXHR as unknown as typeof XMLHttpRequest,
      };

      const collector = new NetworkCollector({
        signalBus: bus,
        eventStore: store,
        sessionManager: session,
        target,
        now: () => 1000,
        wallNow: () => 5000,
      });

      const received: MonitorEvent[] = [];
      bus.on('network', (e) => received.push(e));
      collector.init(defineMonitorConfig());
      collector.start();

      const XHR = target.XMLHttpRequest!;
      const xhr = new XHR();
      xhr.open('GET', 'https://api.example.com/fail');
      xhr.send();

      expect(received).toHaveLength(1);
      const data = received[0]?.data as NetworkEventData;
      expect(data.statusCode).toBeNull();
      expect(data.errorMessage).toBe('network error');
      collector.stop();
    });

    it('restores original XHR on stop', async () => {
      const bus = new SignalBus();
      const store = new EventStore({ backend: new MemoryEventStoreBackend() });
      await store.init();
      const session = new SessionManager({ random: () => 0.1 });
      class OriginalXHR {
        open() {}
        send() {}
        addEventListener() {}
      }
      const target: {
        fetch?: FetchFn;
        XMLHttpRequest?: typeof XMLHttpRequest;
      } = {
        XMLHttpRequest: OriginalXHR as unknown as typeof XMLHttpRequest,
      };
      const collector = new NetworkCollector({
        signalBus: bus,
        eventStore: store,
        sessionManager: session,
        target,
      });
      collector.start();
      expect(target.XMLHttpRequest).not.toBe(OriginalXHR);
      collector.stop();
      expect(target.XMLHttpRequest).toBe(OriginalXHR);
    });
  });

  describe('safeResponseSize — additional edge cases', () => {
    function makeCollector() {
      const bus = new SignalBus();
      const store = new EventStore({ backend: new MemoryEventStoreBackend() });
      const session = new SessionManager({ random: () => 0.1 });
      return new NetworkCollector({
        signalBus: bus,
        eventStore: store,
        sessionManager: session,
        target: {},
      });
    }

    it('returns null when getResponseHeader throws', () => {
      const c = makeCollector();
      const xhr = {
        responseType: 'json',
        getResponseHeader: () => {
          throw new Error('no headers');
        },
      } as unknown as XMLHttpRequest;
      expect(c.safeResponseSize(xhr)).toBeNull();
    });

    it('returns null when responseText access throws', () => {
      const c = makeCollector();
      const xhr = {
        responseType: '',
        get responseText(): string {
          throw new Error('InvalidStateError');
        },
        getResponseHeader: () => null,
      } as unknown as XMLHttpRequest;
      expect(c.safeResponseSize(xhr)).toBeNull();
    });

    it('returns null for arraybuffer with null response', () => {
      const c = makeCollector();
      const xhr = {
        responseType: 'arraybuffer',
        response: null,
        getResponseHeader: () => null,
      } as unknown as XMLHttpRequest;
      expect(c.safeResponseSize(xhr)).toBeNull();
    });

    it('returns null for blob with null response', () => {
      const c = makeCollector();
      const xhr = {
        responseType: 'blob',
        response: null,
        getResponseHeader: () => null,
      } as unknown as XMLHttpRequest;
      expect(c.safeResponseSize(xhr)).toBeNull();
    });

    it('returns text length for empty-string responseType', () => {
      const c = makeCollector();
      const xhr = {
        responseType: '',
        responseText: 'hello world',
        getResponseHeader: () => null,
      } as unknown as XMLHttpRequest;
      expect(c.safeResponseSize(xhr)).toBe(11);
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

    it('reports isRunning correctly', async () => {
      const original: FetchFn = jest.fn(async () =>
        fakeResponse(200),
      ) as unknown as FetchFn;
      const w = await wiring(original);
      expect(w.collector.isRunning()).toBe(false);
      w.collector.start();
      expect(w.collector.isRunning()).toBe(true);
      w.collector.stop();
      expect(w.collector.isRunning()).toBe(false);
    });

    it('dispose calls stop', async () => {
      const original: FetchFn = jest.fn(async () =>
        fakeResponse(200),
      ) as unknown as FetchFn;
      const w = await wiring(original);
      w.collector.start();
      expect(w.collector.isRunning()).toBe(true);
      w.collector.dispose();
      expect(w.collector.isRunning()).toBe(false);
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
