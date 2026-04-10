import { SessionManager, type AppStateLike, type AppStateStatus } from './SessionManager';

/** Deterministic PRNG for UUID tests. */
function makeRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function makeClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
  };
}

function makeAppState(): {
  state: AppStateLike;
  fire: (status: AppStateStatus) => void;
  removed: boolean;
} {
  let listener: ((s: AppStateStatus) => void) | null = null;
  let current: AppStateStatus = 'active';
  let removed = false;
  const state: AppStateLike = {
    addChangeListener: (cb) => {
      listener = cb;
      return {
        remove: () => {
          removed = true;
          listener = null;
        },
      };
    },
    currentState: () => current,
  };
  return {
    state,
    fire: (s) => {
      current = s;
      listener?.(s);
    },
    get removed() {
      return removed;
    },
  };
}

describe('SessionManager', () => {
  afterEach(() => {
    const g = globalThis as { __erne_session_listener_errors__?: unknown[] };
    delete g.__erne_session_listener_errors__;
  });

  describe('session IDs', () => {
    it('generates a v4 UUID on construction', () => {
      const mgr = new SessionManager({ random: makeRandom(1) });
      const id = mgr.getCurrentSessionId();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });

    it('startNewSession() produces a different id and fires listeners', () => {
      const mgr = new SessionManager({ random: makeRandom(1) });
      const id1 = mgr.getCurrentSessionId();
      const received: string[] = [];
      mgr.onSessionChange((id) => received.push(id));
      const id2 = mgr.startNewSession();
      expect(id2).not.toBe(id1);
      expect(received).toEqual([id2]);
    });

    it('onSessionChange returns an unsubscribe function', () => {
      const mgr = new SessionManager({ random: makeRandom(1) });
      const received: string[] = [];
      const unsub = mgr.onSessionChange((id) => received.push(id));
      mgr.startNewSession();
      unsub();
      mgr.startNewSession();
      expect(received).toHaveLength(1);
    });
  });

  describe('session duration', () => {
    it('reports elapsed ms since session start', () => {
      const clock = makeClock(1000);
      const mgr = new SessionManager({
        now: clock.now,
        random: makeRandom(2),
      });
      expect(mgr.getSessionDuration()).toBe(0);
      clock.advance(500);
      expect(mgr.getSessionDuration()).toBe(500);
      clock.advance(1500);
      expect(mgr.getSessionDuration()).toBe(2000);
    });

    it('resets to 0 after startNewSession()', () => {
      const clock = makeClock(1000);
      const mgr = new SessionManager({
        now: clock.now,
        random: makeRandom(2),
      });
      clock.advance(10_000);
      mgr.startNewSession();
      expect(mgr.getSessionDuration()).toBe(0);
    });

    it('never returns negative duration if clock jumps back', () => {
      let t = 1000;
      const mgr = new SessionManager({
        now: () => t,
        random: makeRandom(2),
      });
      t = 500;
      expect(mgr.getSessionDuration()).toBe(0);
    });
  });

  describe('AppState inactivity', () => {
    it('starts a new session after 5 minutes backgrounded', () => {
      const clock = makeClock(0);
      const app = makeAppState();
      const mgr = new SessionManager({
        inactivityMs: 5 * 60 * 1000,
        now: clock.now,
        random: makeRandom(3),
        appState: app.state,
      });
      const initial = mgr.getCurrentSessionId();
      const changes: string[] = [];
      mgr.onSessionChange((id) => changes.push(id));

      app.fire('background');
      clock.advance(5 * 60 * 1000 + 1);
      app.fire('active');

      expect(mgr.getCurrentSessionId()).not.toBe(initial);
      expect(changes).toHaveLength(1);
    });

    it('keeps the same session if backgrounded for less than the threshold', () => {
      const clock = makeClock(0);
      const app = makeAppState();
      const mgr = new SessionManager({
        inactivityMs: 5 * 60 * 1000,
        now: clock.now,
        random: makeRandom(3),
        appState: app.state,
      });
      const initial = mgr.getCurrentSessionId();
      app.fire('background');
      clock.advance(2 * 60 * 1000);
      app.fire('active');
      expect(mgr.getCurrentSessionId()).toBe(initial);
    });

    it("treats 'inactive' state the same as background for the timer", () => {
      const clock = makeClock(0);
      const app = makeAppState();
      const mgr = new SessionManager({
        inactivityMs: 1000,
        now: clock.now,
        random: makeRandom(4),
        appState: app.state,
      });
      const initial = mgr.getCurrentSessionId();
      app.fire('inactive');
      clock.advance(1500);
      app.fire('active');
      expect(mgr.getCurrentSessionId()).not.toBe(initial);
    });

    it('does not change session if never backgrounded', () => {
      const clock = makeClock(0);
      const app = makeAppState();
      const mgr = new SessionManager({
        inactivityMs: 100,
        now: clock.now,
        random: makeRandom(5),
        appState: app.state,
      });
      const initial = mgr.getCurrentSessionId();
      app.fire('active');
      clock.advance(10_000);
      app.fire('active');
      expect(mgr.getCurrentSessionId()).toBe(initial);
    });
  });

  describe('dispose', () => {
    it('unsubscribes from AppState and clears listeners', () => {
      const app = makeAppState();
      const mgr = new SessionManager({
        random: makeRandom(6),
        appState: app.state,
      });
      mgr.onSessionChange(() => {
        throw new Error('should not fire');
      });
      mgr.dispose();
      expect(app.removed).toBe(true);
      expect(() => mgr.startNewSession()).not.toThrow();
    });

    it('is idempotent', () => {
      const app = makeAppState();
      const mgr = new SessionManager({
        random: makeRandom(6),
        appState: app.state,
      });
      mgr.dispose();
      expect(() => mgr.dispose()).not.toThrow();
    });
  });

  describe('listener errors', () => {
    it('isolates thrown errors and continues firing other listeners', () => {
      const mgr = new SessionManager({ random: makeRandom(7) });
      let b = 0;
      mgr.onSessionChange(() => {
        throw new Error('boom');
      });
      mgr.onSessionChange(() => {
        b++;
      });
      mgr.startNewSession();
      expect(b).toBe(1);
      const g = globalThis as { __erne_session_listener_errors__?: unknown[] };
      expect(g.__erne_session_listener_errors__).toHaveLength(1);
    });
  });
});
