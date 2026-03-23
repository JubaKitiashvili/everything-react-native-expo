---
description: New and experimental Expo packages — glass-effect, maps, ui, widgets, brownfield, server, background-task (SDK 53-55)
globs: '**/*.{ts,tsx}'
alwaysApply: false
---

# New Expo Platform Packages

## expo-glass-effect (Stable — SDK 54+)

iOS Liquid Glass effects (iOS 26+). Falls back gracefully on older iOS.

```tsx
import { GlassView, GlassContainer } from 'expo-glass-effect';

// Basic glass effect
<GlassView style={styles.card}>
  <Text>Content with glass background</Text>
</GlassView>

// Container for grouping glass elements
<GlassContainer style={styles.toolbar}>
  <GlassView style={styles.button}>
    <Icon name="home" />
  </GlassView>
  <GlassView style={styles.button}>
    <Icon name="search" />
  </GlassView>
</GlassContainer>
```

**Platform:** iOS 26+ only. On Android and older iOS, renders as a regular View (no crash, no effect).

---

## expo-maps (Beta — SDK 53+)

Native maps using Google Maps (Android) and Apple Maps (iOS) via Jetpack Compose / SwiftUI.

```tsx
import { MapView, Marker, Polyline, Polygon } from 'expo-maps';

<MapView
  style={{ flex: 1 }}
  initialRegion={{
    latitude: 37.7749,
    longitude: -122.4194,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  }}
  mapType="standard" // 'standard' | 'satellite' | 'hybrid' | 'terrain'
  showsUserLocation={true}
  showsCompass={true}
  rotateEnabled={true}
  scrollEnabled={true}
  zoomEnabled={true}
  onMapPress={(e) => console.log(e.nativeEvent.coordinate)}
  onRegionChange={(region) => {}}
>
  <Marker
    coordinate={{ latitude: 37.7749, longitude: -122.4194 }}
    title="San Francisco"
    description="City by the Bay"
  />
  <Polyline
    coordinates={[
      { latitude: 37.7749, longitude: -122.4194 },
      { latitude: 37.8044, longitude: -122.2712 },
    ]}
    strokeColor="#FF0000"
    strokeWidth={3}
  />
</MapView>;
```

### SDK 54 Additions

- JSON map styling (custom colors, hide POIs)
- POI filtering (show/hide categories)

**Status:** Beta. API may change between SDK versions. For production, consider `react-native-maps` until expo-maps reaches stable.

---

## expo-ui (Experimental — SDK 53+)

Native SwiftUI (iOS) and Jetpack Compose (Android) UI primitives.

```tsx
import { Switch, Slider, Picker, ContextMenu } from 'expo-ui';

// Native toggle
<Switch
  value={isEnabled}
  onValueChange={setIsEnabled}
  label="Enable notifications"
/>

// Native slider
<Slider
  value={volume}
  onValueChange={setVolume}
  minimumValue={0}
  maximumValue={100}
  step={1}
/>

// Native picker
<Picker
  selectedValue={selected}
  onValueChange={setSelected}
  items={[
    { label: 'Option A', value: 'a' },
    { label: 'Option B', value: 'b' },
  ]}
/>

// Context menu (long press)
<ContextMenu
  items={[
    { title: 'Copy', systemIcon: 'doc.on.doc' },
    { title: 'Delete', systemIcon: 'trash', destructive: true },
  ]}
  onItemPress={(e) => console.log(e.nativeEvent)}
>
  <View><Text>Long press me</Text></View>
</ContextMenu>
```

**Status:** Experimental. Components render native platform UI — looks different on iOS vs Android by design. API will change.

### SDK 54 Additions

- Liquid Glass modifiers (iOS 26)
- Additional form controls

---

## expo-widgets (Alpha — SDK 55+)

iOS home screen widgets and Live Activities using Expo UI.

```tsx
// widgets/MyWidget.tsx
import { Text, View } from 'expo-ui';

export function MyWidget({ data }) {
  return (
    <View style={{ padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{data.title}</Text>
      <Text>{data.subtitle}</Text>
    </View>
  );
}
```

