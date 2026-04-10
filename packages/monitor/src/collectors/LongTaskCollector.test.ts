import {
  LongTaskCollector,
  type LongTaskEventData,
  type PerformanceObserverCtor,
  type PerformanceObserverLike,
} from './LongTaskCollector';
import { SignalBus } from '../core/SignalBus';
import type { MonitorEvent } from '../types';

describe('LongTaskCollector', () => {
  describe('PerformanceObserver path', () => {
    it('emits events for entries that exceed threshold', () => {
      const bus = new SignalBus();
      let deliver: ((list: { getEntries(): { duration: number }[] }) => void) | null = null;
      const FakeObserver: PerformanceObserverCtor = class
        implements PerformanceObserverLike
      {
        constructor(cb: (list: { getEntries(): { duration: number }[] }) => void) {
          deliver = cb;
        }
        observe() {}
        disconnect() {}
      };
      const c = new LongTaskCollector({
        signalBus: bus,
        PerformanceObserver: FakeObserver,
      });
      c.start();
      const received: MonitorEvent[] = [];
      bus.on('custom', (e) => received.push(e));
      deliver!({ getEntries: () => [{ duration: 80 }, { duration: 20 }, { duration: 120 }] });
      expect(received).toHaveLength(2);
      const first = (received[0]!.data as { attributes: LongTaskEventData })
        .attributes;
      expect(first.detector).toBe('performance-observer');
      expect(first.durationMs).toBe(80);
    });
  });

  describe('rAF fallback', () => {
    it('emits when a frame delta exceeds threshold', () => {
      const bus = new SignalBus();
      const queue: ((t: number) => void)[] = [];
      const c = new LongTaskCollector({
        signalBus: bus,
        PerformanceObserver: null,
        thresholdMs: 50,
        requestFrame: (cb) => {
          queue.push(cb);
          return queue.length;
        },
        cancelFrame: () => {},
        now: () => 0,
      });
      const received: MonitorEvent[] = [];
      bus.on('custom', (e) => received.push(e));
      c.start();
      // Drain initial rAF, then deliver a long-gap tick.
      queue.shift()?.(200);
      queue.shift()?.(260); // 60ms delta
      expect(received).toHaveLength(1);
      const data = (received[0]!.data as { attributes: LongTaskEventData })
        .attributes;
      expect(data.detector).toBe('raf');
      expect(data.durationMs).toBe(60);
    });

    it('ignores short deltas', () => {
      const bus = new SignalBus();
      const queue: ((t: number) => void)[] = [];
      const c = new LongTaskCollector({
        signalBus: bus,
        PerformanceObserver: null,
        thresholdMs: 50,
        requestFrame: (cb) => {
          queue.push(cb);
          return queue.length;
        },
        cancelFrame: () => {},
        now: () => 0,
      });
      const received: MonitorEvent[] = [];
      bus.on('custom', (e) => received.push(e));
      c.start();
      queue.shift()?.(200);
      queue.shift()?.(210);
      queue.shift()?.(220);
      expect(received).toHaveLength(0);
    });
  });
});
