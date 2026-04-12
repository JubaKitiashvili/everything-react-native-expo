"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withErneMonitor = void 0;
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
const config_plugins_1 = require("@expo/config-plugins");
const PKG_NAME = '@erne/monitor';
const PKG_VERSION = '0.1.0';
const withErneMonitorIOS = (config, props) => {
    return (0, config_plugins_1.withInfoPlist)(config, (cfg) => {
        const info = cfg.modResults;
        const allowDev = props?.allowDevDashboard ?? true;
        if (typeof info.ITSAppUsesNonExemptEncryption !== 'boolean') {
            info.ITSAppUsesNonExemptEncryption = false;
        }
        if (allowDev) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ats = info.NSAppTransportSecurity ?? {};
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const exceptions = ats.NSExceptionDomains ?? {};
            if (!exceptions.localhost) {
                exceptions.localhost = {
                    NSExceptionAllowsInsecureHTTPLoads: true,
                    NSIncludesSubdomains: true,
                };
                ats.NSExceptionDomains = exceptions;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                info.NSAppTransportSecurity = ats;
            }
        }
        const bgModes = Array.isArray(info.UIBackgroundModes)
            ? info.UIBackgroundModes
            : [];
        if (!bgModes.includes('fetch'))
            bgModes.push('fetch');
        info.UIBackgroundModes = bgModes;
        return cfg;
    });
};
const withErneMonitorAndroid = (config, _props) => {
    return (0, config_plugins_1.withAndroidManifest)(config, (cfg) => {
        const manifest = cfg.modResults.manifest;
        const usesPermissions = (manifest['uses-permission'] ?? []);
        function ensurePermission(name) {
            if (!usesPermissions.some((p) => p.$['android:name'] === name)) {
                usesPermissions.push({ $: { 'android:name': name } });
            }
        }
        ensurePermission('android.permission.WAKE_LOCK');
        ensurePermission('android.permission.ACCESS_NETWORK_STATE');
        manifest['uses-permission'] = usesPermissions;
        // Make sure the application element preserves native libraries
        // (NDK signal handler) when packaged.
        const application = manifest.application ?? [];
        if (application.length > 0) {
            const app = application[0];
            app.$ = app.$ ?? {};
            if (typeof app.$['android:extractNativeLibs'] !== 'string') {
                app.$['android:extractNativeLibs'] = 'true';
            }
        }
        return cfg;
    });
};
const withErneMonitorBase = (config, props = {}) => {
    let next = config;
    next = withErneMonitorIOS(next, props);
    next = withErneMonitorAndroid(next, props);
    return next;
};
exports.withErneMonitor = (0, config_plugins_1.createRunOncePlugin)(withErneMonitorBase, PKG_NAME, PKG_VERSION);
// Default export so consumers can write `'@erne/monitor/plugin'`
// in app.config.json. The expo CLI looks for the default export.
// eslint-disable-next-line import/no-default-export
exports.default = exports.withErneMonitor;
