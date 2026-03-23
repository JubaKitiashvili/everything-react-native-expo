---
description: Expo device and service packages — location, notifications, constants, updates, haptics, blur, sensors, auth
globs: '**/*.{ts,tsx}'
alwaysApply: false
---

# Expo Device & Service Packages

## expo-location (Stable)

### Permissions

```tsx
import * as Location from 'expo-location';

// Hooks
const [status, requestPermission] = Location.useForegroundPermissions();
const [bgStatus, requestBgPermission] = Location.useBackgroundPermissions();

// Imperative
await Location.requestForegroundPermissionsAsync();
await Location.requestBackgroundPermissionsAsync();
// NOTE: Android 11+ opens system settings instead of in-app dialog for background
```

### Current Position

```tsx
const location = await Location.getCurrentPositionAsync({
  accuracy: Location.Accuracy.High,
});

const lastKnown = await Location.getLastKnownPositionAsync();

const subscription = await Location.watchPositionAsync(
  { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
  (location) => console.log(location.coords),
);
subscription.remove();
```

### Background Location

```tsx
import * as TaskManager from 'expo-task-manager';

const TASK = 'bg-location';
TaskManager.defineTask(TASK, ({ data, error }) => {
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
  }
});

await Location.startLocationUpdatesAsync(TASK, {
  accuracy: Location.Accuracy.Balanced,
  foregroundService: {
    // Android required
    notificationTitle: 'Tracking',
    notificationBody: 'Location tracking active',
  },
  activityType: Location.ActivityType.Fitness, // iOS
  showsBackgroundLocationIndicator: true, // iOS blue bar
});

await Location.stopLocationUpdatesAsync(TASK);
```

### Geofencing

```tsx
await Location.startGeofencingAsync('geofence-task', [
  { latitude: 37.7749, longitude: -122.4194, radius: 200, identifier: 'office' },
]);
```

### Geocoding

```tsx
const coords = await Location.geocodeAsync('1600 Amphitheatre Parkway');
const address = await Location.reverseGeocodeAsync({ latitude: 37.422, longitude: -122.084 });
// address[0].city, .country, .street, .postalCode, .region
```

### Accuracy Levels

| Accuracy                     | Precision      |
| ---------------------------- | -------------- |
| `Accuracy.Lowest`            | ~3000m         |
| `Accuracy.Low`               | ~1000m         |
| `Accuracy.Balanced`          | ~100m          |
| `Accuracy.High`              | ~10m           |
| `Accuracy.Highest`           | ~1m            |
| `Accuracy.BestForNavigation` | best + sensors |

---

## expo-constants (Stable)

```tsx
import Constants from 'expo-constants';

// App config
Constants.expoConfig?.name;
Constants.expoConfig?.version;
Constants.expoConfig?.extra?.apiUrl;

// EAS
Constants.easConfig?.projectId;

// Environment
Constants.executionEnvironment; // 'bare' | 'standalone' | 'storeClient'
Constants.isDevice; // true on physical device
Constants.debugMode;
Constants.sessionId; // unique per app launch

// Platform
Constants.platform?.ios?.buildNumber;
Constants.statusBarHeight;
Constants.systemFonts;
Constants.deviceName;
```

### SDK 55 Note

Expo now recommends `process.env.EXPO_PUBLIC_*` over `Constants.expoConfig.extra` for environment variables. The old approach still works.

### Deprecated Properties

- `AppOwnership` enum — use `Constants.executionEnvironment` instead
- `Constants.platform.ios.model` — use `expo-device` Device.modelName
- `Constants.platform.ios.platform` — use `expo-device`
- `Constants.platform.ios.systemVersion` — use `expo-device`
- `Constants.platform.android.versionCode` — use `expo-application`

---

## expo-updates (Stable)

### useUpdates Hook

```tsx
import * as Updates from 'expo-updates';

const {
  currentlyRunning, // { isEmbeddedLaunch, updateId, channel, runtimeVersion }
  isUpdateAvailable,
  isUpdatePending,
  isChecking,
  isDownloading,
  availableUpdate,
  downloadedUpdate,
  checkError,
  downloadError,
  initializationError,
  lastCheckForUpdateTimeSinceRestart,
} = Updates.useUpdates();
```

### Methods

