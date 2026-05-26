import {
  BackgroundFetchCollector,
  type BackgroundAppStateLike,
  type BackgroundTaskRegistration,
  type BackgroundTransitionEventData,
  type BackgroundTaskEventData,
} from './BackgroundFetchCollector';
import { SignalBus } from '../core/SignalBus';
import { EventStore, MemoryEventStoreBackend } from '../storage/EventStore';
import { SessionManager, type AppStateStatus } from '../core/SessionManager';
import type { MonitorEvent } from '../types';

function makeAppState(initial: AppStateStatus = 'active'): {
  appState: BackgroundAppStateLike;
  fire: (status: AppStateStatus) => void;
  removed: boolean;
} {
  let listener: ((status: AppStateStatus) => void) | null = null;
  const state = { removed: false };
  const appState: BackgroundAppStateLike = {
    currentState: () => initial,
    addChangeListener: (cb) => {
      listener = cb;
      return {
        remove: () => {
          state.removed = true;
          listener = null;
        },
      };
    },
  };
  return {
    appState,
    fire: (status) => listener?.(status),
    get removed() {
      return state.removed;
    },
  };
}

function makeTaskRegistration(): {
  registration: BackgroundTaskRegistration;
  run: (
    taskName: string,
  ) => { end: (result: 'success' | 'failed' | 'no-data') => void };
  unsubscribed: boolean;
} {
  let onTask:
    | ((taskName: string) => {
        end: (result: 'success' | 'failed' | 'no-data') => void;
      })
    | null = null;
  const state = { unsubscribed: false };
  const registration: BackgroundTaskRegistration = {
    register: (cb) => {
      onTask = cb;
      return () => {
        state.unsubscribed = true;
        onTask = null;
      };
    },
  };
  return {
    registration,
    run: (taskName) => {
      if (!onTask) throw new Error('not registered');
      return onTask(taskName);
    },
    get unsubscribed() {
      return state.unsubscribed;
    },
  };
}

async function wiring(opts?: {
  appState?: BackgroundAppStateLike | null;
  taskRegistration?: BackgroundTaskRegistration | null;
  nowSeed?: number;
}): Promise<{
  bus: SignalBus;
  store: EventStore;
  collector: BackgroundFetchCollector;
  clock: { advance: (ms: number) => void };
}> {
  const bus = new SignalBus();
  const store = new EventStore({ backend: new MemoryEventStoreBackend() });
  await store.init();
  const session = new SessionManager({ random: () => 0.2 });
  let t = opts?.nowSeed ?? 0;
  const collector = new BackgroundFetchCollector({
    signalBus: bus,
    eventStore: store,
    sessionManager: session,
    appState: opts?.appState,
    taskRegistration: opts?.taskRegistration,
    now: () => t,
    wallNow: () => 5000 + t,
  });
  return {
    bus,
    store,
    collector,
    clock: {
      advance: (ms) => {
        t += ms;
      },
    },
  };
}

function transitions(received: MonitorEvent[]): BackgroundTransitionEventData[] {
  return received
    .filter((e) => (e.data as { name?: string }).name === 'background_transition')
    .map((e) => (e.data as { attributes: BackgroundTransitionEventData }).attributes);
}

function tasks(received: MonitorEvent[]): BackgroundTaskEventData[] {
  return received
    .filter((e) => (e.data as { name?: string }).name === 'background_task')
    .map((e) => (e.data as { attributes: BackgroundTaskEventData }).attributes);
}

