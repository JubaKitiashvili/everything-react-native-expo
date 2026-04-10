import { Enricher } from './Enricher';
import { SessionManager } from '../core/SessionManager';
import type {
  AppInfo,
  ConnectionType,
  DeviceInfo,
  MemoryInfo,
  MonitorEvent,
  PlatformBridge,
} from '../types';

function makeBridge(overrides: Partial<{
  device: DeviceInfo;
  app: AppInfo;
  memory: MemoryInfo | null;
  connection: ConnectionType;
  deviceCalls: { count: number };
  appCalls: { count: number };
  memoryCalls: { count: number };
  connectionCalls: { count: number };
}> = {}): PlatformBridge & { deviceCalls: number; appCalls: number; memoryCalls: number; connectionCalls: number } {
  let deviceCalls = 0;
  let appCalls = 0;
  let memoryCalls = 0;
  let connectionCalls = 0;
  const device: DeviceInfo =
    overrides.device ??
    Object.freeze({
      platform: 'ios',
      osVersion: '17.4',
      model: 'iPhone15,2',
      isEmulator: false,
      screenWidth: 390,
      screenHeight: 844,
      locale: 'en-US',
    });
  const app: AppInfo =
    overrides.app ??
    Object.freeze({
      version: '1.2.3',
      buildNumber: '42',
      bundleId: 'com.example.app',
    });
  const memory = overrides.memory ?? null;
  const connection: ConnectionType = overrides.connection ?? 'wifi';

  const bridge: PlatformBridge & {
    deviceCalls: number;
    appCalls: number;
    memoryCalls: number;
    connectionCalls: number;
  } = {
    getDeviceInfo: () => {
      deviceCalls++;
      return device;
    },
    getAppInfo: () => {
      appCalls++;
      return app;
    },
    getMemoryUsage: () => {
      memoryCalls++;
      return memory;
    },
    getConnectionType: () => {
      connectionCalls++;
      return connection;
    },
    persistCrashData: () => {},
    get deviceCalls() {
      return deviceCalls;
    },
    get appCalls() {
      return appCalls;
    },
    get memoryCalls() {
      return memoryCalls;
    },
    get connectionCalls() {
      return connectionCalls;
    },
  } as PlatformBridge & {
    deviceCalls: number;
    appCalls: number;
    memoryCalls: number;
    connectionCalls: number;
  };
  return bridge;
}

function rawEvent(): MonitorEvent {
  return {
    type: 'custom',
    timestamp: 1,
    wallTime: 1000,
    sessionId: 'placeholder',
    data: { msg: 'hi' },
  };
}

describe('Enricher', () => {
  it('attaches device, app, session, connection, and memory context', () => {
    const bridge = makeBridge();
    const session = new SessionManager({
      random: () => 0.4,
      now: () => 500,
    });
    const enricher = new Enricher({ platformBridge: bridge, sessionManager: session });
    const out = enricher.enrich(rawEvent());
    expect(out.context.device.platform).toBe('ios');
    expect(out.context.app.version).toBe('1.2.3');
    expect(out.context.session.id).toBe(session.getCurrentSessionId());
    expect(out.context.session.durationMs).toBeGreaterThanOrEqual(0);
    expect(out.context.connectionType).toBe('wifi');
    expect(out.context.memory).toBeNull();
  });

  it('caches device and app info after the first call', () => {
    const bridge = makeBridge();
    const session = new SessionManager({ random: () => 0.4 });
    const enricher = new Enricher({ platformBridge: bridge, sessionManager: session });
    enricher.enrich(rawEvent());
    enricher.enrich(rawEvent());
    enricher.enrich(rawEvent());
    expect(bridge.deviceCalls).toBe(1);
    expect(bridge.appCalls).toBe(1);
  });

  it('refreshes connection and memory on every event', () => {
    const bridge = makeBridge();
    const session = new SessionManager({ random: () => 0.4 });
    const enricher = new Enricher({ platformBridge: bridge, sessionManager: session });
    enricher.enrich(rawEvent());
    enricher.enrich(rawEvent());
    expect(bridge.connectionCalls).toBe(2);
    expect(bridge.memoryCalls).toBe(2);
  });

  it('invalidateCache() forces a re-read', () => {
    const bridge = makeBridge();
    const session = new SessionManager({ random: () => 0.4 });
    const enricher = new Enricher({ platformBridge: bridge, sessionManager: session });
    enricher.enrich(rawEvent());
    enricher.invalidateCache();
    enricher.enrich(rawEvent());
    expect(bridge.deviceCalls).toBe(2);
    expect(bridge.appCalls).toBe(2);
  });

  it('does not mutate the original event', () => {
    const bridge = makeBridge();
    const session = new SessionManager({ random: () => 0.4 });
    const enricher = new Enricher({ platformBridge: bridge, sessionManager: session });
    const input = rawEvent();
    const out = enricher.enrich(input);
    expect((input as unknown as Record<string, unknown>).context).toBeUndefined();
    expect(out).not.toBe(input);
  });

  it('surfaces memory info when the platform provides it', () => {
    const bridge = makeBridge({ memory: { usedBytes: 12_345_678, totalBytes: 100_000_000 } });
    const session = new SessionManager({ random: () => 0.4 });
    const enricher = new Enricher({ platformBridge: bridge, sessionManager: session });
    const out = enricher.enrich(rawEvent());
    expect(out.context.memory).toEqual({ usedBytes: 12_345_678, totalBytes: 100_000_000 });
  });
});
