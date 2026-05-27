import { afterEach, describe, expect, test, vi } from 'vitest';
import { startDashboardServer, type DashboardServerHandle } from './server.js';
import { DashboardStore } from './storage/sqliteStore.js';
import type { MdnsPublisher, ServiceDescriptor } from './discovery/advertiser.js';

let handle: DashboardServerHandle | null = null;
afterEach(async () => {
  await handle?.close();
  handle = null;
});

function mockPublisher() {
  const published: ServiceDescriptor[] = [];
  const stop = vi.fn();
  const publisher: MdnsPublisher = {
    publish: vi.fn((d) => {
      published.push(d);
      return { stop };
    }),
  };
  return { publisher, published, stop };
}

describe('server LAN discovery wiring (Task 117.79)', () => {
  test('discovery off by default → no advertiser', async () => {
    handle = await startDashboardServer({
      host: '127.0.0.1',
      port: 0,
      store: new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true }),
      enableWebsocket: false,
      publicDir: '/tmp/erne-monitor-nonexistent',
    });
    expect(handle.advertiser).toBeNull();
  });

  test('enabled → advertises the bound port once listening, stops on close', async () => {
    const m = mockPublisher();
    handle = await startDashboardServer({
      host: '127.0.0.1',
      port: 0,
      store: new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true }),
      enableWebsocket: false,
      publicDir: '/tmp/erne-monitor-nonexistent',
      discovery: { publisher: m.publisher, version: '0.1.0' },
    });

    expect(handle.advertiser?.isAdvertising()).toBe(true);
    expect(m.published).toHaveLength(1);
    expect(m.published[0]?.port).toBe(handle.port); // the actual bound port
    expect(m.published[0]?.type).toBe('erne-monitor');

    await handle.close();
    handle = null;
    expect(m.stop).toHaveBeenCalledTimes(1);
  });
});