**Status:** Alpha. iOS only. Requires config plugin setup. API is very early and will change significantly.

---

## WebGPU + Three.js (Experimental)

3D graphics on React Native using WebGPU and Three.js via `expo-gl`.

```tsx
import { GLView } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';

function Scene() {
  const onContextCreate = async (gl) => {
    const renderer = new Renderer({ gl });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, gl.drawingBufferWidth / gl.drawingBufferHeight);
    camera.position.z = 5;

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    const animate = () => {
      requestAnimationFrame(animate);
      cube.rotation.x += 0.01;
      cube.rotation.y += 0.01;
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    animate();
  };

  return <GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />;
}
```

**Status:** Experimental. WebGPU is the future replacement for expo-gl's OpenGL backend.

---

## CSS Gradients (Experimental — New Architecture only)

```tsx
// experimental_backgroundImage for CSS gradients
const styles = StyleSheet.create({
  gradient: {
    experimental_backgroundImage: 'linear-gradient(to bottom, #667eea 0%, #764ba2 100%)',
    padding: 20,
    borderRadius: 16,
  },
  radial: {
    experimental_backgroundImage: 'radial-gradient(circle, #667eea, #764ba2)',
  },
});
```

**Requires:** New Architecture enabled (mandatory since RN 0.82).

---

## expo-brownfield (Stable — SDK 55+)

Integrate Expo into existing native iOS/Android apps.

```tsx
// In your existing native app, add Expo views
import { ExpoView } from 'expo-brownfield';

// Native side: present an Expo-powered screen
// within your existing UIKit/SwiftUI or Android app
```

**Use case:** You have an existing native app and want to add Expo-powered screens without a full rewrite. Replaces the old manual integration approach.

---

## expo-server (Stable — SDK 55+)

Server runtime adapters for Expo Router API routes. Replaces `@expo/server`.

```tsx
// Used internally by Expo Router when web.output = 'server'
// API routes in app/ directory use this under the hood

// app/api/hello+api.ts
export function GET(request: Request) {
  return Response.json({ message: 'Hello from Expo!' });
}

export function POST(request: Request) {
  const body = await request.json();
  return Response.json({ received: body });
}
```

**Note:** You don't import expo-server directly. It powers Expo Router's API routes when `web.output` is set to `'server'` in app.json.

---

## expo-background-task (Stable — SDK 53+, replaces expo-background-fetch)

Modern background tasks using WorkManager (Android) and BGTaskScheduler (iOS).

```tsx
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

const TASK_NAME = 'background-sync';

// 1. Define task in GLOBAL SCOPE (outside components)
TaskManager.defineTask(TASK_NAME, async () => {
  try {
    await syncData();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// 2. Register
await BackgroundTask.registerTaskAsync(TASK_NAME, {
  minimumInterval: 15 * 60, // 15 minutes minimum
});

// 3. Unregister
await BackgroundTask.unregisterTaskAsync(TASK_NAME);

// 4. Check availability
const status = await BackgroundTask.getStatusAsync();
// BackgroundTaskStatus.Available or .Restricted

// 5. Test in development
await BackgroundTask.triggerTaskWorkerForTestingAsync();
```

### Migration from expo-background-fetch

| expo-background-fetch                                   | expo-background-task                                       |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| `BackgroundFetch.registerTaskAsync`                     | `BackgroundTask.registerTaskAsync`                         |
| `BackgroundFetchResult.NewData / NoData / Failed`       | `BackgroundTaskResult.Success / Failed` (simplified)       |
| `BackgroundFetchStatus.Available / Restricted / Denied` | `BackgroundTaskStatus.Available / Restricted` (simplified) |
| `options.stopOnTerminate` (Android)                     | Removed — WorkManager handles automatically                |
| `options.startOnBoot` (Android)                         | Removed — WorkManager handles automatically                |
| N/A                                                     | `triggerTaskWorkerForTestingAsync()` — NEW dev testing     |

---

## expo-notifications (Updated — SDK 53+)

### Breaking Change: shouldShowBanner / shouldShowList

