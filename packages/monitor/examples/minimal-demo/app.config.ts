import type { ExpoConfig } from 'expo/config';

/**
 * Minimal Expo config for the `@erne/monitor` smoke demo.
 *
 * Wires the SDK config plugin so `npx expo prebuild` adds the native
 * permissions, privacy manifest, and app transport security exceptions
 * in one step.
 */
const config: ExpoConfig = {
  name: 'ERNE Monitor Demo',
  slug: 'erne-monitor-minimal-demo',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'ernemonitordemo',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    bundleIdentifier: 'dev.erne.monitor.demo',
    supportsTablet: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'dev.erne.monitor.demo',
  },
  plugins: [
    [
      '@erne/monitor/plugin',
      {
        allowDevDashboard: true,
        privacyManifest: true,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
