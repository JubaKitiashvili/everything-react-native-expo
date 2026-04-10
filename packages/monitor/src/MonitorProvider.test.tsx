import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { MonitorProvider } from './MonitorProvider';
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
