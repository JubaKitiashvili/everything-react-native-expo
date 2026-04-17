import { Tabs } from 'expo-router';

/**
 * Three tabs so the NavigationCollector + frame-drop + render storm
 * telemetry all produce realistic traffic when the Maestro flow +
 * demo video switch between them.
 */
export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Feed',
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Live Stats',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
        }}
      />
    </Tabs>
  );
}
