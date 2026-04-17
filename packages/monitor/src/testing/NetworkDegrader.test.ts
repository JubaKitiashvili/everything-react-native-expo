import { NetworkDegrader, type FetchLike } from './NetworkDegrader';

function makeTarget(): {
  target: { fetch?: FetchLike };
  originalCalls: { count: number; lastUrl: string | null };
} {
  const originalCalls = { count: 0, lastUrl: null as string | null };
  const fetch: FetchLike = async (input) => {
    originalCalls.count++;
    originalCalls.lastUrl = typeof input === 'string' ? input : String(input);
    return new Response('ok', { status: 200 });
  };
  return { target: { fetch }, originalCalls };
}

describe('NetworkDegrader', () => {
  it('no-ops and leaves fetch untouched when not in dev', () => {
    const { target } = makeTarget();
    const before = target.fetch;
    const d = new NetworkDegrader({ target, isDev: false });
    d.simulateOffline();
    d.simulateSlowNetwork(100);
    d.simulateFlaky(0.5);
    expect(target.fetch).toBe(before);
    expect(d.isActive()).toBe(false);
  });

  it('simulateOffline rejects all requests while active', async () => {
    const { target } = makeTarget();
    const d = new NetworkDegrader({ target, isDev: true });
    d.simulateOffline();
    expect(d.isActive()).toBe(true);
    expect(d.getMode()).toEqual({ kind: 'offline' });
    await expect(target.fetch!('https://api/x')).rejects.toThrow(
      /offline/i,
    );
  });

  it('restore() puts the original fetch back', async () => {
    const { target, originalCalls } = makeTarget();
    const d = new NetworkDegrader({ target, isDev: true });
    d.simulateOffline();
    d.restore();
    expect(d.isActive()).toBe(false);
    const res = await target.fetch!('https://api/x');
    expect(res.status).toBe(200);
    expect(originalCalls.count).toBe(1);
  });

  it('simulateSlowNetwork adds the configured delay before passing through', async () => {
    const { target, originalCalls } = makeTarget();
    const scheduled: { fn: () => void; delay: number }[] = [];
    const d = new NetworkDegrader({
      target,
      isDev: true,
      schedule: (fn, ms) => {
        scheduled.push({ fn, delay: ms });
        return scheduled.length;
      },
    });
    d.simulateSlowNetwork(500);
    const p = target.fetch!('https://api/x');
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.delay).toBe(500);
    // The fetch promise awaits the scheduled callback — fire it now.
    scheduled[0]?.fn();
    const res = await p;
    expect(res.status).toBe(200);
    expect(originalCalls.count).toBe(1);
  });

  it('simulateFlaky fails stochastically based on failureRate', async () => {
    const { target } = makeTarget();
    const d = new NetworkDegrader({ target, isDev: true });
    // Force Math.random to always return 0.1 so failures happen when
    // failureRate > 0.1.
    const origRandom = Math.random;
    Math.random = () => 0.1;
    try {
      d.simulateFlaky(0.5);
      await expect(target.fetch!('https://api/a')).rejects.toThrow(
        /Network request failed/,
      );
      Math.random = () => 0.9;
      const res = await target.fetch!('https://api/b');
      expect(res.status).toBe(200);
    } finally {
      Math.random = origRandom;
    }
  });

  it('changing mode while active swaps behavior without double-wrapping', async () => {
    const { target, originalCalls } = makeTarget();
    const d = new NetworkDegrader({ target, isDev: true });
    d.simulateOffline();
    await expect(target.fetch!('https://api/x')).rejects.toThrow();
    // Swap to a pass-through mode (slow 0) and verify requests flow again.
    d.simulateSlowNetwork(0);
    scheduleImmediate();
    const p = target.fetch!('https://api/y');
    // Since we use real setTimeout with 0ms here and no fake scheduler,
    // the promise resolves on the next tick.
    const res = await p;
    expect(res.status).toBe(200);
    expect(originalCalls.count).toBe(1);

    function scheduleImmediate() {
      /* No-op — using real setTimeout(0) for this path. */
    }
  });

  it('restore without active mode is a no-op', () => {
    const { target } = makeTarget();
    const d = new NetworkDegrader({ target, isDev: true });
    expect(() => d.restore()).not.toThrow();
  });

  it('simulateSlowNetwork rejects negative / NaN input silently', () => {
    const { target } = makeTarget();
    const d = new NetworkDegrader({ target, isDev: true });
    d.simulateSlowNetwork(Number.NaN);
    d.simulateSlowNetwork(-100);
    expect(d.isActive()).toBe(false);
  });

  it('simulateFlaky clamps failureRate to [0, 1]', async () => {
    const { target } = makeTarget();
    const d = new NetworkDegrader({ target, isDev: true });
    d.simulateFlaky(2); // clamped to 1 → always fails
    const origRandom = Math.random;
    Math.random = () => 0.99;
    try {
      await expect(target.fetch!('https://api/x')).rejects.toThrow();
    } finally {
      Math.random = origRandom;
    }
  });
});
