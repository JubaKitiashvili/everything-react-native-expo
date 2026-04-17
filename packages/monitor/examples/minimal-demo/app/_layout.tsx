import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MonitorProvider } from '@erne/monitor';

/**
 * Root layout — wraps the whole app in `<MonitorProvider>`.
 *
 * The provider mounts the full SDK pipeline (crash collector, network
 * instrumenter, navigation tracker, breadcrumb ring buffer, signal
 * router, native bridge) with default config. `exposeGlobal` puts the
 * runtime on `globalThis.__ERNE_MONITOR__` so the Diagnostics Dump
 * screen + Maestro chaos flows can read live stats without a hook.
 */
export default function RootLayout() {
  return (
    <MonitorProvider exposeGlobal>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerShown: true,
            headerTitle: 'ERNE Monitor Demo',
          }}
        />
      </SafeAreaProvider>
    </MonitorProvider>
  );
}
