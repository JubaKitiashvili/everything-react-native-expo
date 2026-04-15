import { ExpoDevToolsPlugin } from './ExpoDevToolsPlugin';
import type {
  DevToolsPluginClient,
  DevToolsPluginClientFactory,
} from './ExpoDevToolsPlugin';
import { SignalBus } from '../core/SignalBus';
import type { MonitorEvent } from '../types';

// ── helpers ──

function makeFakeClient(): {
  client: DevToolsPluginClient;
  sent: Array<{ method: string; params: Record<string, unknown> }>;
  listeners: Map<string, (params: Record<string, unknown>) => void>;
} {
  const sent: Array<{ method: string; params: Record<string, unknown> }> = [];
  const listeners = new Map<string, (params: Record<string, unknown>) => void>();

  const client: DevToolsPluginClient = {
    sendMessage(method, params) {
      sent.push({ method, params });
    },
    addMessageListener(method, listener) {
      listeners.set(method, listener);
      return {
        remove() {
          listeners.delete(method);
        },
      };
    },
  };

  return { client, sent, listeners };
}

function makeFakeFactory(client: DevToolsPluginClient): DevToolsPluginClientFactory {
  return {
    createClient: async () => client,
  };
}

function makeEvent(type: 'crash' | 'network' | 'navigation' | 'render' | 'custom', data: unknown = {}): MonitorEvent {
  return {
    type,
    timestamp: Date.now(),
    wallTime: Date.now(),
    sessionId: 'test-session',
    data,
  };
}

// ── tests ──

