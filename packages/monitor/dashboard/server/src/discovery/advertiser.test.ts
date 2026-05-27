import { describe, expect, test, vi } from 'vitest';
import {
  DashboardAdvertiser,
  ERNE_SERVICE_TYPE,
  type MdnsPublisher,
  type ServiceDescriptor,
} from './advertiser.js';

/** A mock publisher recording what was published + exposing the stop spy. */
function makePublisher() {
  const published: ServiceDescriptor[] = [];
  const stop = vi.fn();
  const publisher: MdnsPublisher = {
    publish: vi.fn((descriptor) => {
      published.push(descriptor);
      return { stop };
    }),
  };
  return { publisher, published, stop };
}

describe('DashboardAdvertiser', () => {
  test('publishes the ERNE service with port + TXT on start', () => {
    const m = makePublisher();
    const adv = new DashboardAdvertiser({ publisher: m.publisher, version: '0.1.0', secure: false });
    adv.start(4174);
    expect(adv.isAdvertising()).toBe(true);
    expect(m.published).toHaveLength(1);
    expect(m.published[0]).toMatchObject({
      name: 'ERNE Dashboard',
      type: ERNE_SERVICE_TYPE,
      port: 4174,
      txt: { path: '/', secure: 'false', version: '0.1.0' },
    });
  });

  test('secure=true + custom path/name reflected in TXT + name', () => {
    const m = makePublisher();
    const adv = new DashboardAdvertiser({
      publisher: m.publisher,
      secure: true,
      path: '/dash',
      name: 'Prod Dashboard',
    });
    adv.start(443);
    expect(m.published[0]).toMatchObject({
      name: 'Prod Dashboard',
      txt: { path: '/dash', secure: 'true' },
    });
  });

  test('start is idempotent (publishes once)', () => {
    const m = makePublisher();
    const adv = new DashboardAdvertiser({ publisher: m.publisher });
    adv.start(4174);
    adv.start(4174);
    expect(m.publisher.publish).toHaveBeenCalledTimes(1);
  });

  test('stop withdraws the advertisement + is idempotent', () => {
    const m = makePublisher();
    const adv = new DashboardAdvertiser({ publisher: m.publisher });
    adv.start(4174);
    adv.stop();
    adv.stop();
    expect(m.stop).toHaveBeenCalledTimes(1);
    expect(adv.isAdvertising()).toBe(false);
  });

  test('ignores an invalid port', () => {
    const m = makePublisher();
    const adv = new DashboardAdvertiser({ publisher: m.publisher });
    adv.start(0);
    adv.start(-1);
    expect(adv.isAdvertising()).toBe(false);
    expect(m.publisher.publish).not.toHaveBeenCalled();
  });

  test('no publisher → unavailable, start is a safe no-op', () => {
    const info = vi.fn();
    const adv = new DashboardAdvertiser({ publisher: null, logger: { info } });
    expect(adv.available).toBe(false);
    adv.start(4174);
    expect(adv.isAdvertising()).toBe(false);
    expect(info).toHaveBeenCalledWith('discovery.unavailable', expect.anything());
  });

  test('a throwing publisher is caught (never crashes the server)', () => {
    const warn = vi.fn();
    const publisher: MdnsPublisher = {
      publish: () => {
        throw new Error('mdns boom');
      },
    };
    const adv = new DashboardAdvertiser({ publisher, logger: { warn } });
    adv.start(4174);
    expect(adv.isAdvertising()).toBe(false);
    expect(warn).toHaveBeenCalledWith('discovery.publish_failed', expect.anything());
  });
});