describe('BackgroundFetchCollector', () => {
  describe('app state transitions', () => {
    it('emits a transition with from/to/timestamp', async () => {
      const app = makeAppState('active');
      const w = await wiring({ appState: app.appState, nowSeed: 0 });
      const received: MonitorEvent[] = [];
      w.bus.on('custom', (e) => received.push(e));
      w.collector.start();
      app.fire('background');

      const [t] = transitions(received);
      expect(t?.from).toBe('active');
      expect(t?.to).toBe('background');
      expect(t?.timestamp).toBe(5000);
    });

    it('captures foreground/background round trips', async () => {
      const app = makeAppState('active');
      const w = await wiring({ appState: app.appState });
      const received: MonitorEvent[] = [];
      w.bus.on('custom', (e) => received.push(e));
      w.collector.start();
      app.fire('background');
      app.fire('active');

      const ts = transitions(received);
      expect(ts.map((t) => `${t.from}->${t.to}`)).toEqual([
        'active->background',
        'background->active',
      ]);
    });

    it('ignores no-op transitions to the same state', async () => {
      const app = makeAppState('active');
      const w = await wiring({ appState: app.appState });
      const received: MonitorEvent[] = [];
      w.bus.on('custom', (e) => received.push(e));
      w.collector.start();
      app.fire('active');
      expect(transitions(received)).toHaveLength(0);
    });

    it('removes the AppState listener on stop()', async () => {
      const app = makeAppState('active');
      const w = await wiring({ appState: app.appState });
      w.collector.start();
      w.collector.stop();
      expect(app.removed).toBe(true);
    });

    it('stops delivering after stop()', async () => {
      const app = makeAppState('active');
      const w = await wiring({ appState: app.appState });
      const received: MonitorEvent[] = [];
      w.bus.on('custom', (e) => received.push(e));
      w.collector.start();
      app.fire('background');
      w.collector.stop();
      app.fire('active');
      expect(transitions(received)).toHaveLength(1);
    });

    it('persists transition events to the store', async () => {
      const app = makeAppState('active');
      const w = await wiring({ appState: app.appState });
      w.collector.start();
      app.fire('background');
      app.fire('active');
      await Promise.resolve();
      await Promise.resolve();
      expect(await w.store.count()).toBe(2);
    });
  });

  describe('background tasks', () => {
    it('emits a background_task with measured duration and result', async () => {
      const reg = makeTaskRegistration();
      const w = await wiring({ taskRegistration: reg.registration, nowSeed: 0 });
      const received: MonitorEvent[] = [];
      w.bus.on('custom', (e) => received.push(e));
      w.collector.start();

      const handle = reg.run('sync-job');
      w.clock.advance(250);
      handle.end('success');

      const [task] = tasks(received);
      expect(task?.taskName).toBe('sync-job');
      expect(task?.durationMs).toBe(250);
      expect(task?.result).toBe('success');
    });

    it('records failed task results', async () => {
      const reg = makeTaskRegistration();
      const w = await wiring({ taskRegistration: reg.registration });
      const received: MonitorEvent[] = [];
      w.bus.on('custom', (e) => received.push(e));
      w.collector.start();
      reg.run('upload').end('failed');
      expect(tasks(received)[0]?.result).toBe('failed');
    });

    it('unsubscribes the task registration on stop()', async () => {
      const reg = makeTaskRegistration();
      const w = await wiring({ taskRegistration: reg.registration });
      w.collector.start();
      w.collector.stop();
      expect(reg.unsubscribed).toBe(true);
    });
  });

  describe('manual recording', () => {
    it('recordTransition works without an AppState source', async () => {
      const w = await wiring({});
      const received: MonitorEvent[] = [];
      w.bus.on('custom', (e) => received.push(e));
      w.collector.start();
      w.collector.recordTransition('background');
      const [t] = transitions(received);
      expect(t?.from).toBe('unknown');
      expect(t?.to).toBe('background');
    });

    it('recordTask clamps negative durations to zero', async () => {
      const w = await wiring({});
      const received: MonitorEvent[] = [];
      w.bus.on('custom', (e) => received.push(e));
      w.collector.start();
      w.collector.recordTask('weird', -10, 'no-data');
      expect(tasks(received)[0]?.durationMs).toBe(0);
    });

    it('ignores manual recording before start', async () => {
      const w = await wiring({});
      const received: MonitorEvent[] = [];
      w.bus.on('custom', (e) => received.push(e));
      w.collector.recordTransition('background');
      w.collector.recordTask('x', 1, 'success');
      expect(received).toHaveLength(0);
    });
  });

  describe('lifecycle', () => {
    it('is idempotent across start/stop', async () => {
      const app = makeAppState('active');
      const w = await wiring({ appState: app.appState });
      w.collector.start();
      w.collector.start();
      w.collector.stop();
      w.collector.stop();
      expect(w.collector.isRunning()).toBe(false);
    });
  });
});