describe('ExpoDevToolsPlugin', () => {
  test('connects and registers as ErneMonitor plugin', async () => {
    const { client } = makeFakeClient();
    const bus = new SignalBus();
    const plugin = new ExpoDevToolsPlugin({
      signalBus: bus,
      clientFactory: makeFakeFactory(client),
      isDev: true,
    });

    await plugin.connect();
    expect(plugin.isConnected()).toBe(true);
  });

  test('is a no-op when isDev is false', async () => {
    const { client, sent } = makeFakeClient();
    const bus = new SignalBus();
    const plugin = new ExpoDevToolsPlugin({
      signalBus: bus,
      clientFactory: makeFakeFactory(client),
      isDev: false,
    });

    await plugin.connect();
    expect(plugin.isConnected()).toBe(false);
    expect(sent).toHaveLength(0);
  });

  test('forwards SignalBus events to DevTools client', async () => {
    const { client, sent } = makeFakeClient();
    const bus = new SignalBus();
    const plugin = new ExpoDevToolsPlugin({
      signalBus: bus,
      clientFactory: makeFakeFactory(client),
      isDev: true,
    });

    await plugin.connect();

    // Clear initial messages (healthGrid + recentEvents)
    const initialCount = sent.length;

    bus.emit(makeEvent('crash', { message: 'test error' }));

    const eventMessages = sent.slice(initialCount);
    expect(eventMessages.length).toBeGreaterThanOrEqual(1);
    const eventMsg = eventMessages.find((m) => m.method === 'monitor:event');
    expect(eventMsg).toBeTruthy();
    expect((eventMsg!.params.event as Record<string, unknown>).type).toBe('crash');
  });

  test('sends initial healthGrid and recentEvents on connect', async () => {
    const { client, sent } = makeFakeClient();
    const bus = new SignalBus();
    const plugin = new ExpoDevToolsPlugin({
      signalBus: bus,
      clientFactory: makeFakeFactory(client),
      isDev: true,
    });

    await plugin.connect();

    const methods = sent.map((m) => m.method);
    expect(methods).toContain('monitor:healthGrid');
    expect(methods).toContain('monitor:recentEvents');
  });

  test('handles captureProfile command', async () => {
    const { client, listeners } = makeFakeClient();
    const bus = new SignalBus();
    const onCaptureProfile = jest.fn();
    const plugin = new ExpoDevToolsPlugin({
      signalBus: bus,
      clientFactory: makeFakeFactory(client),
      isDev: true,
      onCaptureProfile,
    });

    await plugin.connect();

    const handler = listeners.get('monitor:captureProfile');
    expect(handler).toBeTruthy();
    handler!({});
    expect(onCaptureProfile).toHaveBeenCalledTimes(1);
  });

  test('handles layoutSnapshot command', async () => {
    const { client, sent, listeners } = makeFakeClient();
    const bus = new SignalBus();
    const mockSnapshot = { type: 'View', frame: { x: 0, y: 0, w: 375, h: 812 } };
    const plugin = new ExpoDevToolsPlugin({
      signalBus: bus,
      clientFactory: makeFakeFactory(client),
      isDev: true,
      onLayoutSnapshot: async () => mockSnapshot,
    });

    await plugin.connect();
    const initialCount = sent.length;

    const handler = listeners.get('monitor:layoutSnapshot');
    expect(handler).toBeTruthy();
    await handler!({});

    const resultMsg = sent.slice(initialCount).find((m) => m.method === 'monitor:layoutSnapshotResult');
    expect(resultMsg).toBeTruthy();
    expect(resultMsg!.params.snapshot).toEqual(mockSnapshot);
  });

  test('buffers recent events up to maxRecentEvents', async () => {
    const { client } = makeFakeClient();
    const bus = new SignalBus();
    const plugin = new ExpoDevToolsPlugin({
      signalBus: bus,
      clientFactory: makeFakeFactory(client),
      isDev: true,
      maxRecentEvents: 3,
    });

    await plugin.connect();

    for (let i = 0; i < 5; i++) {
      bus.emit(makeEvent('custom', { index: i }));
    }

    expect(plugin.recentEventCount()).toBe(3);
  });

  test('disconnect cleans up listeners and state', async () => {
    const { client, listeners } = makeFakeClient();
    const bus = new SignalBus();
    const plugin = new ExpoDevToolsPlugin({
      signalBus: bus,
      clientFactory: makeFakeFactory(client),
      isDev: true,
    });

    await plugin.connect();
    expect(plugin.isConnected()).toBe(true);
    expect(listeners.size).toBeGreaterThan(0);

    plugin.disconnect();
    expect(plugin.isConnected()).toBe(false);
    expect(listeners.size).toBe(0);
    expect(plugin.recentEventCount()).toBe(0);
  });

  test('handles factory failure gracefully', async () => {
    const bus = new SignalBus();
    const plugin = new ExpoDevToolsPlugin({
      signalBus: bus,
      clientFactory: {
        createClient: async () => {
          throw new Error('DevTools not available');
        },
      },
      isDev: true,
    });

    // Should not throw
    await plugin.connect();
    expect(plugin.isConnected()).toBe(false);
  });

  test('requestHealthGrid command triggers health grid send', async () => {
    const { client, sent, listeners } = makeFakeClient();
    const bus = new SignalBus();
    const plugin = new ExpoDevToolsPlugin({
      signalBus: bus,
      clientFactory: makeFakeFactory(client),
      isDev: true,
    });

    await plugin.connect();
    const initialCount = sent.length;

    const handler = listeners.get('monitor:requestHealthGrid');
    expect(handler).toBeTruthy();
    handler!({});

    const healthMsgs = sent.slice(initialCount).filter((m) => m.method === 'monitor:healthGrid');
    expect(healthMsgs).toHaveLength(1);
  });

  test('does not double-connect', async () => {
    const { client, sent } = makeFakeClient();
    const bus = new SignalBus();
    const plugin = new ExpoDevToolsPlugin({
      signalBus: bus,
      clientFactory: makeFakeFactory(client),
      isDev: true,
    });

    await plugin.connect();
    const firstCount = sent.length;
    await plugin.connect();
    // Should not send additional initial messages
    expect(sent.length).toBe(firstCount);
  });
});
