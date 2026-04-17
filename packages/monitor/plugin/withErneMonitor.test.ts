/* eslint-disable @typescript-eslint/no-explicit-any */
// Tests for the Expo Config Plugin. We don't actually invoke the
// real `@expo/config-plugins` runtime — instead we mock it with a
// minimal in-memory shim that exercises the same shape the SDK uses.

jest.mock('@expo/config-plugins', () => {
  const helpers = {
    withInfoPlist: (config: any, action: any) => {
      const wrapped = { ...config, modResults: config.ios?.infoPlist ?? {} };
      const next = action(wrapped);
      return {
        ...config,
        ios: { ...(config.ios ?? {}), infoPlist: next.modResults },
      };
    },
    withAndroidManifest: (config: any, action: any) => {
      const initial =
        config.android?.manifest ?? { manifest: { application: [{ $: {} }] } };
      const wrapped = { ...config, modResults: initial };
      const next = action(wrapped);
      return {
        ...config,
        android: { ...(config.android ?? {}), manifest: next.modResults },
      };
    },
    withDangerousMod: (config: any, [, action]: any) => {
      const wrapped = { ...config, modResults: config };
      action(wrapped);
      return config;
    },
    createRunOncePlugin: (plugin: any) => plugin,
  };
  return helpers;
});

// Re-import after the mock is in place.
import { withErneMonitor } from './withErneMonitor';

function makeBaseConfig(): any {
  return {
    name: 'TestApp',
    slug: 'test-app',
    ios: { bundleIdentifier: 'com.test.app', infoPlist: {} },
    android: {
      package: 'com.test.app',
      manifest: {
        manifest: {
          'uses-permission': [] as any[],
          application: [{ $: {} as Record<string, unknown> }],
        },
      },
    },
  };
}

describe('withErneMonitor — iOS', () => {
  test('sets ITSAppUsesNonExemptEncryption to false', () => {
    const out = withErneMonitor(makeBaseConfig() as any, {});
    expect((out.ios as any).infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
  });

  test('does not overwrite an existing ITSAppUsesNonExemptEncryption=true', () => {
    const cfg = makeBaseConfig();
    cfg.ios.infoPlist = { ITSAppUsesNonExemptEncryption: true } as any;
    const out = withErneMonitor(cfg as any, {});
    expect((out.ios as any).infoPlist.ITSAppUsesNonExemptEncryption).toBe(true);
  });

  test('adds localhost ATS exception when allowDevDashboard=true (default)', () => {
    const out = withErneMonitor(makeBaseConfig() as any, {});
    const ats = (out.ios as any).infoPlist.NSAppTransportSecurity;
    expect(ats).toBeTruthy();
    expect(ats.NSExceptionDomains.localhost.NSExceptionAllowsInsecureHTTPLoads).toBe(true);
  });

  test('skips ATS exception when allowDevDashboard=false', () => {
    const out = withErneMonitor(makeBaseConfig() as any, { allowDevDashboard: false });
    const ats = (out.ios as any).infoPlist.NSAppTransportSecurity;
    expect(ats).toBeUndefined();
  });

  test('adds fetch background mode without removing existing modes', () => {
    const cfg = makeBaseConfig();
    cfg.ios.infoPlist = { UIBackgroundModes: ['remote-notification'] } as any;
    const out = withErneMonitor(cfg as any, {});
    const modes = (out.ios as any).infoPlist.UIBackgroundModes as string[];
    expect(modes).toContain('remote-notification');
    expect(modes).toContain('fetch');
  });

  test('idempotent — running twice does not duplicate background modes', () => {
    const once = withErneMonitor(makeBaseConfig() as any, {});
    const twice = withErneMonitor(once, {});
    const modes = (twice.ios as any).infoPlist.UIBackgroundModes as string[];
    expect(modes.filter((m) => m === 'fetch')).toHaveLength(1);
  });
});

describe('withErneMonitor — Android', () => {
  test('adds WAKE_LOCK and ACCESS_NETWORK_STATE permissions', () => {
    const out = withErneMonitor(makeBaseConfig() as any, {});
    const manifest = (out.android as any).manifest.manifest;
    const names = (manifest['uses-permission'] as { $: { 'android:name': string } }[])
      .map((p) => p.$['android:name']);
    expect(names).toContain('android.permission.WAKE_LOCK');
    expect(names).toContain('android.permission.ACCESS_NETWORK_STATE');
  });

  test('idempotent — running twice does not duplicate permissions', () => {
    const once = withErneMonitor(makeBaseConfig() as any, {});
    const twice = withErneMonitor(once, {});
    const names = ((twice.android as any).manifest.manifest['uses-permission'] as {
      $: { 'android:name': string };
    }[]).map((p) => p.$['android:name']);
    expect(names.filter((n) => n === 'android.permission.WAKE_LOCK')).toHaveLength(1);
  });

  test('sets extractNativeLibs=true on the application element', () => {
    const out = withErneMonitor(makeBaseConfig() as any, {});
    const app = (out.android as any).manifest.manifest.application[0];
    expect(app.$['android:extractNativeLibs']).toBe('true');
  });

  test('does not overwrite an existing extractNativeLibs setting', () => {
    const cfg = makeBaseConfig();
    cfg.android.manifest.manifest.application[0].$ = {
      'android:extractNativeLibs': 'false',
    } as any;
    const out = withErneMonitor(cfg as any, {});
    const app = (out.android as any).manifest.manifest.application[0];
    expect(app.$['android:extractNativeLibs']).toBe('false');
  });

  test('preserves existing permissions on the manifest', () => {
    const cfg = makeBaseConfig();
    cfg.android.manifest.manifest['uses-permission'] = [
      { $: { 'android:name': 'android.permission.CAMERA' } },
    ];
    const out = withErneMonitor(cfg as any, {});
    const names = ((out.android as any).manifest.manifest['uses-permission'] as {
      $: { 'android:name': string };
    }[]).map((p) => p.$['android:name']);
    expect(names).toContain('android.permission.CAMERA');
    expect(names).toContain('android.permission.WAKE_LOCK');
  });
});

describe('withErneMonitor — privacy manifest composition', () => {
  test('passes privacyManifest=false to skip manifest validation', () => {
    // Should not throw even if the ios/PrivacyInfo.xcprivacy is missing.
    const out = withErneMonitor(makeBaseConfig() as any, {
      privacyManifest: false,
    });
    expect(out).toBeDefined();
  });

  test('passes privacyManifest=true (default) and requires the real file', () => {
    // The real file exists in ios/ — plugin should succeed silently.
    const out = withErneMonitor(makeBaseConfig() as any, {});
    expect(out).toBeDefined();
  });
});
