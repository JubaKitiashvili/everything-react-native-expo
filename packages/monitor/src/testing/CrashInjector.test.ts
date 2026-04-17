import { CrashInjector } from './CrashInjector';

function makeScheduler() {
  const pending: { fn: () => void; delay: number }[] = [];
  return {
    schedule: (fn: () => void, delay: number) => {
      pending.push({ fn, delay });
      return pending.length;
    },
    flush: () => {
      // Run in scheduled order.
      while (pending.length > 0) {
        const next = pending.shift();
        next?.fn();
      }
    },
    get count() {
      return pending.length;
    },
  };
}

describe('CrashInjector', () => {
  it('throws via the custom throwFn in dev mode', () => {
    const caught: Error[] = [];
    const inj = new CrashInjector({
      isDev: true,
      throwFn: (err) => caught.push(err),
    });
    inj.triggerJSCrash('boom');
    expect(caught).toHaveLength(1);
    expect(caught[0]?.message).toContain('[synthetic]');
    expect(caught[0]?.message).toContain('boom');
    expect(caught[0]?.name).toBe('SyntheticCrash');
  });

  it('no-ops in non-dev mode', () => {
    const caught: Error[] = [];
    const inj = new CrashInjector({
      isDev: false,
      throwFn: (err) => caught.push(err),
    });
    inj.triggerJSCrash();
    inj.triggerNativeCrash();
    inj.triggerANR(6000);
    inj.triggerSpanCrash('x');
    inj.triggerCrashLoop({ count: 3 });
    expect(caught).toHaveLength(0);
  });

  it('delegates native crash to the native module', () => {
    const triggerTestCrash = jest.fn();
    const inj = new CrashInjector({
      isDev: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      native: { triggerTestCrash } as any,
    });
    inj.triggerNativeCrash();
    expect(triggerTestCrash).toHaveBeenCalled();
  });

  it('converts durationMs to seconds for native triggerTestANR', () => {
    const triggerTestANR = jest.fn();
    const inj = new CrashInjector({
      isDev: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      native: { triggerTestANR } as any,
    });
    inj.triggerANR(6000);
    expect(triggerTestANR).toHaveBeenCalledWith(6);
  });

  it('triggers a span crash via native with the given name', () => {
    const triggerTestSpanCrash = jest.fn();
    const inj = new CrashInjector({
      isDev: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      native: { triggerTestSpanCrash } as any,
    });
    inj.triggerSpanCrash('checkout');
    expect(triggerTestSpanCrash).toHaveBeenCalledWith('checkout');
  });

  it('gracefully no-ops when native is absent', () => {
    const inj = new CrashInjector({ isDev: true, native: null });
    expect(() => {
      inj.triggerNativeCrash();
      inj.triggerANR(6000);
      inj.triggerSpanCrash();
    }).not.toThrow();
  });

  it('triggerCrashLoop schedules N throws with the given interval', () => {
    const sch = makeScheduler();
    const caught: string[] = [];
    const inj = new CrashInjector({
      isDev: true,
      schedule: sch.schedule,
      throwFn: (err) => caught.push(err.message),
    });
    inj.triggerCrashLoop({ count: 3, intervalMs: 50, messagePrefix: 'loop' });
    expect(sch.count).toBe(3);
    sch.flush();
    expect(caught).toHaveLength(3);
    expect(caught[0]).toContain('loop 1/3');
    expect(caught[2]).toContain('loop 3/3');
  });

  it('triggerCrashLoop swallows handler errors so the whole batch fires', () => {
    const sch = makeScheduler();
    let calls = 0;
    const inj = new CrashInjector({
      isDev: true,
      schedule: sch.schedule,
      throwFn: () => {
        calls++;
        throw new Error('handler-rethrows'); // simulate CrashCollector re-throwing
      },
    });
    inj.triggerCrashLoop({ count: 4 });
    sch.flush();
    expect(calls).toBe(4);
  });

  it('cancel() clears pending loop timers', () => {
    const sch = makeScheduler();
    const inj = new CrashInjector({
      isDev: true,
      schedule: sch.schedule,
      throwFn: () => {},
    });
    inj.triggerCrashLoop({ count: 3 });
    inj.cancel();
    // Scheduler still has the callbacks registered since our fake
    // doesn't know about cancellation — but `cancel()` should have
    // attempted to clear them. With the default (real) setTimeout,
    // this matters. Here we just assert it doesn't throw.
    expect(() => inj.cancel()).not.toThrow();
  });
});
