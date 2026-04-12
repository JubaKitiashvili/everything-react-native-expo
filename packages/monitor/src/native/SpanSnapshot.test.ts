import { SpanSnapshot } from './SpanSnapshot';
import type { ActiveSpanInfo, InterruptedSpan } from './SpanSnapshot';
import { ErneMonitorNative, LazyNativeModuleLoader } from './ErneMonitorNative';
import { SignalBus } from '../core/SignalBus';
import type { MonitorEvent } from '../types';

function makeStubNative() {
  return new ErneMonitorNative(new LazyNativeModuleLoader(() => null));
}

function makeStubSession() {
  return {
    getCurrentSessionId: () => 'session-span',
  } as unknown as import('../core/SessionManager').SessionManager;
}

function makeRig(opts: {
  drain?: () => Promise<readonly InterruptedSpan[]>;
} = {}) {
  const native = makeStubNative();
  const bus = new SignalBus();
  const startCalls: ActiveSpanInfo[] = [];
  const updateCalls: { id: string; attrs: Record<string, unknown> }[] = [];
  const endCalls: string[] = [];
  const snap = new SpanSnapshot({
    native,
    signalBus: bus,
    sessionManager: makeStubSession(),
    now: () => 100,
    wallNow: () => 200,
    startSpanImpl: (info) => startCalls.push(info),
    updateSpanImpl: (id, attrs) => updateCalls.push({ id, attrs }),
    endSpanImpl: (id) => endCalls.push(id),
    drainInterruptedImpl: opts.drain,
  });
  return { snap, bus, startCalls, updateCalls, endCalls };
}

describe('SpanSnapshot — live span control', () => {
  test('startSpan persists via native + tracks active count', () => {
    const rig = makeRig();
    const span = rig.snap.startSpan({
      id: 'span-1',
      name: 'checkout',
      parentId: null,
      kind: 'internal',
    });
    expect(rig.snap.getActiveCount()).toBe(1);
    expect(rig.startCalls).toHaveLength(1);
    expect(rig.startCalls[0]!.name).toBe('checkout');
    expect(span.startedAt).toBe(200);
  });

  test('updateSpan forwards to native only for known ids', () => {
    const rig = makeRig();
    rig.snap.startSpan({
      id: 'span-1',
      name: 'image-upload',
      parentId: null,
      kind: 'internal',
    });
    rig.snap.updateSpan('span-1', { progress: 0.5 });
    rig.snap.updateSpan('unknown', { progress: 1 });
    expect(rig.updateCalls).toHaveLength(1);
    expect(rig.updateCalls[0]!.id).toBe('span-1');
  });

  test('endSpan clears active set + forwards to native', () => {
    const rig = makeRig();
    rig.snap.startSpan({
      id: 'span-1',
      name: 'op',
      parentId: null,
      kind: 'internal',
    });
    rig.snap.endSpan('span-1');
    expect(rig.snap.getActiveCount()).toBe(0);
    expect(rig.endCalls).toEqual(['span-1']);
  });

  test('active span set is bounded at 50 entries', () => {
    const rig = makeRig();
    for (let i = 0; i < 60; i++) {
      rig.snap.startSpan({
        id: `s-${i}`,
        name: 'op',
        parentId: null,
        kind: 'internal',
      });
    }
    expect(rig.snap.getActiveCount()).toBeLessThanOrEqual(50);
  });
});

describe('SpanSnapshot — interrupted span replay', () => {
  test('replayInterrupted dispatches each persisted span as a custom event', async () => {
    const interrupted: InterruptedSpan[] = [
      {
        id: 'span-x',
        name: 'video-export',
        parentId: null,
        kind: 'internal',
        startedAt: 100,
        lastSeenAt: 800,
        durationMs: 700,
      },
      {
        id: 'span-y',
        name: 'image-resize',
        parentId: 'span-x',
        kind: 'internal',
        startedAt: 200,
        lastSeenAt: 750,
        durationMs: 550,
      },
    ];
    const rig = makeRig({ drain: async () => interrupted });
    const events: MonitorEvent[] = [];
    rig.bus.on('custom', (e) => events.push(e));
    const count = await rig.snap.replayInterrupted();
    expect(count).toBe(2);
    expect(rig.snap.getReplayedCount()).toBe(2);
    expect(events).toHaveLength(2);
    const first = events[0]!.data as {
      name: string;
      attributes: { spanName: string; durationMs: number };
    };
    expect(first.name).toBe('interrupted_span');
    expect(first.attributes.spanName).toBe('video-export');
    expect(first.attributes.durationMs).toBe(700);
  });

  test('replayInterrupted returns 0 when drain impl is missing', async () => {
    const rig = makeRig();
    const count = await rig.snap.replayInterrupted();
    expect(count).toBe(0);
  });

  test('replayInterrupted swallows drain errors', async () => {
    const rig = makeRig({
      drain: async () => {
        throw new Error('boom');
      },
    });
    const count = await rig.snap.replayInterrupted();
    expect(count).toBe(0);
  });
});
