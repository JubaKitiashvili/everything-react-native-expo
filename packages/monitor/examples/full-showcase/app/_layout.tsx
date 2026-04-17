import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MonitorProvider, defineMonitorConfig } from '@erne/monitor';

/**
 * Full showcase — every collector enabled including replay + shake
 * bug reporter. Sampling defaults stay at Phase 5 values so the demo
 * videos show the SDK at production-tuned noise levels.
 */
const config = defineMonitorConfig({
  collectors: {
    crash: true,
    network: true,
    navigation: true,
    custom: true,
    render: 'dev',
    frameDrop: 'dev',
    state: 'dev',
    a11y: 'dev',
    memory: true,
    startup: true,
    replay: 'dev',
    touchBoundary: 'dev',
    frustration: 'dev',
    suspense: 'dev',
    activity: 'dev',
    image: 'dev',
    storage: 'dev',
    longTask: 'dev',
  },
  consent: {
    crashes: true,
    analytics: true,
    replay: true,
  },
});

export default function RootLayout() {
  return (
    <MonitorProvider
      exposeGlobal
      config={config}
      dashboardUrl="ws://localhost:3333/monitor"
    >
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="detail/[id]"
            options={{ title: 'Detail' }}
          />
        </Stack>
      </SafeAreaProvider>
    </MonitorProvider>
  );
}
