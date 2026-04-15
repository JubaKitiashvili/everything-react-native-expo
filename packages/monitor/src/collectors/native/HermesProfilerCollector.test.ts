import { HermesProfilerCollector } from './HermesProfilerCollector';
import type { HermesInternalLike } from './HermesProfilerCollector';
import { SignalBus } from '../../core/SignalBus';
import { SessionManager } from '../../core/SessionManager';
import {
  ErneMonitorNative,
  LazyNativeModuleLoader,
} from '../../native/ErneMonitorNative';
import type {
  ErneMonitorNativeModule,
  NativeMetricsSnapshot,
  NativeSubscription,
} from '../../native/types';
import { UNKNOWN_NATIVE_METRICS } from '../../native/types';
import type { MonitorEvent } from '../../types';

function makeFakeModule(): {
  module: ErneMonitorNativeModule;
  savedProfiles: Array<{ data: string; trigger: string }>;
} {
  const savedProfiles: Array<{ data: string; trigger: string }> = [];
  const defaultMetrics: NativeMetricsSnapshot = {
    ...UNKNOWN_NATIVE_METRICS,
    sampledAt: Date.now(),
  };
  const module: ErneMonitorNativeModule = {
    startNativeMonitoring: () => {},
    stopNativeMonitoring: () => {},
    getNativeMetrics: () => defaultMetrics,
    addListener: (_e, _l) => ({ remove: () => {} }) as NativeSubscription,
    saveHermesProfile: (data: string, trigger: string) => {
      savedProfiles.push({ data, trigger });
      return `/tmp/profile-${Date.now()}-${trigger}.cpuprofile`;
    },
  };
  return { module, savedProfiles };
}

function makeFakeHermes(profileData: string = '{"profile":"data"}'): {
  hermes: HermesInternalLike;
  calls: { enable: number; disable: number };
} {
  const calls = { enable: 0, disable: 0 };
  return {
    hermes: {
      enableSampling: () => {
        calls.enable++;
      },
      disableSampling: () => {
        calls.disable++;
        return profileData;
      },
    },
    calls,
  };
}

function makeCollector(
  fakeModule: ErneMonitorNativeModule,
  hermes: HermesInternalLike | null,
  opts?: { isDev?: boolean; enableInProduction?: boolean },
) {
  const bus = new SignalBus();
  const session = new SessionManager({ random: () => 0.5 });
  const native = new ErneMonitorNative(
    new LazyNativeModuleLoader(() => fakeModule),
  );
  const collector = new HermesProfilerCollector({
    native,
    signalBus: bus,
    sessionManager: session,
    hermesInternal: hermes,
    isDev: opts?.isDev ?? true,
    enableInProduction: opts?.enableInProduction,
  });
  const events: MonitorEvent[] = [];
  bus.onAll((e) => events.push(e));
  return { collector, events };
}

describe('HermesProfilerCollector', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('captures a profile and saves via native bridge', async () => {
    const { module, savedProfiles } = makeFakeModule();
    const { hermes, calls } = makeFakeHermes();
    const { collector, events } = makeCollector(module, hermes);
    collector.start();
    expect(collector.isRunning()).toBe(true);

    const capturePromise = collector.captureProfile(100, 'test');
    expect(collector.isProfiling()).toBe(true);
    expect(calls.enable).toBe(1);

    jest.advanceTimersByTime(100);
    const path = await capturePromise;

    expect(calls.disable).toBe(1);
    expect(savedProfiles).toHaveLength(1);
    expect(savedProfiles[0]!.trigger).toBe('test');
    expect(path).toContain('.cpuprofile');
    expect(events).toHaveLength(1);
    expect(events[0]!.data).toMatchObject({
      name: 'hermes_profile_captured',
      trigger: 'test',
    });
  });

  test('caps duration at 30 seconds', async () => {
    const { module } = makeFakeModule();
    const { hermes } = makeFakeHermes();
    const { collector } = makeCollector(module, hermes);
    collector.start();

    const capturePromise = collector.captureProfile(60_000, 'long');
    // Should cap at 30s
    jest.advanceTimersByTime(30_000);
    await capturePromise;
    expect(collector.isProfiling()).toBe(false);
  });

  test('does not start in production without enableInProduction', () => {
    const { module } = makeFakeModule();
    const { hermes } = makeFakeHermes();
    const { collector } = makeCollector(module, hermes, { isDev: false });
    collector.start();
    expect(collector.isRunning()).toBe(false);
  });

  test('starts in production with enableInProduction=true', () => {
    const { module } = makeFakeModule();
    const { hermes } = makeFakeHermes();
    const { collector } = makeCollector(module, hermes, {
      isDev: false,
      enableInProduction: true,
    });
    collector.start();
    expect(collector.isRunning()).toBe(true);
  });

  test('does not start when HermesInternal is absent', () => {
    const { module } = makeFakeModule();
    const { collector } = makeCollector(module, null);
    collector.start();
    expect(collector.isRunning()).toBe(false);
  });

  test('returns null when not running', async () => {
    const { module } = makeFakeModule();
    const { hermes } = makeFakeHermes();
    const { collector } = makeCollector(module, hermes);
    // not started
    const result = await collector.captureProfile(100);
    expect(result).toBeNull();
  });

  test('prevents concurrent captures', async () => {
    const { module } = makeFakeModule();
    const { hermes } = makeFakeHermes();
    const { collector } = makeCollector(module, hermes);
    collector.start();

    const p1 = collector.captureProfile(200);
    const p2 = collector.captureProfile(200); // should return null

    jest.advanceTimersByTime(200);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).not.toBeNull();
    expect(r2).toBeNull();
  });

  test('stopProfiling cancels in-progress capture', async () => {
    const { module } = makeFakeModule();
    const { hermes, calls } = makeFakeHermes();
    const { collector } = makeCollector(module, hermes);
    collector.start();

    collector.captureProfile(5000);
    expect(collector.isProfiling()).toBe(true);

    collector.stopProfiling();
    expect(collector.isProfiling()).toBe(false);
    expect(calls.disable).toBe(1); // cleanup called disableSampling
  });
});
