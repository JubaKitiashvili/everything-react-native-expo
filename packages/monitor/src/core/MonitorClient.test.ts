import { MonitorClient } from './MonitorClient';
import type { Collector, MonitorConfig } from '../types';

function makeCollector(
  name: string,
  priority: number,
  log: string[],
  overrides: Partial<Collector> = {},
): Collector {
  return {
    name,
    priority,
    init: () => log.push(`${name}:init`),
    start: () => log.push(`${name}:start`),
    stop: () => log.push(`${name}:stop`),
    dispose: () => log.push(`${name}:dispose`),
    ...overrides,
  };
}

describe('MonitorClient', () => {
  const config: MonitorConfig = { environment: 'development' };

  beforeEach(() => {
    MonitorClient.__resetForTesting();
  });

  describe('singleton', () => {
    it('init() returns the same instance via getInstance()', () => {
      const client = MonitorClient.init(config);
      expect(MonitorClient.getInstance()).toBe(client);
    });

    it('init() called twice throws', () => {
      MonitorClient.init(config);
      expect(() => MonitorClient.init(config)).toThrow(/called twice/);
    });

    it('getInstance() before init() throws', () => {
      expect(() => MonitorClient.getInstance()).toThrow(/before init/);
    });

    it('__resetForTesting() allows re-init and stops a running client', () => {
      const client = MonitorClient.init(config);
      const log: string[] = [];
      client.registerCollector(makeCollector('a', 0, log));
      client.start();
      expect(client.isRunning()).toBe(true);
      MonitorClient.__resetForTesting();
      expect(log).toContain('a:stop');
      expect(() => MonitorClient.getInstance()).toThrow();
      expect(() => MonitorClient.init(config)).not.toThrow();
    });
  });

  describe('registerCollector', () => {
    it('stores collectors in registration order', () => {
      const client = MonitorClient.init(config);
      const log: string[] = [];
      client.registerCollector(makeCollector('a', 10, log));
      client.registerCollector(makeCollector('b', 0, log));
      expect(client.getCollectors().map((c) => c.name)).toEqual(['a', 'b']);
    });

    it('rejects duplicate names', () => {
      const client = MonitorClient.init(config);
      const log: string[] = [];
      client.registerCollector(makeCollector('a', 0, log));
      expect(() =>
        client.registerCollector(makeCollector('a', 1, log)),
      ).toThrow(/already registered/);
    });

    it('rejects registration after start()', () => {
      const client = MonitorClient.init(config);
      const log: string[] = [];
      client.registerCollector(makeCollector('a', 0, log));
      client.start();
      expect(() =>
        client.registerCollector(makeCollector('b', 1, log)),
      ).toThrow(/while running/);
    });
  });

  describe('start()', () => {
    it('initializes collectors in ascending priority order', () => {
      const client = MonitorClient.init(config);
      const log: string[] = [];
      client.registerCollector(makeCollector('b', 10, log));
      client.registerCollector(makeCollector('a', 0, log));
      client.registerCollector(makeCollector('c', 5, log));
      client.start();
      expect(log).toEqual([
        'a:init',
        'a:start',
        'c:init',
        'c:start',
        'b:init',
        'b:start',
      ]);
      expect(client.isRunning()).toBe(true);
    });

    it('passes config to each collector init', () => {
      const client = MonitorClient.init({ flag: true });
      const received: MonitorConfig[] = [];
      client.registerCollector({
        name: 'a',
        priority: 0,
        init: (cfg) => received.push(cfg),
        start: () => {},
        stop: () => {},
        dispose: () => {},
      });
      client.start();
      expect(received).toEqual([{ flag: true }]);
    });

    it('is idempotent — second start() is a no-op', () => {
      const client = MonitorClient.init(config);
      const log: string[] = [];
      client.registerCollector(makeCollector('a', 0, log));
      client.start();
      client.start();
      expect(log.filter((l) => l === 'a:init').length).toBe(1);
    });

    it('rolls back already-started collectors if one throws', () => {
      const client = MonitorClient.init(config);
      const log: string[] = [];
      client.registerCollector(makeCollector('a', 0, log));
      client.registerCollector(
        makeCollector('b', 1, log, {
          start: () => {
            log.push('b:start');
            throw new Error('boom');
          },
        }),
      );
      client.registerCollector(makeCollector('c', 2, log));
      expect(() => client.start()).toThrow('boom');
      expect(client.isRunning()).toBe(false);
      // a was started, then rolled back. c never ran.
      expect(log).toContain('a:stop');
      expect(log).toContain('a:dispose');
      expect(log).not.toContain('c:init');
    });
  });

  describe('stop()', () => {
    it('disposes in reverse priority order', () => {
      const client = MonitorClient.init(config);
      const log: string[] = [];
      client.registerCollector(makeCollector('a', 0, log));
      client.registerCollector(makeCollector('b', 5, log));
      client.registerCollector(makeCollector('c', 10, log));
      client.start();
      log.length = 0;
      client.stop();
      expect(log).toEqual([
        'c:stop',
        'c:dispose',
        'b:stop',
        'b:dispose',
        'a:stop',
        'a:dispose',
      ]);
      expect(client.isRunning()).toBe(false);
    });

    it('is idempotent — second stop() is a no-op', () => {
      const client = MonitorClient.init(config);
      const log: string[] = [];
      client.registerCollector(makeCollector('a', 0, log));
      client.start();
      client.stop();
      client.stop();
      expect(log.filter((l) => l === 'a:stop').length).toBe(1);
    });

    it('disposes every collector even if one throws, then rethrows first error', () => {
      const client = MonitorClient.init(config);
      const log: string[] = [];
      client.registerCollector(makeCollector('a', 0, log));
      client.registerCollector(
        makeCollector('b', 1, log, {
          stop: () => {
            throw new Error('bstop');
          },
        }),
      );
      client.start();
      expect(() => client.stop()).toThrow('bstop');
      expect(log).toContain('a:stop');
      expect(log).toContain('a:dispose');
      expect(client.isRunning()).toBe(false);
    });
  });
});
