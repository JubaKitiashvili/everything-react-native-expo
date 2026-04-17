import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { MonitorProvider, useMonitor } from './MonitorProvider';
import { MonitorClient } from './core/MonitorClient';
import type { MonitorRuntime } from './core/createMonitorRuntime';
import { MemoryEventStoreBackend } from './storage/EventStore';

function baseDeps() {
  return {
    isDev: true,
    errorUtils: null,
    rejectionTracker: null,
    navigationAdapter: null,
    networkTarget: {},
    eventStoreBackend: new MemoryEventStoreBackend(),
    console: { log: () => {}, warn: () => {}, error: () => {} },
  };
}

async function flush() {
  for (let i = 0; i < 20; i++) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

describe('MonitorProvider', () => {
  afterEach(() => {
    MonitorClient.__resetForTesting();
  });

  it('boots the runtime on mount and tears it down on unmount', async () => {
    let runtime: MonitorRuntime | null = null;
    let tree!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      tree = TestRenderer.create(
        createElement(MonitorProvider, {
          config: {},
          deps: baseDeps(),
          onReady: (r) => {
            runtime = r;
          },
        }),
      );
      await flush();
    });

    expect(runtime).not.toBeNull();
    expect(runtime!.client.isRunning()).toBe(true);

    await act(async () => {
      tree.unmount();
      await flush();
    });

    expect(runtime!.client.isRunning()).toBe(false);
  });

  it('uses defaults when no config is provided', async () => {
    let runtime: MonitorRuntime | null = null;
    let tree!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      tree = TestRenderer.create(
        createElement(MonitorProvider, {
          deps: baseDeps(),
          onReady: (r) => {
            runtime = r;
          },
        }),
      );
      await flush();
    });

    expect(runtime).not.toBeNull();
    expect(runtime!.client.isRunning()).toBe(true);

    await act(async () => {
      tree.unmount();
      await flush();
    });
  });

  it('useMonitor returns the runtime from inside the provider', async () => {
    let hookRuntime: MonitorRuntime | null = null;
    let tree!: TestRenderer.ReactTestRenderer;

    function Consumer() {
      hookRuntime = useMonitor();
      return null;
    }

    await act(async () => {
      tree = TestRenderer.create(
        createElement(
          MonitorProvider,
          { deps: baseDeps() },
          createElement(Consumer),
        ),
      );
      await flush();
    });

    expect(hookRuntime).not.toBeNull();
    expect(hookRuntime!.client.isRunning()).toBe(true);

    await act(async () => {
      tree.unmount();
      await flush();
    });
  });

  it('useMonitor returns null when called outside <MonitorProvider>', async () => {
    let captured: MonitorRuntime | null = 'sentinel' as unknown as MonitorRuntime;

    function Outsider() {
      captured = useMonitor();
      return null;
    }

    await act(async () => {
      TestRenderer.create(createElement(Outsider));
    });
    expect(captured).toBeNull();
  });

  it('useMonitor({ strict: true }) throws when no provider ancestor', async () => {
    function Outsider() {
      useMonitor({ strict: true });
      return null;
    }

    // Silence the expected React error log so the test output stays clean.
    const errSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    try {
      let caught: Error | null = null;
      try {
        await act(async () => {
          TestRenderer.create(createElement(Outsider));
        });
      } catch (e) {
        caught = e as Error;
      }
      expect(caught).not.toBeNull();
      expect(caught!.message).toMatch(/useMonitor\(\{ strict: true \}\)/);
    } finally {
      errSpy.mockRestore();
    }
  });

  it('useMonitor({ strict: true }) returns the runtime once booted under a provider', async () => {
    const observed: Array<MonitorRuntime | null> = [];
    let tree!: TestRenderer.ReactTestRenderer;

    function Consumer() {
      // strict=true inside a provider doesn't throw; it returns null
      // while booting then the runtime once ready.
      const rt = useMonitor({ strict: true });
      observed.push(rt);
      return null;
    }

    await act(async () => {
      tree = TestRenderer.create(
        createElement(
          MonitorProvider,
          { deps: baseDeps() },
          createElement(Consumer),
        ),
      );
      await flush();
    });

    // First render: null (booting). After state update: the runtime.
    expect(observed[0]).toBeNull();
    const ready = observed.find((r) => r !== null);
    expect(ready).toBeDefined();
    expect(ready!.client.isRunning()).toBe(true);

    await act(async () => {
      tree.unmount();
      await flush();
    });
  });

  it('exposeGlobal shortcut forwards to deps.exposeGlobal', async () => {
    const g = globalThis as { __ERNE_MONITOR__?: unknown };
    delete g.__ERNE_MONITOR__;
    let tree!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      tree = TestRenderer.create(
        createElement(MonitorProvider, {
          deps: baseDeps(),
          exposeGlobal: true,
        }),
      );
      await flush();
    });

    expect(g.__ERNE_MONITOR__).toBeDefined();

    await act(async () => {
      tree.unmount();
      await flush();
    });
    expect(g.__ERNE_MONITOR__).toBeUndefined();
  });

  it('explicit deps.exposeGlobal wins over shortcut prop', async () => {
    const g = globalThis as { __ERNE_MONITOR__?: unknown };
    delete g.__ERNE_MONITOR__;
    let tree!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      tree = TestRenderer.create(
        createElement(MonitorProvider, {
          // Shortcut says true, deps says false → deps wins (false).
          deps: { ...baseDeps(), exposeGlobal: false },
          exposeGlobal: true,
        }),
      );
      await flush();
    });

    expect(g.__ERNE_MONITOR__).toBeUndefined();

    await act(async () => {
      tree.unmount();
      await flush();
    });
  });

  it('dashboardUrl shortcut forwards to deps.dashboardUrl', async () => {
    let runtime: MonitorRuntime | null = null;
    let tree!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      tree = TestRenderer.create(
        createElement(MonitorProvider, {
          deps: {
            ...baseDeps(),
            // Null WebSocket ctor so we don't actually try to connect.
            webSocketCtor: null,
          },
          dashboardUrl: 'ws://localhost:9999/monitor',
          onReady: (r) => {
            runtime = r;
          },
        }),
      );
      await flush();
    });

    // dashboardBridge is constructed when deps.dashboardUrl is truthy.
    expect(runtime!.dashboardBridge).not.toBeNull();

    await act(async () => {
      tree.unmount();
      await flush();
    });
  });

  it('does not re-initialize on re-render', async () => {
    const readyCalls: MonitorRuntime[] = [];
    let tree!: TestRenderer.ReactTestRenderer;
    const deps = baseDeps();

    await act(async () => {
      tree = TestRenderer.create(
        createElement(MonitorProvider, {
          deps,
          onReady: (r) => readyCalls.push(r),
        }),
      );
      await flush();
    });

    expect(readyCalls).toHaveLength(1);

    await act(async () => {
      tree.update(
        createElement(MonitorProvider, {
          deps,
          onReady: (r) => readyCalls.push(r),
        }),
      );
      await flush();
    });

    // Still just the one runtime — useEffect's dep array is empty.
    expect(readyCalls).toHaveLength(1);

    await act(async () => {
      tree.unmount();
      await flush();
    });
  });
});
