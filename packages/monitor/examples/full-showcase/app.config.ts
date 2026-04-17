import type { ExpoConfig } from 'expo/config';

/**
 * Full-showcase demo — every collector enabled, replay capture wired,
 * expo-sqlite persistence, dev dashboard exception. Used for demo
 * videos + Reassure perf baselines.
 */
const config: ExpoConfig = {
  name: 'ERNE Monitor Showcase',
  slug: 'erne-monitor-full-showcase',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'ernemonitorshowcase',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    bundleIdentifier: 'dev.erne.monitor.showcase',
    supportsTablet: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription: 'Not used — placeholder to allow full SDK demo.',
      NSMicrophoneUsageDescription: 'Not used — placeholder to allow full SDK demo.',
    },
  },
  android: {
    package: 'dev.erne.monitor.showcase',
  },
  plugins: [
    [
      '@erne/monitor/plugin',
      {
        allowDevDashboard: true,
        privacyManifest: true,
      },
    ],
    'expo-router',
    'expo-sqlite',
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
