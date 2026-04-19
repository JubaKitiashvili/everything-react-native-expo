import { describe, test, expect } from '@jest/globals';
import {
  CrashLoopGuard,
  MemoryCrashLoopPersistence,
  type CrashLoopPersistence,
  type CrashLoopState,
} from './CrashLoopGuard';
import { SignalBus } from './SignalBus';

function makeClock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
}

describe('CrashLoopGuard', () => {
  test('fresh guard starts untripped with zero counter', async () => {
    const guard = new CrashLoopGuard({
      persistence: new MemoryCrashLoopPersistence(),
    });
    await guard.hydrate();
    expect(guard.isTripped()).toBe(false);
    expect(guard.getState().count).toBe(0);
  });

  test('trips after `threshold` crashes within `windowMs`', async () => {
    const clock = makeClock();
    const guard = new CrashLoopGuard({
      persistence: new MemoryCrashLoopPersistence(),
      threshold: 3,
      windowMs: 5_000,
      now: clock.now,
    });
    await guard.hydrate();

    expect(await guard.recordCrash()).toBe(false);
    clock.advance(1_000);
    expect(await guard.recordCrash()).toBe(false);
    clock.advance(1_000);
    expect(await guard.recordCrash()).toBe(true);

    expect(guard.isTripped()).toBe(true);
    expect(guard.getState().count).toBe(3);
  });

  test('does NOT trip when crashes are spread beyond the window', async () => {
    const clock = makeClock();
    const guard = new CrashLoopGuard({
      persistence: new MemoryCrashLoopPersistence(),
      threshold: 3,
      windowMs: 5_000,
      now: clock.now,
    });
    await guard.hydrate();

    await guard.recordCrash();
    clock.advance(10_000); // past the window
    await guard.recordCrash();
    clock.advance(10_000);
    await guard.recordCrash();

    expect(guard.isTripped()).toBe(false);
    expect(guard.getState().count).toBe(1); // restarted counter each time
  });

  test('persists state across guard instances (the actual cross-launch case)', async () => {
    const clock = makeClock();
    const persistence = new MemoryCrashLoopPersistence();

    const first = new CrashLoopGuard({
      persistence,
      threshold: 3,
      windowMs: 10_000,
      now: clock.now,
    });
    await first.hydrate();
    await first.recordCrash();
    await first.recordCrash();

    // Simulate the app crashing + relaunching — a new guard instance reads
    // the same persistent store.
    const second = new CrashLoopGuard({
      persistence,
      threshold: 3,
      windowMs: 10_000,
      now: clock.now,
    });
    await second.hydrate();
    expect(second.getState().count).toBe(2);
    expect(second.isTripped()).toBe(false);

    clock.advance(500);
    const tripped = await second.recordCrash();
    expect(tripped).toBe(true);
    expect(second.isTripped()).toBe(true);
  });

  test('stale trip (older than resetAfterMs) is cleared on hydrate', async () => {
    const clock = makeClock();
    const persistence = new MemoryCrashLoopPersistence();
    await persistence.write({
      count: 5,
      windowStart: 100,
      lastCrashAt: 200,
      trippedAt: 200,
    });

    clock.advance(25 * 60 * 60 * 1_000); // 25h — past the default 24h
    const guard = new CrashLoopGuard({ persistence, now: clock.now });
    await guard.hydrate();
    expect(guard.isTripped()).toBe(false);
    expect(guard.getState().trippedAt).toBeNull();
  });

  test('reset() clears the trip and state', async () => {
    const clock = makeClock();
    const guard = new CrashLoopGuard({
      persistence: new MemoryCrashLoopPersistence(),
      threshold: 2,
      now: clock.now,
    });
    await guard.hydrate();
    await guard.recordCrash();
    await guard.recordCrash();
    expect(guard.isTripped()).toBe(true);

    await guard.reset();
    expect(guard.isTripped()).toBe(false);
    expect(guard.getState().count).toBe(0);
  });

  test('attaches to SignalBus and counts `crash` events automatically', async () => {
    const clock = makeClock();
    const bus = new SignalBus();
    const guard = new CrashLoopGuard({
      persistence: new MemoryCrashLoopPersistence(),
      threshold: 2,
      now: clock.now,
    });
    await guard.hydrate();
    guard.attachToBus(bus);

    const crashEvent = (): Parameters<SignalBus['emit']>[0] => ({
      type: 'crash',
      timestamp: clock.now(),
      wallTime: clock.now(),
      sessionId: 'test',
      data: { message: 'boom' },
    });

    bus.emit(crashEvent());
    // flush microtasks — recordCrash is async inside the sync handler
    await new Promise((r) => setImmediate(r));
    expect(guard.getState().count).toBe(1);

    bus.emit(crashEvent());
    await new Promise((r) => setImmediate(r));
    expect(guard.isTripped()).toBe(true);

    // non-crash events are ignored
    bus.emit({
      type: 'network',
      timestamp: 0,
      wallTime: 0,
      sessionId: 'test',
      data: {},
    });
    await new Promise((r) => setImmediate(r));
    expect(guard.getState().count).toBe(2); // unchanged
  });

  test('announceTripped emits `crash_loop_detected` exactly once', async () => {
    const clock = makeClock();
    const bus = new SignalBus();
    const guard = new CrashLoopGuard({
      persistence: new MemoryCrashLoopPersistence(),
      threshold: 2,
      now: clock.now,
    });
    await guard.hydrate();
    await guard.recordCrash();
    await guard.recordCrash();

    const received: Array<{ type: string; data: unknown }> = [];
    bus.onAll((event) => received.push({ type: event.type, data: event.data }));

    guard.announceTripped(bus, 'boot-session');
    guard.announceTripped(bus, 'boot-session'); // duplicate call — should be a no-op
    expect(received).toHaveLength(1);
    expect(received[0]!.type).toBe('crash_loop_detected');
    const payload = received[0]!.data as Record<string, unknown>;
    expect(payload.threshold).toBe(2);
    expect(payload.windowMs).toBeGreaterThan(0);
  });

  test('announceTripped is a no-op when the guard is not tripped', async () => {
    const bus = new SignalBus();
    const guard = new CrashLoopGuard({
      persistence: new MemoryCrashLoopPersistence(),
    });
    await guard.hydrate();
    const received: string[] = [];
    bus.onAll((e) => received.push(e.type));
    guard.announceTripped(bus, 'boot');
    expect(received).toHaveLength(0);
  });

  test('clearCounter zeros the rolling count but preserves a live trip', async () => {
    const clock = makeClock();
    const guard = new CrashLoopGuard({
      persistence: new MemoryCrashLoopPersistence(),
      threshold: 2,
      now: clock.now,
    });
    await guard.hydrate();
    await guard.recordCrash();
    await guard.recordCrash(); // trips
    await guard.clearCounter();
    expect(guard.getState().count).toBe(0);
    expect(guard.isTripped()).toBe(true); // trip persists until reset()
  });

  test('persistence failures never throw — guard stays in-memory only', async () => {
    const failing: CrashLoopPersistence = {
      read: () => Promise.reject(new Error('disk full')),
      write: () => Promise.reject(new Error('disk full')),
      clear: () => Promise.reject(new Error('disk full')),
    };
    const clock = makeClock();
    const guard = new CrashLoopGuard({
      persistence: failing,
      threshold: 2,
      now: clock.now,
    });
    // hydrate must not throw even when read rejects
    await expect(guard.hydrate()).resolves.toBeUndefined();
    // recordCrash must not throw even when write rejects
    await expect(guard.recordCrash()).resolves.toBe(false);
    await expect(guard.recordCrash()).resolves.toBe(true);
    expect(guard.isTripped()).toBe(true);
  });
});

describe('MemoryCrashLoopPersistence', () => {
  test('read returns null when empty', async () => {
    const p = new MemoryCrashLoopPersistence();
    expect(await p.read()).toBeNull();
  });

  test('write + read round-trip', async () => {
    const p = new MemoryCrashLoopPersistence();
    const state: CrashLoopState = {
      count: 2,
      windowStart: 1_000,
      lastCrashAt: 1_200,
      trippedAt: null,
    };
    await p.write(state);
    expect(await p.read()).toEqual(state);
  });

  test('clear wipes persisted state', async () => {
    const p = new MemoryCrashLoopPersistence();
    await p.write({ count: 1, windowStart: 0, lastCrashAt: 0, trippedAt: null });
    await p.clear();
    expect(await p.read()).toBeNull();
  });
});
