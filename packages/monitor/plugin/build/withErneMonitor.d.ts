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
import { type ConfigPlugin } from '@expo/config-plugins';
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
}
export declare const withErneMonitor: ConfigPlugin<ErneMonitorPluginOptions>;
export default withErneMonitor;
