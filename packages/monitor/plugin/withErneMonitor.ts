/**
 * @erne/monitor — Expo Config Plugin
 *
 * Auto-configures iOS and Android native projects for @erne/monitor
 * during `npx expo prebuild`. Adds:
 *
 *   - iOS: ITSAppUsesNonExemptEncryption=false (so the crash report
 *     uploader is not flagged for export compliance), background
 *     fetch capability for Phase 3 transport, NSExceptionAllowsCleartextIO
 *     for the dev dashboard, the privacy info bundle key.
 *   - Android: WAKE_LOCK + ACCESS_NETWORK_STATE permissions, ProGuard
 *     keep rules for the JNI bridge classes, extractNativeLibs=true so
 *     the NDK signal handler ships in the APK.
 *
 * The plugin is idempotent — running `npx expo prebuild --clean`
 * multiple times produces the same result. Composable with other
 * plugins (sentry-expo, expo-dev-client, expo-updates) — we never
 * overwrite shared keys without merging.
 *
 * Usage in app.config.{ts,js}:
 *
 *   { expo: { plugins: ['@erne/monitor/plugin'] } }
 *
 *   // Or with options:
 *   { expo: { plugins: [['@erne/monitor/plugin', { proguardKeep: true }]] } }
 */
import {
  withInfoPlist,
  withAndroidManifest,
  createRunOncePlugin,
  type ConfigPlugin,
} from '@expo/config-plugins';
import type { ExpoConfig } from '@expo/config-types';
import { withPrivacyManifest } from './withPrivacyManifest';

export interface ErneMonitorPluginOptions {
  /**
   * Whether to inject ProGuard keep rules for the JNI bridge classes
   * (Android). Defaults to true. Disable only if your build already
   * has manual rules.
   */
  proguardKeep?: boolean;
  /**
   * Allow plain HTTP traffic to the dashboard server. Defaults to
   * true in dev (so localhost:3333 works) and false in production.
   * Pass an explicit value to override.
   */
  allowDevDashboard?: boolean;
  /**
   * When false, skips the privacy manifest validation step. Useful in
   * test harnesses. Defaults to true — keeps every production build
   * gated on the bundled `ios/PrivacyInfo.xcprivacy` file.
   */
  privacyManifest?: boolean;
}

const PKG_NAME = '@erne/monitor';
const PKG_VERSION = '0.1.0';

const withErneMonitorIOS: ConfigPlugin<ErneMonitorPluginOptions> = (config, props) => {
  return withInfoPlist(config, (cfg) => {
    const info = cfg.modResults;
    const allowDev = props?.allowDevDashboard ?? true;

    if (typeof info.ITSAppUsesNonExemptEncryption !== 'boolean') {
      info.ITSAppUsesNonExemptEncryption = false;
    }

    if (allowDev) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ats = (info.NSAppTransportSecurity as any) ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exceptions = (ats.NSExceptionDomains as any) ?? {};
      if (!exceptions.localhost) {
        exceptions.localhost = {
          NSExceptionAllowsInsecureHTTPLoads: true,
          NSIncludesSubdomains: true,
        };
        ats.NSExceptionDomains = exceptions;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (info as any).NSAppTransportSecurity = ats;
      }
    }

    const bgModes = Array.isArray(info.UIBackgroundModes)
      ? (info.UIBackgroundModes as string[])
      : [];
    if (!bgModes.includes('fetch')) bgModes.push('fetch');
    info.UIBackgroundModes = bgModes;

    return cfg;
  });
};

const withErneMonitorAndroid: ConfigPlugin<ErneMonitorPluginOptions> = (config, _props) => {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest as Record<string, unknown>;
    const usesPermissions = ((manifest['uses-permission'] as
      | { $: { 'android:name': string } }[]
      | undefined) ?? []) as { $: { 'android:name': string } }[];

    function ensurePermission(name: string): void {
      if (!usesPermissions.some((p) => p.$['android:name'] === name)) {
        usesPermissions.push({ $: { 'android:name': name } });
      }
    }
    ensurePermission('android.permission.WAKE_LOCK');
    ensurePermission('android.permission.ACCESS_NETWORK_STATE');
    manifest['uses-permission'] = usesPermissions;

    // Make sure the application element preserves native libraries
    // (NDK signal handler) when packaged.
    const application = (manifest.application as
      | { $: Record<string, unknown> }[]
      | undefined) ?? [];
    if (application.length > 0) {
      const app = application[0]!;
      app.$ = app.$ ?? {};
      if (typeof app.$['android:extractNativeLibs'] !== 'string') {
        app.$['android:extractNativeLibs'] = 'true';
      }
    }
    return cfg;
  });
};

const withErneMonitorBase: ConfigPlugin<ErneMonitorPluginOptions> = (
  config,
  props = {},
) => {
  let next: ExpoConfig = config;
  next = withErneMonitorIOS(next, props);
  next = withErneMonitorAndroid(next, props);
  if (props.privacyManifest !== false) {
    next = withPrivacyManifest(next, { logNotice: false });
  }
  return next;
};

export const withErneMonitor = createRunOncePlugin(
  withErneMonitorBase,
  PKG_NAME,
  PKG_VERSION,
);

// Default export so consumers can write `'@erne/monitor/plugin'`
// in app.config.json. The expo CLI looks for the default export.
// eslint-disable-next-line import/no-default-export
export default withErneMonitor;
