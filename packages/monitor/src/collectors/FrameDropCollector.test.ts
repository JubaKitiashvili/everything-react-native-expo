import {
  FrameDropCollector,
  type FrameDropEventData,
} from './FrameDropCollector';
import { SignalBus } from '../core/SignalBus';
import type { MonitorEvent } from '../types';

function makeRaf() {
  const queue: ((t: number) => void)[] = [];
  return {
    requestFrame: (cb: (t: number) => void) => {
      queue.push(cb);
      return queue.length;
    },
    cancelFrame: () => {
      // no-op for the simple driver
    },
    deliver: (t: number) => {
      const cb = queue.shift();
      cb?.(t);
    },
    pending: () => queue.length,
  };
}

describe('FrameDropCollector', () => {
  it('emits after a sustained drop', () => {
    const bus = new SignalBus();
    const raf = makeRaf();
    const c = new FrameDropCollector({
      signalBus: bus,
      requestFrame: raf.requestFrame,
      cancelFrame: raf.cancelFrame,
      dropThreshold: 55,
      sustainedMs: 500,
      now: () => 0,
    });
    const received: MonitorEvent[] = [];
    bus.on('render', (e) => received.push(e));
    c.start();
    // Prime lastFrameAt at 0 via start(), then deliver frames via the driver
    // at 50ms intervals (20fps) for 600ms.
    let t = 0;
    while (t < 700) {
      t += 50;
      raf.deliver(t);
    }
    expect(received).toHaveLength(1);
    const data = (received[0]!.data as { frameDrop: FrameDropEventData })
      .frameDrop;
    expect(data.droppedFrames).toBeGreaterThan(5);
    expect(data.averageFps).toBeLessThan(55);
  });

  it('resets window when frame rate recovers before sustainedMs', () => {
    const bus = new SignalBus();
    const raf = makeRaf();
    const c = new FrameDropCollector({
      signalBus: bus,
      requestFrame: raf.requestFrame,
      cancelFrame: raf.cancelFrame,
      dropThreshold: 55,
      sustainedMs: 500,
      now: () => 0,
    });
    const received: MonitorEvent[] = [];
    bus.on('render', (e) => received.push(e));
    c.start();
    // 2 slow frames then fast ones.
    raf.deliver(40);
    raf.deliver(80);
    raf.deliver(96); // 16ms → 62fps
    raf.deliver(112);
    raf.deliver(128);
    expect(received).toHaveLength(0);
  });

  it('stops delivering when stopped', () => {
    const bus = new SignalBus();
    const raf = makeRaf();
    const c = new FrameDropCollector({
      signalBus: bus,
      requestFrame: raf.requestFrame,
      cancelFrame: raf.cancelFrame,
      now: () => 0,
    });
    c.start();
    c.stop();
    c.onFrame(100);
    expect(c.isRunning()).toBe(false);
  });
});
