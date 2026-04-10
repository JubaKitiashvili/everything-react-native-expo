import {
  CrashCollector,
  type CrashEventData,
  type ErrorUtilsHandler,
  type ErrorUtilsLike,
  type RejectionTrackerLike,
} from './CrashCollector';
import { SignalBus } from '../core/SignalBus';
import { EventStore, MemoryEventStoreBackend } from '../storage/EventStore';
import { SessionManager } from '../core/SessionManager';
import { defineMonitorConfig } from '../core/Config';
import type { MonitorEvent } from '../types';

function makeErrorUtils(): {
  module: ErrorUtilsLike;
  trigger: (error: Error, isFatal?: boolean) => void;
  originalCalled: boolean;
  currentHandler: () => ErrorUtilsHandler | null;
} {
  const ORIGINAL: ErrorUtilsHandler = () => {
    state.originalCalled = true;
  };
  let handler: ErrorUtilsHandler | null = ORIGINAL;
  const state = { originalCalled: false };
  const module: ErrorUtilsLike = {
    setGlobalHandler: (fn) => {
      handler = fn;
    },
    getGlobalHandler: () => handler,
  };
  return {
    module,
    trigger: (error, isFatal) => handler?.(error, isFatal),
    get originalCalled() {
      return state.originalCalled;
    },
    currentHandler: () => handler,
  };
}

function makeRejectionTracker(): {
  module: RejectionTrackerLike;
  fire: (id: number, err: unknown) => void;
  enabled: boolean;
} {
  let onUnhandled: ((id: number, err: unknown) => void) | null = null;
  let enabled = false;
  const module: RejectionTrackerLike = {
    enable: (opts) => {
      enabled = true;
      onUnhandled = opts.onUnhandled;
    },
    disable: () => {
      enabled = false;
      onUnhandled = null;
    },
  };
  return {
    module,
    fire: (id, err) => onUnhandled?.(id, err),
    get enabled() {
      return enabled;
    },
  };
}

async function wiring() {
  const bus = new SignalBus();
  const store = new EventStore({ backend: new MemoryEventStoreBackend() });
  await store.init();
  const session = new SessionManager({
    random: () => 0.5,
    now: () => 1,
  });
  const errorUtils = makeErrorUtils();
  const tracker = makeRejectionTracker();
  const collector = new CrashCollector({
    signalBus: bus,
    eventStore: store,
    sessionManager: session,
    errorUtils: errorUtils.module,
    rejectionTracker: tracker.module,
    now: () => 100,
    wallNow: () => 2000,
  });
  collector.init(defineMonitorConfig());
  return { bus, store, session, errorUtils, tracker, collector };
}

describe('CrashCollector', () => {
  describe('lifecycle', () => {
    it('installs handlers on start and restores on stop', async () => {
      const w = await wiring();
      const before = w.errorUtils.currentHandler();
      w.collector.start();
      expect(w.errorUtils.currentHandler()).not.toBe(before);
      expect(w.tracker.enabled).toBe(true);
      w.collector.stop();
      expect(w.errorUtils.currentHandler()).toBe(before);
      expect(w.tracker.enabled).toBe(false);
    });

    it('start is idempotent', async () => {
      const w = await wiring();
      w.collector.start();
      const handler1 = w.errorUtils.currentHandler();
      w.collector.start();
      expect(w.errorUtils.currentHandler()).toBe(handler1);
    });

    it('dispose() behaves like stop()', async () => {
      const w = await wiring();
      w.collector.start();
      w.collector.dispose();
      expect(w.collector.isRunning()).toBe(false);
      expect(w.tracker.enabled).toBe(false);
    });

    it('survives environments without ErrorUtils or tracker', async () => {
      const bus = new SignalBus();
      const store = new EventStore({ backend: new MemoryEventStoreBackend() });
      await store.init();
      const session = new SessionManager({ random: () => 0.1 });
      const collector = new CrashCollector({
        signalBus: bus,
        eventStore: store,
        sessionManager: session,
        errorUtils: null,
        rejectionTracker: null,
      });
      expect(() => {
        collector.start();
        collector.stop();
      }).not.toThrow();
    });
  });

  describe('exception capture', () => {
    it('emits a crash event and chains to the previous handler', async () => {
      const w = await wiring();
      const received: MonitorEvent[] = [];
      w.bus.on('crash', (e) => received.push(e));
      w.collector.start();
      w.errorUtils.trigger(new Error('boom'), false);
      expect(received).toHaveLength(1);
      const data = received[0]?.data as CrashEventData;
      expect(data.kind).toBe('exception');
      expect(data.message).toBe('boom');
      expect(data.stack).toContain('Error: boom');
      expect(data.isFatal).toBe(false);
      expect(w.errorUtils.originalCalled).toBe(true);
    });

    it('writes fatal crashes synchronously to the store', async () => {
      const w = await wiring();
      w.collector.start();
      w.errorUtils.trigger(new Error('fatal boom'), true);
      // No await: insertSync should have persisted the row already.
      const count = await w.store.count();
      expect(count).toBe(1);
      const drained = await w.store.drainAll(1);
      const data = drained[0]?.data as CrashEventData;
      expect(data.isFatal).toBe(true);
      expect(data.message).toBe('fatal boom');
    });

    it('extracts componentStack when present', async () => {
      const w = await wiring();
      const received: MonitorEvent[] = [];
      w.bus.on('crash', (e) => received.push(e));
      w.collector.start();
      const err = Object.assign(new Error('with component'), {
        componentStack: '\n    in Profile\n    in Screen',
      });
      w.errorUtils.trigger(err, false);
      const data = received[0]?.data as CrashEventData;
      expect(data.componentStack).toContain('Profile');
    });

    it('handles non-Error throwables', async () => {
      const w = await wiring();
      const received: MonitorEvent[] = [];
      w.bus.on('crash', (e) => received.push(e));
      w.collector.start();
      // TS: simulate the weird case where ErrorUtils delivers a non-Error.
      (w.errorUtils.trigger as unknown as (e: unknown) => void)('plain string');
      const data = received[0]?.data as CrashEventData;
      expect(data.message).toBe('plain string');
      expect(data.stack).toBeNull();
    });
  });

  describe('unhandled rejection capture', () => {
    it('emits a rejection event via the tracker', async () => {
      const w = await wiring();
      const received: MonitorEvent[] = [];
      w.bus.on('crash', (e) => received.push(e));
      w.collector.start();
      w.tracker.fire(7, new Error('promise boom'));
      expect(received).toHaveLength(1);
      const data = received[0]?.data as CrashEventData;
      expect(data.kind).toBe('unhandled-rejection');
      expect(data.message).toBe('promise boom');
      expect(data.rejectionId).toBe(7);
      expect(data.isFatal).toBe(false);
    });

    it('rejections are buffered to the event store (async, high priority)', async () => {
      const w = await wiring();
      w.collector.start();
      w.tracker.fire(1, 'string rejection');
      // Give the microtask queue a chance to flush.
      await Promise.resolve();
      await Promise.resolve();
      expect(await w.store.count()).toBe(1);
      const drained = await w.store.drainAll(1);
      expect((drained[0]?.data as CrashEventData).kind).toBe(
        'unhandled-rejection',
      );
    });
  });
});
