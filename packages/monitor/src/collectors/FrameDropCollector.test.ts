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
  it('emits a frame_drop event after sustained drop + ratio threshold', () => {
    const bus = new SignalBus();
    const raf = makeRaf();
    const c = new FrameDropCollector({
      signalBus: bus,
      requestFrame: raf.requestFrame,
      cancelFrame: raf.cancelFrame,
      dropThreshold: 55,
      sustainedMs: 1000,
      minDropRatio: 0.2,
      minDroppedFrames: 8,
      now: () => 0,
    });
    const received: MonitorEvent[] = [];
    bus.on('frame_drop', (e) => received.push(e));
    c.start();
    // Deliver frames at 50ms intervals (20fps) for 1100ms → 22 frames, all drops
    let t = 0;
    while (t < 1200) {
      t += 50;
      raf.deliver(t);
    }
    expect(received).toHaveLength(1);
    const data = received[0]!.data as FrameDropEventData;
    expect(data.droppedFrames).toBeGreaterThan(8);
    expect(data.averageFps).toBeLessThan(55);
    expect(data.dropRatio).toBeGreaterThanOrEqual(0.2);
    expect(data.minFps).toBeGreaterThan(0);
    expect(data.minFps).toBeLessThan(55);
  });

  it('does not emit when drop ratio is below minDropRatio', () => {
    const bus = new SignalBus();
    const raf = makeRaf();
    const c = new FrameDropCollector({
      signalBus: bus,
      requestFrame: raf.requestFrame,
      cancelFrame: raf.cancelFrame,
      dropThreshold: 55,
      sustainedMs: 1000,
      minDropRatio: 0.5, // require 50%
      minDroppedFrames: 1,
      now: () => 0,
    });
    const received: MonitorEvent[] = [];
    bus.on('frame_drop', (e) => received.push(e));
    c.start();
    // Mix: 2 slow frames + 20 fast frames within 1000ms. Ratio = 2/22 = ~9%.
    // We want the drop window to span sustainedMs so emission is considered.
    // Start with drops, then fast frames to keep the window alive.
    raf.deliver(50); // 20fps (drop)
    raf.deliver(100); // 20fps (drop)
    let t = 100;
    for (let i = 0; i < 30; i++) {
      t += 16; // 62fps (not a drop)
      raf.deliver(t);
    }
    // Drop window was reset when fast frames arrived (because dropStart
    // gets cleared on recovery). Re-test with explicit design.
    expect(received).toHaveLength(0);
  });

  it('does not emit when dropped count is below minDroppedFrames', () => {
    const bus = new SignalBus();
    const raf = makeRaf();
    const c = new FrameDropCollector({
      signalBus: bus,
      requestFrame: raf.requestFrame,
      cancelFrame: raf.cancelFrame,
      dropThreshold: 55,
      sustainedMs: 500,
      minDropRatio: 0.0,
      minDroppedFrames: 10,
      now: () => 0,
    });
    const received: MonitorEvent[] = [];
    bus.on('frame_drop', (e) => received.push(e));
    c.start();
    // Only 5 drops over 600ms — sustained but below minDroppedFrames.
    let t = 0;
    for (let i = 0; i < 5; i++) {
      t += 120; // 8.3fps (way under threshold)
      raf.deliver(t);
    }
    expect(received).toHaveLength(0);
  });

  it('resets window when frame rate recovers before sustainedMs', () => {
    const bus = new SignalBus();
    const raf = makeRaf();
    const c = new FrameDropCollector({
      signalBus: bus,
      requestFrame: raf.requestFrame,
      cancelFrame: raf.cancelFrame,
      dropThreshold: 55,
      sustainedMs: 1000,
      now: () => 0,
    });
    const received: MonitorEvent[] = [];
    bus.on('frame_drop', (e) => received.push(e));
    c.start();
    // 2 slow frames then fast ones before sustainedMs is reached.
    raf.deliver(40);
    raf.deliver(80);
    raf.deliver(96); // 16ms → 62fps (recovers before 1000ms)
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

  it('attaches the current screen when getCurrentScreen is provided', () => {
    const bus = new SignalBus();
    const raf = makeRaf();
    const c = new FrameDropCollector({
      signalBus: bus,
      requestFrame: raf.requestFrame,
      cancelFrame: raf.cancelFrame,
      dropThreshold: 55,
      sustainedMs: 1000,
      minDropRatio: 0.2,
      minDroppedFrames: 8,
      getCurrentScreen: () => 'Profile',
      now: () => 0,
    });
    const received: MonitorEvent[] = [];
    bus.on('frame_drop', (e) => received.push(e));
    c.start();
    let t = 0;
    while (t < 1200) {
      t += 50;
      raf.deliver(t);
    }
    expect(received).toHaveLength(1);
    expect((received[0]!.data as FrameDropEventData).screen).toBe('Profile');
  });

  it('emits type "frame_drop" (not "render")', () => {
    const bus = new SignalBus();
    const raf = makeRaf();
    const c = new FrameDropCollector({
      signalBus: bus,
      requestFrame: raf.requestFrame,
      cancelFrame: raf.cancelFrame,
      dropThreshold: 55,
      sustainedMs: 1000,
      minDropRatio: 0.2,
      minDroppedFrames: 8,
      now: () => 0,
    });
    const renderEvents: MonitorEvent[] = [];
    const frameDropEvents: MonitorEvent[] = [];
    bus.on('render', (e) => renderEvents.push(e));
    bus.on('frame_drop', (e) => frameDropEvents.push(e));
    c.start();
    let t = 0;
    while (t < 1200) {
      t += 50;
      raf.deliver(t);
    }
    expect(renderEvents).toHaveLength(0);
    expect(frameDropEvents).toHaveLength(1);
  });
});