```tsx
// Check for update
const result = await Updates.checkForUpdateAsync();
if (result.isAvailable) {
  const fetchResult = await Updates.fetchUpdateAsync();
  if (fetchResult.isNew) {
    await Updates.reloadAsync(); // reload with new update
  }
}

// Override update URL (for testing/preview)
Updates.setUpdateURLAndRequestHeadersOverride({
  url: 'https://u.expo.dev/{updateId}/group/{groupId}',
  requestHeaders: {},
});

// Extra params
await Updates.setExtraParamAsync('env', 'staging');
const params = await Updates.getExtraParamsAsync();

// Static properties
Updates.updateId;
Updates.channel;
Updates.runtimeVersion;
Updates.isEnabled;
Updates.isEmbeddedLaunch;
```

---

## expo-haptics (Stable)

```tsx
import * as Haptics from 'expo-haptics';

// Impact (physical collision feel)
await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);

// Notification
await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

// Selection (light tap)
await Haptics.selectionAsync();
```

---

## expo-blur (Stable — Android support in SDK 55)

```tsx
import { BlurView } from 'expo-blur';

<BlurView
  intensity={80} // 0-100
  tint="dark" // 'light' | 'dark' | 'default' | 'prominent'
  style={StyleSheet.absoluteFill}
>
  <Text>Content over blur</Text>
</BlurView>;
```

### SDK 55: Android Support

Android now has stable blur support but requires wrapping the blur target:

```tsx
import { BlurView, BlurTargetView } from 'expo-blur';

// Android: wrap the content you want to blur behind
<BlurTargetView style={{ flex: 1 }}>
  <Image source={backgroundImage} style={{ flex: 1 }} />
  <BlurView intensity={80} tint="dark" style={styles.overlay}>
    <Text>Blurred overlay</Text>
  </BlurView>
</BlurTargetView>;
```

---

## expo-auth-session (Stable)

```tsx
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

// Required for web redirect
WebBrowser.maybeCompleteAuthSession();

const discovery = AuthSession.useAutoDiscovery('https://accounts.google.com');
const redirectUri = AuthSession.makeRedirectUri({ scheme: 'myapp' });

const [request, response, promptAsync] = AuthSession.useAuthRequest(
  {
    clientId: 'YOUR_CLIENT_ID',
    scopes: ['openid', 'profile', 'email'],
    redirectUri,
  },
  discovery,
);

// Trigger auth flow
const result = await promptAsync();
if (result.type === 'success') {
  const { code } = result.params;
  // Exchange code for tokens
}
```

---

## expo-local-authentication (Stable)

```tsx
import * as LocalAuthentication from 'expo-local-authentication';

// Check support
const hasHardware = await LocalAuthentication.hasHardwareAsync();
const isEnrolled = await LocalAuthentication.isEnrolledAsync();
const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
// [AuthenticationType.FINGERPRINT, AuthenticationType.FACIAL_RECOGNITION, AuthenticationType.IRIS]

// Authenticate
const result = await LocalAuthentication.authenticateAsync({
  promptMessage: 'Verify your identity',
  cancelLabel: 'Cancel',
  disableDeviceFallback: false, // allow PIN/password fallback
  fallbackLabel: 'Use passcode',
});

if (result.success) {
  // Authenticated
}
```

---

## expo-sensors (Stable)

```tsx
import {
  Accelerometer,
  Barometer,
  DeviceMotion,
  Gyroscope,
  LightSensor,
  Magnetometer,
  Pedometer,
} from 'expo-sensors';

// All sensors follow the same pattern
Accelerometer.setUpdateInterval(100); // ms
const subscription = Accelerometer.addListener(({ x, y, z }) => {
  console.log(x, y, z);
});
subscription.remove();

// Check availability
const available = await Accelerometer.isAvailableAsync();

// Pedometer (special)
const isPedometerAvailable = await Pedometer.isAvailableAsync();
const pastSteps = await Pedometer.getStepCountAsync(startDate, endDate);
const sub = Pedometer.watchStepCount((result) => console.log(result.steps));
```

---

## expo-store-review (Stable)

```tsx
import * as StoreReview from 'expo-store-review';

const isAvailable = await StoreReview.isAvailableAsync();
if (isAvailable) {
  await StoreReview.requestReview();
}

// Check if the app has requested review before
const hasAction = await StoreReview.hasAction();
```

---

## expo-clipboard (Stable)

```tsx
import * as Clipboard from 'expo-clipboard';

// String
await Clipboard.setStringAsync('Hello');
const text = await Clipboard.getStringAsync();

// Image
await Clipboard.setImageAsync(base64Image);
const image = await Clipboard.getImageAsync({ format: 'png' });

// URL
const hasUrl = await Clipboard.hasUrlAsync();
const url = await Clipboard.getUrlAsync();

// Listen for changes
const subscription = Clipboard.addClipboardListener(({ contentTypes }) => {
  console.log('Clipboard changed:', contentTypes);
});
```