```tsx
import * as Notifications from 'expo-notifications';

// OLD (deprecated)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, // ❌ DEPRECATED
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// NEW
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, // ✅ heads-up banner
    shouldShowList: true, // ✅ notification center
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});
```

### Scheduling with Typed Triggers

```tsx
// Immediate
await Notifications.scheduleNotificationAsync({
  content: { title: 'Now', body: 'Immediate notification' },
  trigger: null,
});

// After delay (repeating)
await Notifications.scheduleNotificationAsync({
  content: { title: 'Reminder', body: 'Drink water' },
  trigger: {
    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
    seconds: 60 * 20,
    repeats: true,
  },
});

// Daily at specific time
await Notifications.scheduleNotificationAsync({
  content: { title: 'Morning', body: 'Good morning!' },
  trigger: {
    type: Notifications.SchedulableTriggerInputTypes.DAILY,
    hour: 8,
    minute: 0,
  },
});

// Weekly
await Notifications.scheduleNotificationAsync({
  content: { title: 'Weekly', body: 'Week review' },
  trigger: {
    type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
    weekday: 1, // Monday
    hour: 9,
    minute: 0,
  },
});
```

---

## expo-crypto (Updated — SDK 55+)

### New: AES-GCM Encryption/Decryption

```tsx
import * as Crypto from 'expo-crypto';

// Hashing (existing)
const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, 'data to hash');

// Random bytes (existing)
const bytes = await Crypto.getRandomBytesAsync(32);

// UUID (existing)
const uuid = Crypto.randomUUID();

// AES-GCM Encryption (NEW — SDK 55)
const key = await Crypto.generateKeyAsync('aes-gcm', { length: 256 });
const encrypted = await Crypto.encryptAsync(key, 'secret data');
const decrypted = await Crypto.decryptAsync(key, encrypted);
```

---

## Deprecated Packages

### expo-navigation-bar (Deprecated — SDK 55)

Most methods are now no-ops due to mandatory edge-to-edge on Android 16.

```tsx
// ❌ OLD — these no longer have effect on Android 16+
import * as NavigationBar from 'expo-navigation-bar';
NavigationBar.setBackgroundColorAsync('#000000');
NavigationBar.setButtonStyleAsync('light');
NavigationBar.setVisibilityAsync('hidden');

// ✅ NEW — edge-to-edge with safe area insets
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SystemBars } from 'react-native-edge-to-edge'; // SDK 53

function Screen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, paddingBottom: insets.bottom }}>
      {/* Content respects navigation bar area */}
      <Content />
    </View>
  );
}

// Control system bar appearance (replaces NavigationBar styling)
<SystemBars style="light" />  // light icons on dark background
<SystemBars style="dark" />   // dark icons on light background
```

**Migration summary:**

- Navigation bar color → handled automatically by edge-to-edge, use `SystemBars` for icon style
- Navigation bar visibility → no longer controllable on Android 16+, use `immersive` mode via `react-native-screens` if needed
- Bottom padding → `useSafeAreaInsets().bottom` from `react-native-safe-area-context`

### expo-av (Removed — SDK 55)

Fully removed. Use `expo-audio` + `expo-video`. See expo-media.md for migration.

### expo-background-fetch (Deprecated — SDK 53)

Use `expo-background-task`. See migration table above.

### expo-video-thumbnails (Removed — SDK 55)

Use `expo-video`'s `generateThumbnailsAsync` method instead.

### expo-status-bar (Partially Deprecated — SDK 55)

Due to mandatory edge-to-edge on Android 16, some props are now no-ops:

```tsx
import { StatusBar } from 'expo-status-bar';

// ✅ Still works
<StatusBar style="light" />          // 'auto' | 'light' | 'dark'

// ❌ No-ops on Android 16+ (edge-to-edge)
<StatusBar translucent={true} />     // always translucent now
<StatusBar backgroundColor="#000" /> // ignored — use safe areas
```

### expo-constants deprecated fields

- `AppOwnership` enum → use `Constants.executionEnvironment`
- `Constants.platform.ios.model` → use `expo-device`
- `Constants.platform.android.versionCode` → use `expo-application`

See expo-device-services.md for full details.
