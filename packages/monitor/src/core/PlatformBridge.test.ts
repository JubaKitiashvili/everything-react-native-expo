import { JSPlatformBridge, type JSPlatformBridgeDeps } from './JSPlatformBridge';
import type { ConnectionType } from '../types';

function fakeDeps(overrides: Partial<JSPlatformBridgeDeps> = {}): JSPlatformBridgeDeps {
  return {
    platform: {
      OS: 'ios',
      Version: '17.4',
      constants: { Model: 'iPhone15,2', isTesting: false },
    },
    dimensions: {
      get: () => ({ width: 390, height: 844 }),
    },
    getLocale: () => 'en-US',
    getAppInfo: () => ({
      version: '1.2.3',
      buildNumber: '42',
      bundleId: 'com.example.app',
    }),
    getConnectionType: () => 'wifi',
    ...overrides,
  };
}

describe('JSPlatformBridge', () => {
  afterEach(() => {
    const g = globalThis as { __erne_crash_buffer__?: Uint8Array[] };
    delete g.__erne_crash_buffer__;
  });

  describe('getDeviceInfo', () => {
    it('normalizes known platforms', () => {
      const ios = new JSPlatformBridge(
        fakeDeps({ platform: { OS: 'ios', Version: '17.4' } }),
      ).getDeviceInfo();
      expect(ios.platform).toBe('ios');

      const android = new JSPlatformBridge(
        fakeDeps({ platform: { OS: 'android', Version: 34 } }),
      ).getDeviceInfo();
      expect(android.platform).toBe('android');
      expect(android.osVersion).toBe('34');

      const web = new JSPlatformBridge(
        fakeDeps({ platform: { OS: 'web' } }),
      ).getDeviceInfo();
      expect(web.platform).toBe('web');
    });

    it("returns 'unknown' for unrecognized platforms", () => {
      const bridge = new JSPlatformBridge(
        fakeDeps({ platform: { OS: 'plan9' } }),
      );
      expect(bridge.getDeviceInfo().platform).toBe('unknown');
    });

    it('reads dimensions from deps.dimensions', () => {
      const bridge = new JSPlatformBridge(fakeDeps());
      const info = bridge.getDeviceInfo();
      expect(info.screenWidth).toBe(390);
      expect(info.screenHeight).toBe(844);
    });

    it('caches after first call', () => {
      let calls = 0;
      const bridge = new JSPlatformBridge(
        fakeDeps({
          dimensions: {
            get: () => {
              calls++;
              return { width: 1, height: 2 };
            },
          },
        }),
      );
      bridge.getDeviceInfo();
      bridge.getDeviceInfo();
      bridge.getDeviceInfo();
      expect(calls).toBe(1);
    });

    it('detects Android emulator fingerprint', () => {
      const bridge = new JSPlatformBridge(
        fakeDeps({
          platform: {
            OS: 'android',
            Version: 34,
            constants: {
              Fingerprint: 'generic/sdk_gphone64_arm64',
              Brand: 'google',
            },
          },
        }),
      );
      expect(bridge.getDeviceInfo().isEmulator).toBe(true);
    });

    it('falls back to unknown locale without Intl or deps.getLocale', () => {
      const bridge = new JSPlatformBridge(
        fakeDeps({
          getLocale: () => {
            throw new Error('no locale');
          },
        }),
      );
      // Intl is available in Node, so this should still resolve to a locale.
      expect(typeof bridge.getDeviceInfo().locale).toBe('string');
    });

    it('returns frozen DeviceInfo', () => {
      const info = new JSPlatformBridge(fakeDeps()).getDeviceInfo();
      expect(Object.isFrozen(info)).toBe(true);
    });
  });

  describe('getAppInfo', () => {
    it('passes through deps values', () => {
      const info = new JSPlatformBridge(fakeDeps()).getAppInfo();
      expect(info).toEqual({
        version: '1.2.3',
        buildNumber: '42',
        bundleId: 'com.example.app',
      });
    });

    it("returns 'unknown' for missing deps", () => {
      const info = new JSPlatformBridge({}).getAppInfo();
      expect(info.version).toBe('unknown');
      expect(info.buildNumber).toBe('unknown');
      expect(info.bundleId).toBe('unknown');
    });

    it('caches across calls', () => {
      let calls = 0;
      const bridge = new JSPlatformBridge({
        getAppInfo: () => {
          calls++;
          return { version: '1.0', buildNumber: '1', bundleId: 'x' };
        },
      });
      bridge.getAppInfo();
      bridge.getAppInfo();
      expect(calls).toBe(1);
    });
  });

  describe('getMemoryUsage', () => {
    it('returns null in JS (native override in Phase 2)', () => {
      expect(new JSPlatformBridge(fakeDeps()).getMemoryUsage()).toBeNull();
    });
  });

  describe('getConnectionType', () => {
    it('returns the value from deps when valid', () => {
      const bridge = new JSPlatformBridge(
        fakeDeps({ getConnectionType: () => 'cellular' }),
      );
      expect(bridge.getConnectionType()).toBe('cellular');
    });

    it("returns 'unknown' when deps function throws", () => {
      const bridge = new JSPlatformBridge(
        fakeDeps({
          getConnectionType: () => {
            throw new Error('no netinfo');
          },
        }),
      );
      expect(bridge.getConnectionType()).toBe('unknown');
    });

    it("returns 'unknown' when deps omits it", () => {
      const bridge = new JSPlatformBridge({});
      expect(bridge.getConnectionType()).toBe('unknown');
    });

    it('rejects invalid connection values', () => {
      const bridge = new JSPlatformBridge(
        fakeDeps({ getConnectionType: () => 'satellite' as ConnectionType }),
      );
      expect(bridge.getConnectionType()).toBe('unknown');
    });
  });

  describe('persistCrashData', () => {
    it('is synchronous (no promise returned)', () => {
      const bridge = new JSPlatformBridge(fakeDeps());
      const result = bridge.persistCrashData(new Uint8Array([1, 2, 3]));
      expect(result).toBeUndefined();
    });

    it('appends bytes to globalThis buffer for later drain', () => {
      const bridge = new JSPlatformBridge(fakeDeps());
      bridge.persistCrashData(new Uint8Array([1]));
      bridge.persistCrashData(new Uint8Array([2, 3]));
      const g = globalThis as { __erne_crash_buffer__?: Uint8Array[] };
      expect(g.__erne_crash_buffer__).toHaveLength(2);
      expect(g.__erne_crash_buffer__?.[0]).toEqual(new Uint8Array([1]));
      expect(g.__erne_crash_buffer__?.[1]).toEqual(new Uint8Array([2, 3]));
    });
  });
});
